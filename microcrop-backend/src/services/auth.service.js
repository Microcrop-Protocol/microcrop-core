import prisma from '../config/database.js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { env } from '../config/env.js';
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
