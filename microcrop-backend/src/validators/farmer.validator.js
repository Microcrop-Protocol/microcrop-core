import Joi from 'joi';

export const registerFarmerSchema = Joi.object({
  phoneNumber: Joi.string()
    .pattern(/^\+254\d{9}$/)
    .required()
    .messages({
      'string.pattern.base': 'phoneNumber must be a valid Kenyan number (+254XXXXXXXXX)',
    }),
  nationalId: Joi.string().min(6).max(20).required(),
  firstName: Joi.string().required(),
  lastName: Joi.string().required(),
  county: Joi.string().required(),
  subCounty: Joi.string().required(),
  ward: Joi.string().optional(),
  village: Joi.string().optional(),
});

export const updateFarmerSchema = Joi.object({
  phoneNumber: Joi.string()
    .pattern(/^\+254\d{9}$/)
    .optional()
    .messages({
      'string.pattern.base': 'phoneNumber must be a valid Kenyan number (+254XXXXXXXXX)',
    }),
  ward: Joi.string().optional(),
  village: Joi.string().optional(),
});

export const updateKycSchema = Joi.object({
  status: Joi.string().valid('APPROVED', 'REJECTED').required(),
  reason: Joi.string().when('status', {
    is: 'REJECTED',
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
});

export const listFarmersSchema = Joi.object({
  page: Joi.number().integer().min(1).optional(),
  limit: Joi.number().integer().min(1).max(100).optional(),
  kycStatus: Joi.string().valid('PENDING', 'APPROVED', 'REJECTED').optional(),
  search: Joi.string().optional(),
  county: Joi.string().optional(),
});
