import Joi from 'joi';

export const registerOrgSchema = Joi.object({
  name: Joi.string().max(200).required(),
  registrationNumber: Joi.string().required(),
  type: Joi.string()
    .valid('COOPERATIVE', 'NGO', 'MFI', 'INSURANCE_COMPANY', 'GOVERNMENT', 'OTHER')
    .required(),
  brandName: Joi.string().required(),
  contactPerson: Joi.string().optional(),
  contactEmail: Joi.string().email().optional(),
  contactPhone: Joi.string().optional(),
  county: Joi.string().optional(),
  adminWallet: Joi.string()
    .pattern(/^0x[a-fA-F0-9]{40}$/)
    .optional()
    .messages({
      'string.pattern.base': 'adminWallet must be a valid Ethereum address',
    }),
});

export const deployPoolSchema = Joi.object({
  initialCapital: Joi.number().min(1000).required(),
});

export const configureOrgSchema = Joi.object({
  ussdShortCode: Joi.string().optional(),
  brandName: Joi.string().optional(),
  brandColor: Joi.string()
    .pattern(/^#[0-9a-fA-F]{6}$/)
    .optional()
    .messages({
      'string.pattern.base': 'brandColor must be a valid hex color (e.g. #FF5733)',
    }),
  logoUrl: Joi.string().uri().optional(),
  webhookUrl: Joi.string().uri().optional(),
});
