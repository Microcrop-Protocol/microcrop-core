import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { loadOrganization } from '../middleware/organization.middleware.js';
import { authorize } from '../middleware/authorize.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { dateRangeSchema, paginatedDateRangeSchema, granularitySchema, activitySchema } from '../validators/dashboard.validator.js';
import { dashboardOrgController } from '../controllers/dashboard.org.controller.js';

const router = Router();

router.use(authenticate, loadOrganization, authorize('ORG_ADMIN', 'ORG_STAFF'));

router.get('/overview', validate(dateRangeSchema, 'query'), dashboardOrgController.getOverview);
router.get('/farmers', validate(paginatedDateRangeSchema, 'query'), dashboardOrgController.getFarmers);
router.get('/farmers/analytics', validate(granularitySchema, 'query'), dashboardOrgController.getFarmerAnalytics);
router.get('/policies', validate(dateRangeSchema, 'query'), dashboardOrgController.getPolicies);
router.get('/policies/analytics', validate(granularitySchema, 'query'), dashboardOrgController.getPolicyAnalytics);
router.get('/payouts', validate(paginatedDateRangeSchema, 'query'), dashboardOrgController.getPayouts);
router.get('/damage-assessments', validate(paginatedDateRangeSchema, 'query'), dashboardOrgController.getDamageAssessments);
router.get('/financials', validate(granularitySchema, 'query'), dashboardOrgController.getFinancials);
router.get('/plots', validate(paginatedDateRangeSchema, 'query'), dashboardOrgController.getPlots);
router.get('/activity', validate(activitySchema, 'query'), dashboardOrgController.getActivity);

export const dashboardOrgRouter = router;
