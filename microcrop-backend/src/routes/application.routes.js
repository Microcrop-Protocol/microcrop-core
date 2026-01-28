import { Router } from 'express';
import { validate } from '../middleware/validate.middleware.js';
import { submitApplicationSchema } from '../validators/kyb.validator.js';
import { applicationController } from '../controllers/application.controller.js';
import Joi from 'joi';

const router = Router();

// Public endpoints (no authentication required)

// Submit a new organization application
router.post(
  '/',
  validate(submitApplicationSchema),
  applicationController.submit
);

// Check application status by email
router.get(
  '/status',
  validate(Joi.object({ email: Joi.string().email().required() }), 'query'),
  applicationController.getStatus
);

export const applicationRouter = router;
