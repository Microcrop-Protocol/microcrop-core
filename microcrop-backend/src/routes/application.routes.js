import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { authorize } from '../middleware/authorize.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { applicationDocuments, handleUploadError } from '../middleware/upload.middleware.js';
import { applicationQuerySchema } from '../validators/kyb.validator.js';
import { applicationController } from '../controllers/application.controller.js';

const router = Router();

// ============================================
// PUBLIC ENDPOINTS
// ============================================

// Submit a new organization application with documents (multipart/form-data)
router.post(
  '/organization',
  applicationDocuments,
  handleUploadError,
  applicationController.submit
);

// ============================================
// PLATFORM ADMIN ENDPOINTS
// ============================================

router.use(authenticate, authorize('PLATFORM_ADMIN'));

// List all applications
router.get(
  '/organization',
  validate(applicationQuerySchema, 'query'),
  applicationController.list
);

// Get application by ID
router.get(
  '/organization/:id',
  applicationController.getById
);

// Verify/approve application
router.post(
  '/organization/:id/verify',
  applicationController.approve
);

export const applicationRouter = router;
