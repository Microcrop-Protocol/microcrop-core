import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import prisma from '../config/database.js';
import { NotFoundError, ValidationError, ForbiddenError } from '../utils/errors.js';
import logger from '../utils/logger.js';

const staffService = {
  async list(organizationId) {
    try {
      const staff = await prisma.user.findMany({
        where: {
          organizationId,
          role: { in: ['ORG_ADMIN', 'ORG_STAFF'] },
        },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          isActive: true,
          lastLogin: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      return staff;
    } catch (error) {
      logger.error('Failed to list staff', { organizationId, error: error.message });
      throw error;
    }
  },

  async invite(organizationId, data) {
    try {
      const existing = await prisma.user.findUnique({
        where: { email: data.email },
      });

      if (existing) {
        throw new ValidationError('A user with this email already exists');
      }

      const tempPassword = crypto.randomBytes(16).toString('hex');
      const hashedPassword = await bcrypt.hash(tempPassword, 12);

      const user = await prisma.user.create({
        data: {
          email: data.email,
          firstName: data.firstName,
          lastName: data.lastName,
          phone: data.phone || null,
          password: hashedPassword,
          role: data.role,
          organizationId,
          isActive: true,
        },
      });

      logger.info('Staff member invited', {
        organizationId,
        userId: user.id,
        email: user.email,
        role: user.role,
      });

      const { password, ...userWithoutPassword } = user;
      return userWithoutPassword;
    } catch (error) {
      logger.error('Failed to invite staff', { organizationId, error: error.message });
      throw error;
    }
  },

  async changeRole(organizationId, userId, role) {
    try {
      const user = await prisma.user.findFirst({
        where: { id: userId, organizationId },
      });

      if (!user) {
        throw new NotFoundError('Staff member not found in this organization');
      }

      if (user.role === 'PLATFORM_ADMIN') {
        throw new ForbiddenError('Cannot change role of a platform admin');
      }

      const updated = await prisma.user.update({
        where: { id: userId },
        data: { role },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          isActive: true,
          lastLogin: true,
          createdAt: true,
        },
      });

      logger.info('Staff role changed', { organizationId, userId, newRole: role });

      return updated;
    } catch (error) {
      logger.error('Failed to change staff role', { organizationId, userId, error: error.message });
      throw error;
    }
  },

  async deactivate(organizationId, userId) {
    try {
      const user = await prisma.user.findFirst({
        where: { id: userId, organizationId },
      });

      if (!user) {
        throw new NotFoundError('Staff member not found in this organization');
      }

      const updated = await prisma.user.update({
        where: { id: userId },
        data: { isActive: false },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          isActive: true,
          lastLogin: true,
          createdAt: true,
        },
      });

      logger.info('Staff member deactivated', { organizationId, userId });

      return updated;
    } catch (error) {
      logger.error('Failed to deactivate staff', { organizationId, userId, error: error.message });
      throw error;
    }
  },

  async reactivate(organizationId, userId) {
    try {
      const user = await prisma.user.findFirst({
        where: { id: userId, organizationId },
      });

      if (!user) {
        throw new NotFoundError('Staff member not found in this organization');
      }

      const updated = await prisma.user.update({
        where: { id: userId },
        data: { isActive: true },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          isActive: true,
          lastLogin: true,
          createdAt: true,
        },
      });

      logger.info('Staff member reactivated', { organizationId, userId });

      return updated;
    } catch (error) {
      logger.error('Failed to reactivate staff', { organizationId, userId, error: error.message });
      throw error;
    }
  },
};

export default staffService;
