import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { authorize } from '../middleware/authorize.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { sendInvitationSchema, acceptInvitationSchema, invitationQuerySchema } from '../validators/kyb.validator.js';
import { invitationController } from '../controllers/invitation.controller.js';

const router = Router();

// ============================================
// PUBLIC ENDPOINTS
// ============================================

// Validate invitation token
router.get('/validate/:token', invitationController.getByToken);

// Accept invitation and create account
router.post('/accept', validate(acceptInvitationSchema), invitationController.accept);

// ============================================
// PLATFORM ADMIN ENDPOINTS
// ============================================

router.use(authenticate, authorize('PLATFORM_ADMIN'));

// List all invitations
router.get('/', validate(invitationQuerySchema, 'query'), invitationController.list);

// Create a new invitation
router.post('/', validate(sendInvitationSchema), invitationController.create);

// Send/resend invitation email
router.post('/:id/send', invitationController.send);

export const invitationRouter = router;
