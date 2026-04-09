import crypto from 'crypto';
import prisma from '../config/database.js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { env } from '../config/env.js';
import redis from '../config/redis.js';
import logger from '../utils/logger.js';
import emailService from './email.service.js';
import { ConflictError, ForbiddenError, NotFoundError, UnauthorizedError } from '../utils/errors.js';

const REFRESH_TOKEN_TTL = 7 * 24 * 60 * 60; // 7 days in seconds
const LOGIN_LOCKOUT_TTL = 15 * 60; // 15 minutes in seconds
const LOGIN_MAX_ATTEMPTS = 10;

function excludePassword(user) {
  const { password, ...userWithoutPassword } = user;
  return userWithoutPassword;
}

function generateTokens(user) {
  const tokenId = uuidv4();

  const accessToken = jwt.sign(
    {
      userId: user.id,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId,
    },
    env.jwtSecret,
    { expiresIn: '1h' },
  );

  const refreshToken = jwt.sign(
    { userId: user.id, tokenId },
    env.jwtRefreshSecret,
    { expiresIn: '7d' },
  );

  return { accessToken, refreshToken, tokenId };
}

async function storeRefreshToken(userId, tokenId) {
  const key = `refresh:${userId}:${tokenId}`;
  await redis.set(key, '1', 'EX', REFRESH_TOKEN_TTL);
}

async function deleteRefreshToken(userId, tokenId) {
  const key = `refresh:${userId}:${tokenId}`;
  await redis.del(key);
}

async function refreshTokenExists(userId, tokenId) {
  const key = `refresh:${userId}:${tokenId}`;
  return (await redis.exists(key)) === 1;
}

export const authService = {
  async register(data) {
    const { email, password, firstName, lastName, phone, role, organizationId } = data;

    if (role === 'PLATFORM_ADMIN') {
      throw new ForbiddenError('Cannot register as PLATFORM_ADMIN');
    }

    const existing = await prisma.user.findUnique({
      where: { email },
    });

    if (existing) {
      throw new ConflictError('A user with this email already exists');
    }

    if (role === 'ORG_ADMIN' || role === 'ORG_STAFF') {
      const organization = await prisma.organization.findUnique({
        where: { id: organizationId },
      });

      if (!organization) {
        throw new NotFoundError('Organization not found');
      }
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        firstName,
        lastName,
        phone,
        role,
        organizationId,
      },
    });

    const { accessToken, refreshToken, tokenId } = generateTokens(user);
    await storeRefreshToken(user.id, tokenId);

    emailService.sendWelcome(user.email, user.name).catch((err) =>
      logger.error('Failed to send welcome email', { email: user.email, error: err.message })
    );

    return {
      user: excludePassword(user),
      accessToken,
      refreshToken,
    };
  },

  async login(email, password) {
    const failedKey = `login:failed:${email}`;

    // Check account lockout
    const attempts = await redis.get(failedKey);
    if (attempts && parseInt(attempts, 10) >= LOGIN_MAX_ATTEMPTS) {
      throw new ForbiddenError('Account temporarily locked. Please try again in 15 minutes');
    }

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      // Increment failed attempts even for non-existent users to prevent enumeration
      const pipeline = redis.pipeline();
      pipeline.incr(failedKey);
      pipeline.expire(failedKey, LOGIN_LOCKOUT_TTL);
      await pipeline.exec();
      throw new UnauthorizedError('Invalid email or password');
    }

    const match = await bcrypt.compare(password, user.password);

    if (!match) {
      const pipeline = redis.pipeline();
      pipeline.incr(failedKey);
      pipeline.expire(failedKey, LOGIN_LOCKOUT_TTL);
      await pipeline.exec();
      throw new UnauthorizedError('Invalid email or password');
    }

    // Successful login — clear failed attempts
    await redis.del(failedKey);

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date() },
    });

    const { accessToken, refreshToken, tokenId } = generateTokens(user);
    await storeRefreshToken(user.id, tokenId);

    return {
      user: excludePassword(user),
      accessToken,
      refreshToken,
    };
  },

  async refreshToken(token) {
    let decoded;
    try {
      decoded = jwt.verify(token, env.jwtRefreshSecret);
    } catch {
      throw new UnauthorizedError('Invalid or expired refresh token');
    }

    // Validate the refresh token exists in Redis
    if (!decoded.tokenId || !(await refreshTokenExists(decoded.userId, decoded.tokenId))) {
      throw new UnauthorizedError('Refresh token has been revoked');
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedError('User not found or inactive');
    }

    // Delete old refresh token and issue new tokens
    await deleteRefreshToken(decoded.userId, decoded.tokenId);
    const { accessToken, refreshToken: newRefreshToken, tokenId } = generateTokens(user);
    await storeRefreshToken(user.id, tokenId);

    return { accessToken, refreshToken: newRefreshToken };
  },

  async forgotPassword(email, resetBaseUrl) {
    const user = await prisma.user.findUnique({ where: { email } });

    if (user) {
      const rawToken = crypto.randomBytes(32).toString('hex');
      const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');

      await prisma.user.update({
        where: { id: user.id },
        data: {
          resetToken: hashedToken,
          resetTokenExpiry: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
        },
      });

      emailService.sendPasswordReset(email, rawToken, resetBaseUrl).catch((err) =>
        logger.error('Failed to send password reset email', { email, error: err.message })
      );
    }

    // Always return same response to prevent email enumeration
    return { message: 'If an account exists with that email, a reset link has been sent' };
  },

  async resetPassword(token, newPassword) {
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const user = await prisma.user.findFirst({
      where: {
        resetToken: hashedToken,
        resetTokenExpiry: { gt: new Date() },
      },
    });

    if (!user) {
      throw new NotFoundError('Invalid or expired reset token');
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          password: hashedPassword,
          resetToken: null,
          resetTokenExpiry: null,
        },
      });
    });

    return { message: 'Password reset successful' };
  },

  async logout(userId, tokenId) {
    await deleteRefreshToken(userId, tokenId);
    return { message: 'Logged out successfully' };
  },

  async getMe(userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { organization: true },
    });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    return excludePassword(user);
  },
};

export default authService;
