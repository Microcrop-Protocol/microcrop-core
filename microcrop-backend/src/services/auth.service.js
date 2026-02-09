import crypto from 'crypto';
import prisma from '../config/database.js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { env } from '../config/env.js';
import logger from '../utils/logger.js';
import emailService from './email.service.js';
import { ConflictError, NotFoundError, UnauthorizedError } from '../utils/errors.js';

function excludePassword(user) {
  const { password, ...userWithoutPassword } = user;
  return userWithoutPassword;
}

function generateTokens(user) {
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
    { userId: user.id },
    env.jwtRefreshSecret,
    { expiresIn: '7d' },
  );

  return { accessToken, refreshToken };
}

export const authService = {
  async register(data) {
    const existing = await prisma.user.findUnique({
      where: { email: data.email },
    });

    if (existing) {
      throw new ConflictError('A user with this email already exists');
    }

    if (data.role === 'ORG_ADMIN' || data.role === 'ORG_STAFF') {
      const organization = await prisma.organization.findUnique({
        where: { id: data.organizationId },
      });

      if (!organization) {
        throw new NotFoundError('Organization not found');
      }
    }

    const hashedPassword = await bcrypt.hash(data.password, 12);

    const user = await prisma.user.create({
      data: {
        ...data,
        password: hashedPassword,
      },
    });

    const { accessToken, refreshToken } = generateTokens(user);

    return {
      user: excludePassword(user),
      accessToken,
      refreshToken,
    };
  },

  async login(email, password) {
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new UnauthorizedError('Invalid email or password');
    }

    const match = await bcrypt.compare(password, user.password);

    if (!match) {
      throw new UnauthorizedError('Invalid email or password');
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date() },
    });

    const { accessToken, refreshToken } = generateTokens(user);

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

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedError('User not found or inactive');
    }

    // Rotate: issue both a new access token and a new refresh token
    const { accessToken, refreshToken: newRefreshToken } = generateTokens(user);

    return { accessToken, refreshToken: newRefreshToken };
  },

  async forgotPassword(email) {
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

      emailService.sendPasswordReset(email, rawToken).catch((err) =>
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
