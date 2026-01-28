import { Router } from 'express';
import { validate } from '../middleware/validate.middleware.js';
import { acceptInvitationSchema } from '../validators/kyb.validator.js';
import { invitationController } from '../controllers/invitation.controller.js';

const router = Router();

// Public endpoints (no authentication required)

// Get invitation details by token
router.get('/:token', invitationController.getByToken);

// Accept invitation and create account
router.post(
  '/:token/accept',
  validate(acceptInvitationSchema),
  invitationController.accept
);

export const invitationRouter = router;
