import Joi from 'joi';

// Organization Application Schemas
export const submitApplicationSchema = Joi.object({
  name: Joi.string().min(2).max(200).required(),
  registrationNumber: Joi.string().min(2).max(50).required(),
  type: Joi.string().valid('COOPERATIVE', 'NGO', 'MFI', 'INSURANCE_COMPANY', 'GOVERNMENT', 'OTHER').required(),
  contactFirstName: Joi.string().min(1).max(50).required(),
  contactLastName: Joi.string().min(1).max(50).required(),
  contactEmail: Joi.string().email().required(),
  contactPhone: Joi.string().pattern(/^\+?[1-9]\d{9,14}$/).required(),
  county: Joi.string().max(100).optional(),
  estimatedFarmers: Joi.number().integer().min(1).optional(),
  website: Joi.string().uri().optional(),
  description: Joi.string().max(1000).optional(),
});

export const updateApplicationStatusSchema = Joi.object({
  status: Joi.string().valid(
    'PENDING_REVIEW',
    'UNDER_REVIEW',
    'KYB_REQUIRED',
    'KYB_IN_PROGRESS',
    'KYB_SUBMITTED',
    'APPROVED',
    'REJECTED'
  ).required(),
  rejectionReason: Joi.string().max(500).when('status', {
    is: 'REJECTED',
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
});

// KYB Verification Schemas
export const initiateKYBSchema = Joi.object({
  applicationId: Joi.string().uuid().required(),
});

export const uploadDocumentSchema = Joi.object({
  documentType: Joi.string().valid(
    'BUSINESS_REGISTRATION',
    'TAX_CERTIFICATE',
    'DIRECTOR_ID',
    'PROOF_OF_ADDRESS',
    'BANK_STATEMENT',
    'OTHER'
  ).required(),
  fileName: Joi.string().max(255).required(),
  fileSize: Joi.number().integer().min(1).max(10485760).required(), // Max 10MB
  mimeType: Joi.string().valid(
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/jpg'
  ).required(),
});

export const verifyDocumentSchema = Joi.object({
  isVerified: Joi.boolean().required(),
  rejectionReason: Joi.string().max(500).when('isVerified', {
    is: false,
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
});

export const updateKYBStatusSchema = Joi.object({
  status: Joi.string().valid(
    'PENDING',
    'IN_PROGRESS',
    'DOCUMENTS_REQUIRED',
    'UNDER_REVIEW',
    'VERIFIED',
    'REJECTED'
  ).required(),
  verifierNotes: Joi.string().max(1000).optional(),
});

// Invitation Schemas
export const sendInvitationSchema = Joi.object({
  organizationId: Joi.string().uuid().required(),
  email: Joi.string().email().required(),
  firstName: Joi.string().min(1).max(50).required(),
  lastName: Joi.string().min(1).max(50).required(),
  phone: Joi.string().pattern(/^\+?[1-9]\d{9,14}$/).optional(),
});

export const acceptInvitationSchema = Joi.object({
  token: Joi.string().required(),
  password: Joi.string().min(8).max(100).required(),
});

// Query Schemas
export const applicationQuerySchema = Joi.object({
  status: Joi.string().valid(
    'PENDING_REVIEW',
    'UNDER_REVIEW',
    'KYB_REQUIRED',
    'KYB_IN_PROGRESS',
    'KYB_SUBMITTED',
    'APPROVED',
    'REJECTED'
  ).optional(),
  type: Joi.string().valid('COOPERATIVE', 'NGO', 'MFI', 'INSURANCE_COMPANY', 'GOVERNMENT', 'OTHER').optional(),
  search: Joi.string().max(100).optional(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
});

export const invitationQuerySchema = Joi.object({
  status: Joi.string().valid('PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED').optional(),
  organizationId: Joi.string().uuid().optional(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
});

export default {
  submitApplicationSchema,
  updateApplicationStatusSchema,
  initiateKYBSchema,
  uploadDocumentSchema,
  verifyDocumentSchema,
  updateKYBStatusSchema,
  sendInvitationSchema,
  acceptInvitationSchema,
  applicationQuerySchema,
  invitationQuerySchema,
};
