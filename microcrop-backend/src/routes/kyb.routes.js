import { Router } from 'express';
import { validate } from '../middleware/validate.middleware.js';
import { uploadDocumentSchema } from '../validators/kyb.validator.js';
import { kybController } from '../controllers/kyb.controller.js';
import Joi from 'joi';

const router = Router();

// Semi-public endpoints (accessed via KYB ID, no auth but requires knowing the KYB ID)
// In production, these would have additional security (rate limiting, CAPTCHA, etc.)

// Get presigned URL for document upload
router.post(
  '/:kybId/upload-url',
  validate(uploadDocumentSchema),
  kybController.getUploadUrl
);

// Record uploaded document
router.post(
  '/:kybId/documents',
  validate(
    Joi.object({
      documentType: Joi.string().valid(
        'BUSINESS_REGISTRATION',
        'TAX_CERTIFICATE',
        'DIRECTOR_ID',
        'PROOF_OF_ADDRESS',
        'BANK_STATEMENT',
        'OTHER'
      ).required(),
      fileName: Joi.string().max(255).required(),
      fileUrl: Joi.string().uri().required(),
      fileSize: Joi.number().integer().min(1).required(),
      mimeType: Joi.string().required(),
    })
  ),
  kybController.recordDocument
);

// Get documents for a KYB verification
router.get('/:kybId/documents', kybController.getDocuments);

// Submit KYB for review
router.post('/:kybId/submit', kybController.submitForReview);

export const kybRouter = router;
