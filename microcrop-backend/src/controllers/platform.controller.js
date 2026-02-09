import organizationService from '../services/organization.service.js';
import { formatResponse, formatPaginatedResponse } from '../utils/helpers.js';
import * as poolReader from '../blockchain/readers/pool.reader.js';
import * as poolWriter from '../blockchain/writers/pool.writer.js';
import * as treasuryReader from '../blockchain/readers/treasury.reader.js';
import logger from '../utils/logger.js';

export const platformController = {
  async registerOrg(req, res, next) {
    try {
      const result = await organizationService.registerOrganization(req.body);
      res.status(201).json(formatResponse(result));
    } catch (error) {
      next(error);
    }
  },

  async deployPool(req, res, next) {
    try {
      const result = await organizationService.deployPool(req.params.orgId, req.body.initialCapital);
      res.status(200).json(formatResponse(result));
    } catch (error) {
      next(error);
    }
  },

  async listOrgs(req, res, next) {
    try {
      const { page, limit, ...filters } = req.query;
      const result = await organizationService.listOrganizations(filters, { page, limit });
      res.status(200).json(formatPaginatedResponse(result.data, result.total, result.page, result.limit));
    } catch (error) {
      next(error);
    }
  },

  async getOrg(req, res, next) {
    try {
      const result = await organizationService.getOrganization(req.params.orgId);
      res.status(200).json(formatResponse(result));
    } catch (error) {
      next(error);
    }
  },

  async configureOrg(req, res, next) {
    try {
      const result = await organizationService.configureOrganization(req.params.orgId, req.body);
      res.status(200).json(formatResponse(result));
    } catch (error) {
      next(error);
    }
  },

  async activateOrg(req, res, next) {
    try {
      const result = await organizationService.activateOrganization(req.params.orgId);
      res.status(200).json(formatResponse(result));
    } catch (error) {
      next(error);
    }
  },

  async deactivateOrg(req, res, next) {
    try {
      const result = await organizationService.deactivateOrganization(req.params.orgId, req.body.reason);
      res.status(200).json(formatResponse(result));
    } catch (error) {
      next(error);
    }
  },

  async getAnalytics(req, res, next) {
    try {
      const result = await organizationService.getPlatformAnalytics(req.query.startDate, req.query.endDate);
      res.status(200).json(formatResponse(result));
    } catch (error) {
      next(error);
    }
  },

  async getOnboardingStatus(req, res, next) {
    try {
      const result = await organizationService.getOnboardingStatus(req.params.orgId);
      res.status(200).json(formatResponse(result));
    } catch (error) {
      next(error);
    }
  },

  // ============================================
  // GLOBAL POOL MANAGEMENT
  // ============================================
  async listAllPools(req, res, next) {
    try {
      logger.debug('Fetching all pools');
      const pools = await poolReader.getAllPools();
      logger.debug('Found pools', { count: pools.length });

      const poolDetails = await Promise.all(
        pools.slice(0, 50).map(async (address) => {
          try {
            return await poolReader.getFullPoolDetails(address);
          } catch (err) {
            logger.warn('Failed to fetch pool details', { address, error: err.message });
            return { address, error: 'Failed to fetch details' };
          }
        })
      );
      res.status(200).json(formatResponse({ total: pools.length, pools: poolDetails }));
    } catch (error) {
      logger.error('listAllPools error', { error: error.message, stack: error.stack });
      next(error);
    }
  },

  async getPoolCounts(req, res, next) {
    try {
      logger.debug('Fetching pool counts');
      const [total, byType] = await Promise.all([
        poolReader.getPoolCount(),
        poolReader.getPoolCountsByType(),
      ]);
      logger.debug('Pool counts fetched', { total, byType });
      res.status(200).json(formatResponse({ total, ...byType }));
    } catch (error) {
      logger.error('getPoolCounts error', { error: error.message, stack: error.stack });
      next(error);
    }
  },

  async getPoolByAddress(req, res, next) {
    try {
      const details = await poolReader.getFullPoolDetails(req.params.poolAddress);
      res.status(200).json(formatResponse(details));
    } catch (error) {
      next(error);
    }
  },

  async getPoolMetadata(req, res, next) {
    try {
      const metadata = await poolReader.getPoolMetadata(req.params.poolId);
      res.status(200).json(formatResponse(metadata));
    } catch (error) {
      next(error);
    }
  },

  async createPublicPool(req, res, next) {
    try {
      const result = await poolWriter.createPublicPool(req.body);
      res.status(201).json(formatResponse(result));
    } catch (error) {
      next(error);
    }
  },

  // ============================================
  // TREASURY MANAGEMENT
  // ============================================
  async getTreasuryStats(req, res, next) {
    try {
      logger.debug('Fetching treasury stats');
      const stats = await treasuryReader.getTreasuryStats();
      logger.debug('Treasury stats fetched', { balance: stats.balance });
      res.status(200).json(formatResponse(stats));
    } catch (error) {
      logger.error('getTreasuryStats error', { error: error.message, stack: error.stack });
      next(error);
    }
  },

  async getTreasuryBalance(req, res, next) {
    try {
      logger.debug('Fetching treasury balance');
      const balance = await treasuryReader.getBalance();
      logger.debug('Treasury balance fetched', { balance });
      res.status(200).json(formatResponse({ balance }));
    } catch (error) {
      logger.error('getTreasuryBalance error', { error: error.message, stack: error.stack });
      next(error);
    }
  },

  async checkPolicyPremium(req, res, next) {
    try {
      const received = await treasuryReader.isPremiumReceived(req.params.policyId);
      res.status(200).json(formatResponse({ policyId: req.params.policyId, premiumReceived: received }));
    } catch (error) {
      next(error);
    }
  },

  async checkPolicyPayout(req, res, next) {
    try {
      const processed = await treasuryReader.isPayoutProcessed(req.params.policyId);
      res.status(200).json(formatResponse({ policyId: req.params.policyId, payoutProcessed: processed }));
    } catch (error) {
      next(error);
    }
  },
};

export default platformController;
