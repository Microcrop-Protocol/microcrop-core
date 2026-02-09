import prisma from '../config/database.js';
import bcrypt from 'bcrypt';
import { generateApiKey, generateApiSecret, paginate } from '../utils/helpers.js';
import { NotFoundError, ConflictError, ValidationError } from '../utils/errors.js';
import logger from '../utils/logger.js';
import * as poolWriter from '../blockchain/writers/pool.writer.js';
import * as poolReader from '../blockchain/readers/pool.reader.js';

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

  async deployPool(orgId, poolConfig) {
    try {
      const org = await prisma.organization.findUnique({ where: { id: orgId } });
      if (!org) {
        throw new NotFoundError('Organization not found');
      }

      if (org.poolAddress) {
        throw new ConflictError('Organization already has a deployed pool');
      }

      // Validate required config
      const {
        name = `${org.name} Risk Pool`,
        symbol = 'MCPOOL',
        coverageType = 4, // COMPREHENSIVE
        region = 'Africa',
        poolType = 'PRIVATE',
        minDeposit = 100,
        maxDeposit = 1000000,
        targetCapital,
        maxCapital,
        memberContribution,
      } = poolConfig;

      if (!targetCapital) {
        throw new ValidationError('targetCapital is required');
      }

      const poolOwner = org.walletAddress || poolConfig.poolOwner;
      if (!poolOwner) {
        throw new ValidationError('Organization wallet address or poolOwner is required');
      }

      let result;

      // Deploy based on pool type
      if (poolType === 'PUBLIC') {
        result = await poolWriter.createPublicPool({
          name,
          symbol,
          coverageType,
          region,
          targetCapital,
          maxCapital: maxCapital || targetCapital * 2,
        });
      } else if (poolType === 'MUTUAL') {
        if (!memberContribution) {
          throw new ValidationError('memberContribution is required for mutual pools');
        }
        result = await poolWriter.createMutualPool({
          name,
          symbol,
          coverageType,
          region,
          poolOwner,
          memberContribution,
          targetCapital,
          maxCapital: maxCapital || targetCapital * 2,
        });
      } else {
        // Default to PRIVATE pool
        result = await poolWriter.createPrivatePool({
          name,
          symbol,
          coverageType,
          region,
          poolOwner,
          minDeposit,
          maxDeposit,
          targetCapital,
          maxCapital: maxCapital || targetCapital * 2,
        });
      }

      // Update organization with pool address
      const updated = await prisma.organization.update({
        where: { id: orgId },
        data: {
          poolAddress: result.poolAddress,
          poolDeployedAt: new Date(),
        },
      });

      logger.info('Pool deployed for organization', {
        orgId,
        poolAddress: result.poolAddress,
        poolId: result.poolId,
        txHash: result.txHash,
      });

      return {
        organization: updated,
        pool: result,
      };
    } catch (error) {
      logger.error('Failed to deploy pool', { orgId, error: error.message });
      throw error;
    }
  },

  async depositToPool(orgId, amount, investorAddress) {
    try {
      const org = await prisma.organization.findUnique({ where: { id: orgId } });
      if (!org) {
        throw new NotFoundError('Organization not found');
      }

      if (!org.poolAddress) {
        throw new ValidationError('Organization does not have a deployed pool');
      }

      const result = await poolWriter.depositToPool(org.poolAddress, amount, 0);

      // Update organization totals
      await prisma.organization.update({
        where: { id: orgId },
        data: {
          totalCapitalDeposited: {
            increment: parseFloat(amount),
          },
        },
      });

      logger.info('Deposit to pool successful', {
        orgId,
        poolAddress: org.poolAddress,
        amount,
        txHash: result.txHash,
      });

      return result;
    } catch (error) {
      logger.error('Failed to deposit to pool', { orgId, error: error.message });
      throw error;
    }
  },

  async withdrawFromPool(orgId, tokenAmount) {
    try {
      const org = await prisma.organization.findUnique({ where: { id: orgId } });
      if (!org) {
        throw new NotFoundError('Organization not found');
      }

      if (!org.poolAddress) {
        throw new ValidationError('Organization does not have a deployed pool');
      }

      const result = await poolWriter.withdrawFromPool(org.poolAddress, tokenAmount, 0);

      logger.info('Withdrawal from pool successful', {
        orgId,
        poolAddress: org.poolAddress,
        tokenAmount,
        usdcReceived: result.usdcReceived,
        txHash: result.txHash,
      });

      return result;
    } catch (error) {
      logger.error('Failed to withdraw from pool', { orgId, error: error.message });
      throw error;
    }
  },

  async addPoolDepositor(orgId, depositorAddress) {
    try {
      const org = await prisma.organization.findUnique({ where: { id: orgId } });
      if (!org) {
        throw new NotFoundError('Organization not found');
      }

      if (!org.poolAddress) {
        throw new ValidationError('Organization does not have a deployed pool');
      }

      const result = await poolWriter.addDepositor(org.poolAddress, depositorAddress);

      logger.info('Depositor added to pool', {
        orgId,
        poolAddress: org.poolAddress,
        depositorAddress,
        txHash: result.txHash,
      });

      return result;
    } catch (error) {
      logger.error('Failed to add depositor', { orgId, error: error.message });
      throw error;
    }
  },

  async removePoolDepositor(orgId, depositorAddress) {
    try {
      const org = await prisma.organization.findUnique({ where: { id: orgId } });
      if (!org) {
        throw new NotFoundError('Organization not found');
      }

      if (!org.poolAddress) {
        throw new ValidationError('Organization does not have a deployed pool');
      }

      const result = await poolWriter.removeDepositor(org.poolAddress, depositorAddress);

      logger.info('Depositor removed from pool', {
        orgId,
        poolAddress: org.poolAddress,
        depositorAddress,
        txHash: result.txHash,
      });

      return result;
    } catch (error) {
      logger.error('Failed to remove depositor', { orgId, error: error.message });
      throw error;
    }
  },

  async setPoolDepositsOpen(orgId, open) {
    try {
      const org = await prisma.organization.findUnique({ where: { id: orgId } });
      if (!org) {
        throw new NotFoundError('Organization not found');
      }

      if (!org.poolAddress) {
        throw new ValidationError('Organization does not have a deployed pool');
      }

      const result = await poolWriter.setDepositsOpen(org.poolAddress, open);

      logger.info('Pool deposits status updated', {
        orgId,
        poolAddress: org.poolAddress,
        depositsOpen: open,
        txHash: result.txHash,
      });

      return result;
    } catch (error) {
      logger.error('Failed to set deposits open', { orgId, error: error.message });
      throw error;
    }
  },

  async setPoolWithdrawalsOpen(orgId, open) {
    try {
      const org = await prisma.organization.findUnique({ where: { id: orgId } });
      if (!org) {
        throw new NotFoundError('Organization not found');
      }

      if (!org.poolAddress) {
        throw new ValidationError('Organization does not have a deployed pool');
      }

      const result = await poolWriter.setWithdrawalsOpen(org.poolAddress, open);

      logger.info('Pool withdrawals status updated', {
        orgId,
        poolAddress: org.poolAddress,
        withdrawalsOpen: open,
        txHash: result.txHash,
      });

      return result;
    } catch (error) {
      logger.error('Failed to set withdrawals open', { orgId, error: error.message });
      throw error;
    }
  },

  async getPoolDetails(orgId) {
    try {
      const org = await prisma.organization.findUnique({ where: { id: orgId } });
      if (!org) {
        throw new NotFoundError('Organization not found');
      }

      if (!org.poolAddress) {
        // Return empty pool details instead of error
        return {
          poolAddress: null,
          poolDeployed: false,
          message: 'Organization does not have a deployed pool yet',
          organizationId: orgId,
          organizationName: org.name,
          poolValue: '0',
          totalSupply: '0',
          tokenPrice: '1.00',
          totalPremiums: '0',
          totalPayouts: '0',
          activeExposure: '0',
          utilizationRate: 0,
        };
      }

      const details = await poolReader.getFullPoolDetails(org.poolAddress);

      return {
        ...details,
        poolDeployed: true,
        organizationId: orgId,
        organizationName: org.name,
      };
    } catch (error) {
      logger.error('Failed to get pool details', { orgId, error: error.message });
      throw error;
    }
  },

  async getPoolInvestorInfo(orgId, investorAddress) {
    try {
      const org = await prisma.organization.findUnique({ where: { id: orgId } });
      if (!org) {
        throw new NotFoundError('Organization not found');
      }

      if (!org.poolAddress) {
        throw new ValidationError('Organization does not have a deployed pool');
      }

      const info = await poolReader.getInvestorInfo(org.poolAddress, investorAddress);

      return info;
    } catch (error) {
      logger.error('Failed to get investor info', { orgId, error: error.message });
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
      logger.debug('Getting pool status', { organizationId });

      const org = await prisma.organization.findUnique({
        where: { id: organizationId },
      });

      if (!org) {
        logger.warn('Organization not found for pool status', { organizationId });
        throw new NotFoundError('Organization not found');
      }

      logger.debug('Organization found', { organizationId, poolAddress: org.poolAddress });

      if (!org.poolAddress) {
        logger.info('Organization does not have a deployed pool', { organizationId });
        // Return empty pool status instead of error
        return {
          poolAddress: null,
          poolDeployed: false,
          message: 'Organization does not have a deployed pool yet',
          poolValue: '0',
          totalSupply: '0',
          tokenPrice: '1.00',
          totalPremiums: '0',
          totalPayouts: '0',
          activeExposure: '0',
          utilizationRate: 0,
        };
      }

      // Try to get on-chain data, fallback to database
      try {
        const [summary, config] = await Promise.all([
          poolReader.getPoolSummary(org.poolAddress),
          poolReader.getPoolConfig(org.poolAddress),
        ]);

        return {
          poolAddress: org.poolAddress,
          // On-chain data
          poolValue: summary.poolValue,
          totalSupply: summary.totalSupply,
          tokenPrice: summary.tokenPrice,
          totalPremiums: summary.totalPremiums,
          totalPayouts: summary.totalPayouts,
          activeExposure: summary.activeExposure,
          // Config
          minDeposit: config.minDeposit,
          maxDeposit: config.maxDeposit,
          targetCapital: config.targetCapital,
          maxCapital: config.maxCapital,
          depositsOpen: config.depositsOpen,
          withdrawalsOpen: config.withdrawalsOpen,
          paused: config.paused,
          // Calculated
          utilizationRate: parseFloat(config.targetCapital) > 0
            ? (parseFloat(summary.activeExposure) / parseFloat(config.targetCapital)) * 100
            : 0,
          // Database totals (for historical reference)
          dbTotalCapitalDeposited: org.totalCapitalDeposited || 0,
          dbTotalPremiumsReceived: org.totalPremiumsReceived || 0,
          dbTotalPayoutsSent: org.totalPayoutsSent || 0,
        };
      } catch {
        // Fallback to database if blockchain call fails
        logger.warn('Failed to read on-chain pool data, using database', { organizationId });
        return {
          poolAddress: org.poolAddress,
          poolValue: String(org.totalCapitalDeposited || 0),
          totalPremiums: String(org.totalPremiumsReceived || 0),
          totalPayouts: String(org.totalPayoutsSent || 0),
          utilizationRate: org.totalCapitalDeposited
            ? parseFloat(
                (((org.totalPayoutsSent || 0) / org.totalCapitalDeposited) * 100).toFixed(2)
              )
            : 0,
        };
      }
    } catch (error) {
      logger.error('Failed to get pool status', { organizationId, error: error.message });
      throw error;
    }
  },
};

export default organizationService;
