import Joi from 'joi';

export const inviteSchema = Joi.object({
  email: Joi.string().email().required(),
  firstName: Joi.string().min(2).max(50).required(),
  lastName: Joi.string().min(2).max(50).required(),
  phone: Joi.string().optional(),
  role: Joi.string().valid('ORG_ADMIN', 'ORG_STAFF').required(),
});

export const roleChangeSchema = Joi.object({
  role: Joi.string().valid('ORG_ADMIN', 'ORG_STAFF').required(),
});

export const bulkFarmerSchema = Joi.object({
  farmers: Joi.array().min(1).max(500).items(
    Joi.object({
      firstName: Joi.string().min(2).max(50).required(),
      lastName: Joi.string().min(2).max(50).required(),
      phoneNumber: Joi.string().required(),
      nationalId: Joi.string().required(),
      county: Joi.string().required(),
      subCounty: Joi.string().optional().allow(''),
      ward: Joi.string().optional().allow(''),
      village: Joi.string().optional().allow(''),
    })
  ).required(),
});

export const bulkPlotSchema = Joi.object({
  plots: Joi.array().min(1).max(500).items(
    Joi.object({
      farmerPhone: Joi.string().required(),
      plotName: Joi.string().required(),
      latitude: Joi.number().min(-90).max(90).required(),
      longitude: Joi.number().min(-180).max(180).required(),
      acreage: Joi.number().positive().required(),
      cropType: Joi.string().valid(
        'MAIZE', 'BEANS', 'RICE', 'SORGHUM', 'MILLET', 'VEGETABLES',
        'CASSAVA', 'SWEET_POTATO', 'BANANA', 'COFFEE', 'TEA', 'WHEAT',
        'BARLEY', 'POTATOES'
      ).required(),
    })
  ).required(),
});

export const cancelPolicySchema = Joi.object({
  reason: Joi.string().min(5).max(500).required(),
});

export const liquiditySchema = Joi.object({
  amount: Joi.number().positive().required(),
});

export const batchRetrySchema = Joi.object({
  payoutIds: Joi.array().items(Joi.string().uuid()).optional(),
  retryAllFailed: Joi.boolean().optional(),
}).or('payoutIds', 'retryAllFailed');
