import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { authorize } from '../middleware/authorize.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { dateRangeSchema, paginatedDateRangeSchema, granularitySchema, activitySchema } from '../validators/dashboard.validator.js';
import { dashboardPlatformController } from '../controllers/dashboard.platform.controller.js';

const router = Router();

router.use(authenticate, authorize('PLATFORM_ADMIN'));

router.get('/overview', validate(dateRangeSchema, 'query'), dashboardPlatformController.getOverview);
router.get('/organizations', validate(paginatedDateRangeSchema, 'query'), dashboardPlatformController.getOrganizations);
router.get('/organizations/:orgId/metrics', validate(dateRangeSchema, 'query'), dashboardPlatformController.getOrgMetrics);
router.get('/analytics/revenue', validate(granularitySchema, 'query'), dashboardPlatformController.getRevenueAnalytics);
router.get('/analytics/policies', validate(granularitySchema, 'query'), dashboardPlatformController.getPolicyAnalytics);
router.get('/analytics/farmers', validate(granularitySchema, 'query'), dashboardPlatformController.getFarmerAnalytics);
router.get('/analytics/payouts', validate(granularitySchema, 'query'), dashboardPlatformController.getPayoutAnalytics);
router.get('/analytics/damage-assessments', validate(paginatedDateRangeSchema, 'query'), dashboardPlatformController.getDamageAssessments);
router.get('/activity', validate(activitySchema, 'query'), dashboardPlatformController.getActivity);

export const dashboardPlatformRouter = router;
