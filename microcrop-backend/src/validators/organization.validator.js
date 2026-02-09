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
  name: Joi.string().max(100).optional(),
  symbol: Joi.string().max(10).optional(),
  poolType: Joi.string().valid('PUBLIC', 'PRIVATE', 'MUTUAL').default('PRIVATE'),
  coverageType: Joi.number().min(0).max(4).default(4), // 0=DROUGHT, 1=FLOOD, 2=PEST, 3=DISEASE, 4=COMPREHENSIVE
  region: Joi.string().max(100).default('Africa'),
  poolOwner: Joi.string()
    .pattern(/^0x[a-fA-F0-9]{40}$/)
    .optional()
    .messages({
      'string.pattern.base': 'poolOwner must be a valid Ethereum address',
    }),
  minDeposit: Joi.number().min(1).default(100),
  maxDeposit: Joi.number().min(1).default(1000000),
  targetCapital: Joi.number().min(1000).required(),
  maxCapital: Joi.number().min(1000).optional(),
  memberContribution: Joi.number().min(1).optional(), // Required for MUTUAL pools
});

export const depositPoolSchema = Joi.object({
  amount: Joi.number().min(1).required(),
  minTokensOut: Joi.number().min(0).default(0),
});

export const withdrawPoolSchema = Joi.object({
  tokenAmount: Joi.number().min(0.000001).required(),
  minUsdcOut: Joi.number().min(0).default(0),
});

export const depositorSchema = Joi.object({
  depositorAddress: Joi.string()
    .pattern(/^0x[a-fA-F0-9]{40}$/)
    .required()
    .messages({
      'string.pattern.base': 'depositorAddress must be a valid Ethereum address',
    }),
});

export const poolSettingsSchema = Joi.object({
  depositsOpen: Joi.boolean().optional(),
  withdrawalsOpen: Joi.boolean().optional(),
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
