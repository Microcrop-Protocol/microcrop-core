import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { authorize } from '../middleware/authorize.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { registerOrgSchema, deployPoolSchema, configureOrgSchema } from '../validators/organization.validator.js';
import { platformController } from '../controllers/platform.controller.js';

const router = Router();

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
router.get('/analytics/revenue', platformController.getAnalytics);
router.get('/organizations/:orgId/onboarding-status', platformController.getOnboardingStatus);

export const platformRouter = router;
