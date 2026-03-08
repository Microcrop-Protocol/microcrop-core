import Joi from 'joi';

export const createInsuranceUnitSchema = Joi.object({
  county: Joi.string().min(1).max(100).required(),
  subCounty: Joi.string().min(1).max(100).optional(),
  unitCode: Joi.string().min(1).max(50).required(),
  ndviBaselineLRLD: Joi.number().min(0).max(1).required(),
  ndviBaselineSRSD: Joi.number().min(0).max(1).required(),
  strikeLevelLRLD: Joi.number().min(0).max(1).required(),
  strikeLevelSRSD: Joi.number().min(0).max(1).required(),
  premiumRateLRLD: Joi.number().positive().required(),
  premiumRateSRSD: Joi.number().positive().required(),
  valuePerTLU: Joi.number().positive().default(15000),
  seasonalConfig: Joi.object().optional(),
});

export const updateInsuranceUnitSchema = Joi.object({
  county: Joi.string().min(1).max(100).optional(),
  subCounty: Joi.string().min(1).max(100).allow(null).optional(),
  ndviBaselineLRLD: Joi.number().min(0).max(1).optional(),
  ndviBaselineSRSD: Joi.number().min(0).max(1).optional(),
  strikeLevelLRLD: Joi.number().min(0).max(1).optional(),
  strikeLevelSRSD: Joi.number().min(0).max(1).optional(),
  premiumRateLRLD: Joi.number().positive().optional(),
  premiumRateSRSD: Joi.number().positive().optional(),
  valuePerTLU: Joi.number().positive().optional(),
  seasonalConfig: Joi.object().allow(null).optional(),
  isActive: Joi.boolean().optional(),
}).min(1);

export const listInsuranceUnitsSchema = Joi.object({
  page: Joi.number().integer().min(1).optional(),
  limit: Joi.number().integer().min(1).max(100).optional(),
  county: Joi.string().optional(),
  isActive: Joi.boolean().optional(),
});
