import prisma from '../config/database.js';
import bcrypt from 'bcrypt';
import { generateApiKey, generateApiSecret, paginate } from '../utils/helpers.js';
import { NotFoundError, ConflictError, ValidationError } from '../utils/errors.js';
import logger from '../utils/logger.js';

const organizationService = {
  async registerOrganization(data) {
    try {
      const apiKey = generateApiKey();
      const apiSecret = generateApiSecret();
      const hashedSecret = await bcrypt.hash(apiSecret, 12);

      const organization = await prisma.organization.create({
        data: {
          ...data,
          apiKey,
          apiSecret: hashedSecret,
          isActive: false,
        },
      });

      return {
        organization,
        apiKey,
        apiSecret, // plaintext - only time this is shown
      };
    } catch (error) {
      logger.error('Failed to register organization', { error: error.message });
      throw error;
    }
  },

  async deployPool(orgId, initialCapital) {
    try {
      const org = await prisma.organization.findUnique({ where: { id: orgId } });
      if (!org) {
        throw new NotFoundError('Organization not found');
      }

      // Blockchain integration will be added later.
      // In production, this calls riskPoolFactory.deployPool().
      logger.info('Pool deployment would happen here', { orgId, initialCapital });

      return {
        message: 'Pool deployment initiated',
        orgId,
        initialCapital,
      };
    } catch (error) {
      logger.error('Failed to deploy pool', { orgId, error: error.message });
      throw error;
    }
  },

  async configureOrganization(orgId, config) {
    try {
      const org = await prisma.organization.findUnique({ where: { id: orgId } });
      if (!org) {
        throw new NotFoundError('Organization not found');
      }

      if (config.ussdShortCode) {
        const existing = await prisma.organization.findUnique({
          where: { ussdShortCode: config.ussdShortCode },
        });
        if (existing && existing.id !== orgId) {
          throw new ConflictError('USSD short code already in use');
        }
      }

      const updated = await prisma.organization.update({
        where: { id: orgId },
        data: config,
      });

      return updated;
    } catch (error) {
      logger.error('Failed to configure organization', { orgId, error: error.message });
      throw error;
    }
  },

  async activateOrganization(orgId) {
    try {
      const org = await prisma.organization.update({
        where: { id: orgId },
        data: { isActive: true },
      });

      return org;
    } catch (error) {
      logger.error('Failed to activate organization', { orgId, error: error.message });
      throw error;
    }
  },

  async deactivateOrganization(orgId, reason) {
    try {
      const org = await prisma.organization.update({
        where: { id: orgId },
        data: { isActive: false },
      });

      logger.info('Organization deactivated', { orgId, reason });

      return org;
    } catch (error) {
      logger.error('Failed to deactivate organization', { orgId, error: error.message });
      throw error;
    }
  },

  async listOrganizations(filters = {}, pagination = {}) {
    try {
      const { skip, take, page, limit } = paginate(pagination.page, pagination.limit);

      const where = {};
      if (filters.type) where.type = filters.type;
      if (filters.isActive !== undefined) where.isActive = filters.isActive;

      const [organizations, total] = await Promise.all([
        prisma.organization.findMany({
          where,
          skip,
          take,
          include: {
            _count: {
              select: {
                farmers: true,
                policies: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        }),
        prisma.organization.count({ where }),
      ]);

      return { organizations, total };
    } catch (error) {
      logger.error('Failed to list organizations', { error: error.message });
      throw error;
    }
  },

  async getOrganization(orgId) {
    try {
      const org = await prisma.organization.findUnique({
        where: { id: orgId },
        include: {
          _count: {
            select: {
              farmers: true,
              policies: true,
              payouts: true,
              users: true,
            },
          },
        },
      });

      if (!org) {
        throw new NotFoundError('Organization not found');
      }

      return {
        ...org,
        stats: org._count,
      };
    } catch (error) {
      logger.error('Failed to get organization', { orgId, error: error.message });
      throw error;
    }
  },

  async getPlatformAnalytics(startDate, endDate) {
    try {
      const where = {
        collectedAt: {
          gte: startDate,
          lte: endDate,
        },
      };

      const byOrganization = await prisma.platformFee.groupBy({
        by: ['organizationId'],
        where,
        _sum: {
          feeAmount: true,
        },
      });

      const summary = await prisma.platformFee.aggregate({
        where,
        _sum: {
          feeAmount: true,
          premium: true,
        },
        _count: true,
      });

      return {
        summary: {
          totalFees: summary._sum.feeAmount,
          totalPremiums: summary._sum.premium,
          totalRecords: summary._count,
        },
        byOrganization,
      };
    } catch (error) {
      logger.error('Failed to get platform analytics', { error: error.message });
      throw error;
    }
  },

  async getOnboardingStatus(orgId) {
    try {
      const org = await prisma.organization.findUnique({
        where: { id: orgId },
        include: {
          _count: {
            select: {
              users: true,
            },
          },
        },
      });

      if (!org) {
        throw new NotFoundError('Organization not found');
      }

      const adminCount = await prisma.user.count({
        where: {
          organizationId: orgId,
          role: { in: ['ORG_ADMIN'] },
        },
      });

      const steps = {
        registered: true,
        configured: !!(org.brandName && org.contactPerson),
        poolDeployed: !!org.poolAddress,
        funded: org.poolAddress ? (org.totalCapitalDeposited || 0) > 0 : false,
        staffInvited: adminCount > 0,
        activated: org.isActive,
      };

      // Determine next step
      let nextStep = null;
      if (!steps.configured) nextStep = 'configure';
      else if (!steps.poolDeployed) nextStep = 'deploy_pool';
      else if (!steps.funded) nextStep = 'fund_pool';
      else if (!steps.staffInvited) nextStep = 'invite_staff';
      else if (!steps.activated) nextStep = 'activate';
      else nextStep = 'complete';

      return { organization: org, steps, nextStep };
    } catch (error) {
      logger.error('Failed to get onboarding status', { orgId, error: error.message });
      throw error;
    }
  },

  async getPoolStatus(organizationId) {
    try {
      const org = await prisma.organization.findUnique({
        where: { id: organizationId },
      });

      if (!org) {
        throw new NotFoundError('Organization not found');
      }

      if (!org.poolAddress) {
        throw new ValidationError('Organization does not have a deployed pool');
      }

      return {
        poolAddress: org.poolAddress,
        balance: org.totalCapitalDeposited || 0,
        totalCapitalDeposited: org.totalCapitalDeposited || 0,
        totalPremiumsReceived: org.totalPremiumsReceived || 0,
        totalPayoutsSent: org.totalPayoutsSent || 0,
        totalFeesPaid: org.totalFeesPaid || 0,
        utilizationRate: org.totalCapitalDeposited
          ? parseFloat(
              (((org.totalPayoutsSent || 0) / org.totalCapitalDeposited) * 100).toFixed(2)
            )
          : 0,
      };
    } catch (error) {
      logger.error('Failed to get pool status', { organizationId, error: error.message });
      throw error;
    }
  },
};

export default organizationService;
