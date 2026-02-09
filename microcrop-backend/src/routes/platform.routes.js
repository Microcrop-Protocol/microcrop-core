import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { authorize } from '../middleware/authorize.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { registerOrgSchema, deployPoolSchema, configureOrgSchema } from '../validators/organization.validator.js';
import { platformController } from '../controllers/platform.controller.js';
import logger from '../utils/logger.js';
import Joi from 'joi';

const router = Router();

// Request logging middleware for platform routes
router.use((req, _res, next) => {
  logger.debug('Platform API request', {
    method: req.method,
    path: req.path,
    userId: req.user?.id,
    userRole: req.user?.role,
  });
  next();
});

router.use(authenticate, authorize('PLATFORM_ADMIN'));

// ============================================
// ORGANIZATION MANAGEMENT
// ============================================
router.post('/organizations/register', validate(registerOrgSchema), platformController.registerOrg);
router.post('/organizations/:orgId/deploy-pool', validate(deployPoolSchema), platformController.deployPool);
router.get('/organizations', platformController.listOrgs);
router.get('/organizations/:orgId', platformController.getOrg);
router.put('/organizations/:orgId/configure', validate(configureOrgSchema), platformController.configureOrg);
router.post('/organizations/:orgId/activate', platformController.activateOrg);
router.post('/organizations/:orgId/deactivate', platformController.deactivateOrg);
router.get('/organizations/:orgId/onboarding-status', platformController.getOnboardingStatus);

// ============================================
// ANALYTICS
// ============================================
router.get('/analytics/revenue', platformController.getAnalytics);

// ============================================
// GLOBAL POOL MANAGEMENT
// ============================================
router.get('/pools', platformController.listAllPools);
router.get('/pools/counts', platformController.getPoolCounts);
router.get('/pools/address/:poolAddress', platformController.getPoolByAddress);
router.get('/pools/id/:poolId', platformController.getPoolMetadata);

// Create public pool (not tied to an org)
const createPublicPoolSchema = Joi.object({
  name: Joi.string().max(100).required(),
  symbol: Joi.string().max(10).required(),
  coverageType: Joi.number().min(0).max(4).default(4),
  region: Joi.string().max(100).required(),
  targetCapital: Joi.number().min(1000).required(),
  maxCapital: Joi.number().min(1000).required(),
});
router.post('/pools/public', validate(createPublicPoolSchema), platformController.createPublicPool);

// ============================================
// TREASURY MANAGEMENT
// ============================================
router.get('/treasury', platformController.getTreasuryStats);
router.get('/treasury/balance', platformController.getTreasuryBalance);
router.get('/treasury/premium/:policyId', platformController.checkPolicyPremium);
router.get('/treasury/payout/:policyId', platformController.checkPolicyPayout);

export const platformRouter = router;
