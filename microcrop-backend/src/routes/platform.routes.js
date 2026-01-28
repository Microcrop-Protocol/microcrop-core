import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { authorize } from '../middleware/authorize.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { registerOrgSchema, deployPoolSchema, configureOrgSchema } from '../validators/organization.validator.js';
import {
  applicationQuerySchema,
  updateApplicationStatusSchema,
  initiateKYBSchema,
  updateKYBStatusSchema,
  verifyDocumentSchema,
  sendInvitationSchema,
  invitationQuerySchema,
} from '../validators/kyb.validator.js';
import { platformController } from '../controllers/platform.controller.js';
import { applicationController } from '../controllers/application.controller.js';
import { kybController } from '../controllers/kyb.controller.js';
import { invitationController } from '../controllers/invitation.controller.js';

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

// ============================================
// APPLICATION MANAGEMENT
// ============================================
router.get('/applications/stats', applicationController.getStats);
router.get('/applications', validate(applicationQuerySchema, 'query'), applicationController.list);
router.get('/applications/:applicationId', applicationController.getById);
router.put('/applications/:applicationId/status', validate(updateApplicationStatusSchema), applicationController.updateStatus);
router.post('/applications/:applicationId/approve', applicationController.approve);

// ============================================
// KYB VERIFICATION MANAGEMENT
// ============================================
router.get('/kyb/stats', kybController.getStats);
router.post('/kyb/initiate', validate(initiateKYBSchema), kybController.initiate);
router.get('/kyb/:kybId', kybController.getById);
router.get('/kyb/application/:applicationId', kybController.getByApplicationId);
router.put('/kyb/:kybId/status', validate(updateKYBStatusSchema), kybController.updateStatus);
router.put('/kyb/documents/:documentId/verify', validate(verifyDocumentSchema), kybController.verifyDocument);

// ============================================
// INVITATION MANAGEMENT
// ============================================
router.get('/organizations/:orgId/invitations', validate(invitationQuerySchema, 'query'), invitationController.listByOrganization);
router.post('/organizations/:orgId/invitations', validate(sendInvitationSchema), invitationController.send);
router.delete('/organizations/:orgId/invitations/:invitationId', invitationController.revoke);
router.post('/organizations/:orgId/invitations/:invitationId/resend', invitationController.resend);

export const platformRouter = router;
