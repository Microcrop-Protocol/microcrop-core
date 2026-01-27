import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { loadOrganization } from '../middleware/organization.middleware.js';
import { authorize } from '../middleware/authorize.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { dateRangeSchema } from '../validators/dashboard.validator.js';
import { exportController } from '../controllers/export.controller.js';

const router = Router();

router.use(authenticate);

// Org-scoped exports (ORG_ADMIN)
router.get('/farmers', loadOrganization, authorize('ORG_ADMIN'), validate(dateRangeSchema, 'query'), exportController.exportFarmers);
router.get('/policies', loadOrganization, authorize('ORG_ADMIN'), validate(dateRangeSchema, 'query'), exportController.exportPolicies);
router.get('/payouts', loadOrganization, authorize('ORG_ADMIN'), validate(dateRangeSchema, 'query'), exportController.exportPayouts);
router.get('/transactions', loadOrganization, authorize('ORG_ADMIN'), validate(dateRangeSchema, 'query'), exportController.exportTransactions);

// Platform-wide exports (PLATFORM_ADMIN)
router.get('/platform/organizations', authorize('PLATFORM_ADMIN'), validate(dateRangeSchema, 'query'), exportController.exportPlatformOrganizations);
router.get('/platform/revenue', authorize('PLATFORM_ADMIN'), validate(dateRangeSchema, 'query'), exportController.exportPlatformRevenue);

export const exportRouter = router;
