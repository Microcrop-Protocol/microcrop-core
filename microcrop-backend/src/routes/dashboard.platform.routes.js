import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { authorize } from '../middleware/authorize.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { dateRangeSchema, paginatedDateRangeSchema, granularitySchema, activitySchema } from '../validators/dashboard.validator.js';
import { dashboardPlatformController } from '../controllers/dashboard.platform.controller.js';
import { ForbiddenError } from '../utils/errors.js';
import { ROLES } from '../utils/constants.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Middleware to allow org admins to access their own organization's metrics
function authorizeOrgMetricsAccess(req, _res, next) {
  // Platform admins can access any org's metrics
  if (req.user.role === ROLES.PLATFORM_ADMIN) {
    return next();
  }

  // Org admins/staff can only access their own organization's metrics
  if (
    (req.user.role === ROLES.ORG_ADMIN || req.user.role === ROLES.ORG_STAFF) &&
    req.user.organizationId === req.params.orgId
  ) {
    return next();
  }

  next(new ForbiddenError('Insufficient permissions'));
}

// Platform admin only routes
router.get('/overview', authorize('PLATFORM_ADMIN'), validate(dateRangeSchema, 'query'), dashboardPlatformController.getOverview);
router.get('/organizations', authorize('PLATFORM_ADMIN'), validate(paginatedDateRangeSchema, 'query'), dashboardPlatformController.getOrganizations);

// Org metrics - accessible by platform admin OR org admin viewing their own org
router.get('/organizations/:orgId/metrics', authorizeOrgMetricsAccess, validate(dateRangeSchema, 'query'), dashboardPlatformController.getOrgMetrics);
// Platform admin only analytics routes
router.get('/analytics/revenue', authorize('PLATFORM_ADMIN'), validate(granularitySchema, 'query'), dashboardPlatformController.getRevenueAnalytics);
router.get('/analytics/policies', authorize('PLATFORM_ADMIN'), validate(granularitySchema, 'query'), dashboardPlatformController.getPolicyAnalytics);
router.get('/analytics/farmers', authorize('PLATFORM_ADMIN'), validate(granularitySchema, 'query'), dashboardPlatformController.getFarmerAnalytics);
router.get('/analytics/payouts', authorize('PLATFORM_ADMIN'), validate(granularitySchema, 'query'), dashboardPlatformController.getPayoutAnalytics);
router.get('/analytics/damage-assessments', authorize('PLATFORM_ADMIN'), validate(paginatedDateRangeSchema, 'query'), dashboardPlatformController.getDamageAssessments);
router.get('/activity', authorize('PLATFORM_ADMIN'), validate(activitySchema, 'query'), dashboardPlatformController.getActivity);

export const dashboardPlatformRouter = router;
