import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { loadOrganization } from '../middleware/organization.middleware.js';
import { authorize } from '../middleware/authorize.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import {
  deployPoolSchema,
  depositPoolSchema,
  withdrawPoolSchema,
  depositorSchema,
  poolSettingsSchema,
} from '../validators/organization.validator.js';
import prisma from '../config/database.js';
import { formatResponse } from '../utils/helpers.js';
import organizationService from '../services/organization.service.js';
import logger from '../utils/logger.js';

const router = Router();

router.use(authenticate, loadOrganization);

// ============================================
// ORGANIZATION INFO
// ============================================
router.get('/me', async (req, res, next) => {
  try {
    res.status(200).json(formatResponse(req.organization));
  } catch (error) {
    next(error);
  }
});

router.get('/me/stats', async (req, res, next) => {
  try {
    const [farmerCount, policyCount, feeAggregate] = await Promise.all([
      prisma.farmer.count({ where: { organizationId: req.organization.id } }),
      prisma.policy.count({ where: { organizationId: req.organization.id } }),
      prisma.policy.aggregate({
        where: { organizationId: req.organization.id },
        _sum: { platformFee: true },
      }),
    ]);

    const stats = {
      totalFarmers: farmerCount,
      totalPolicies: policyCount,
      totalFees: feeAggregate._sum.platformFee || 0,
    };

    res.status(200).json(formatResponse(stats));
  } catch (error) {
    next(error);
  }
});

router.put('/me/settings', async (req, res, next) => {
  try {
    const { brandColor, webhookUrl, contactPhone } = req.body;
    const updated = await prisma.organization.update({
      where: { id: req.organization.id },
      data: {
        ...(brandColor !== undefined && { brandColor }),
        ...(webhookUrl !== undefined && { webhookUrl }),
        ...(contactPhone !== undefined && { contactPhone }),
      },
    });
    res.status(200).json(formatResponse(updated));
  } catch (error) {
    next(error);
  }
});

// ============================================
// POOL MANAGEMENT - Read Operations
// ============================================
router.get('/me/pool', async (req, res, next) => {
  try {
    logger.debug('GET /me/pool request', {
      organizationId: req.organization.id,
      userId: req.user?.id,
    });
    const result = await organizationService.getPoolStatus(req.organization.id);
    logger.debug('GET /me/pool response', { poolDeployed: result.poolDeployed });
    res.status(200).json(formatResponse(result));
  } catch (error) {
    logger.error('GET /me/pool error', {
      organizationId: req.organization?.id,
      error: error.message,
      stack: error.stack,
    });
    next(error);
  }
});

router.get('/me/pool/details', async (req, res, next) => {
  try {
    logger.debug('GET /me/pool/details request', {
      organizationId: req.organization.id,
      userId: req.user?.id,
    });
    const result = await organizationService.getPoolDetails(req.organization.id);
    logger.debug('GET /me/pool/details response', { poolDeployed: result.poolDeployed });
    res.status(200).json(formatResponse(result));
  } catch (error) {
    logger.error('GET /me/pool/details error', {
      organizationId: req.organization?.id,
      error: error.message,
      stack: error.stack,
    });
    next(error);
  }
});

router.get('/me/pool/investor/:investorAddress', async (req, res, next) => {
  try {
    const result = await organizationService.getPoolInvestorInfo(
      req.organization.id,
      req.params.investorAddress
    );
    res.status(200).json(formatResponse(result));
  } catch (error) {
    next(error);
  }
});

// ============================================
// POOL MANAGEMENT - Write Operations (Admin only)
// ============================================

// Deploy a new pool for the organization
router.post(
  '/me/pool/deploy',
  authorize('ORG_ADMIN'),
  validate(deployPoolSchema),
  async (req, res, next) => {
    try {
      // Check if org already has a pool
      if (req.organization.poolAddress) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'POOL_ALREADY_EXISTS',
            message: 'Organization already has a deployed pool',
            poolAddress: req.organization.poolAddress,
          },
        });
      }

      // Use org's admin wallet as pool owner if not specified
      const poolConfig = {
        ...req.body,
        poolOwner: req.body.poolOwner || req.organization.adminWallet || req.user.walletAddress,
      };

      logger.info('Deploying pool for organization', {
        organizationId: req.organization.id,
        poolType: poolConfig.poolType,
        targetCapital: poolConfig.targetCapital,
      });

      const result = await organizationService.deployPool(req.organization.id, poolConfig);

      res.status(201).json(formatResponse(result));
    } catch (error) {
      logger.error('POST /me/pool/deploy error', {
        organizationId: req.organization?.id,
        error: error.message,
        stack: error.stack,
      });
      next(error);
    }
  }
);

router.post(
  '/me/pool/deposit',
  authorize('ORG_ADMIN'),
  validate(depositPoolSchema),
  async (req, res, next) => {
    try {
      if (!req.organization.poolAddress) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'POOL_NOT_DEPLOYED',
            message: 'Organization does not have a deployed pool. Please deploy a pool first.',
          },
        });
      }

      const { amount, minTokensOut } = req.body;
      const result = await organizationService.depositToPool(
        req.organization.id,
        amount,
        req.user.walletAddress
      );
      res.status(200).json(formatResponse(result));
    } catch (error) {
      logger.error('POST /me/pool/deposit error', {
        organizationId: req.organization?.id,
        error: error.message,
      });
      next(error);
    }
  }
);

router.post(
  '/me/pool/withdraw',
  authorize('ORG_ADMIN'),
  validate(withdrawPoolSchema),
  async (req, res, next) => {
    try {
      if (!req.organization.poolAddress) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'POOL_NOT_DEPLOYED',
            message: 'Organization does not have a deployed pool. Please deploy a pool first.',
          },
        });
      }

      const { tokenAmount, minUsdcOut } = req.body;
      const result = await organizationService.withdrawFromPool(
        req.organization.id,
        tokenAmount
      );
      res.status(200).json(formatResponse(result));
    } catch (error) {
      logger.error('POST /me/pool/withdraw error', {
        organizationId: req.organization?.id,
        error: error.message,
      });
      next(error);
    }
  }
);

router.post(
  '/me/pool/depositors',
  authorize('ORG_ADMIN'),
  validate(depositorSchema),
  async (req, res, next) => {
    try {
      if (!req.organization.poolAddress) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'POOL_NOT_DEPLOYED',
            message: 'Organization does not have a deployed pool. Please deploy a pool first.',
          },
        });
      }

      const { depositorAddress } = req.body;
      const result = await organizationService.addPoolDepositor(
        req.organization.id,
        depositorAddress
      );
      res.status(200).json(formatResponse(result));
    } catch (error) {
      logger.error('POST /me/pool/depositors error', {
        organizationId: req.organization?.id,
        error: error.message,
      });
      next(error);
    }
  }
);

router.delete(
  '/me/pool/depositors/:depositorAddress',
  authorize('ORG_ADMIN'),
  async (req, res, next) => {
    try {
      if (!req.organization.poolAddress) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'POOL_NOT_DEPLOYED',
            message: 'Organization does not have a deployed pool. Please deploy a pool first.',
          },
        });
      }

      const result = await organizationService.removePoolDepositor(
        req.organization.id,
        req.params.depositorAddress
      );
      res.status(200).json(formatResponse(result));
    } catch (error) {
      logger.error('DELETE /me/pool/depositors error', {
        organizationId: req.organization?.id,
        error: error.message,
      });
      next(error);
    }
  }
);

router.put(
  '/me/pool/settings',
  authorize('ORG_ADMIN'),
  validate(poolSettingsSchema),
  async (req, res, next) => {
    try {
      logger.debug('PUT /me/pool/settings request', {
        organizationId: req.organization.id,
        poolAddress: req.organization.poolAddress,
        body: req.body,
      });

      // Check if pool exists before trying to update settings
      if (!req.organization.poolAddress) {
        logger.warn('Attempted to update pool settings without deployed pool', {
          organizationId: req.organization.id,
        });
        return res.status(400).json({
          success: false,
          error: {
            code: 'POOL_NOT_DEPLOYED',
            message: 'Organization does not have a deployed pool. Please deploy a pool first.',
          },
        });
      }

      const { depositsOpen, withdrawalsOpen } = req.body;
      const results = {};

      if (depositsOpen !== undefined) {
        results.deposits = await organizationService.setPoolDepositsOpen(
          req.organization.id,
          depositsOpen
        );
      }

      if (withdrawalsOpen !== undefined) {
        results.withdrawals = await organizationService.setPoolWithdrawalsOpen(
          req.organization.id,
          withdrawalsOpen
        );
      }

      logger.debug('PUT /me/pool/settings response', { results });
      res.status(200).json(formatResponse(results));
    } catch (error) {
      logger.error('PUT /me/pool/settings error', {
        organizationId: req.organization?.id,
        error: error.message,
        stack: error.stack,
      });
      next(error);
    }
  }
);

export const organizationRouter = router;
