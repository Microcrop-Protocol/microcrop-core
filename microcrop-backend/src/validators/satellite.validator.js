import Joi from 'joi';

export const setBoundarySchema = Joi.object({
  boundary: Joi.object({
    type: Joi.string().valid('Polygon').required(),
    coordinates: Joi.array().items(
      Joi.array().items(
        Joi.array().ordered(
          Joi.number().min(-180).max(180).required(),
          Joi.number().min(-90).max(90).required()
        ).length(2)
      ).min(4)
    ).length(1).required()
  }).required(),
});

export const ndviQuerySchema = Joi.object({
  from: Joi.date().iso().optional(),
  to: Joi.date().iso().optional(),
  source: Joi.string().valid('SENTINEL2', 'PLANETSCOPE', 'MODIS').default('SENTINEL2'),
});

export const monitoringQuerySchema = Joi.object({
  from: Joi.date().iso().optional(),
  to: Joi.date().iso().optional(),
});

export const fraudFlagsQuerySchema = Joi.object({
  type: Joi.string().valid('NDVI_MISMATCH', 'BOUNDARY_OVERLAP', 'SUSPICIOUS_TIMING', 'HISTORICAL_ANOMALY').optional(),
  severity: Joi.string().valid('LOW', 'MEDIUM', 'HIGH', 'CRITICAL').optional(),
  status: Joi.string().valid('OPEN', 'INVESTIGATING', 'CONFIRMED_FRAUD', 'CLEARED', 'DISMISSED').optional(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
});

export const resolveFraudFlagSchema = Joi.object({
  status: Joi.string().valid('INVESTIGATING', 'CONFIRMED_FRAUD', 'CLEARED', 'DISMISSED').required(),
  resolution: Joi.string().max(1000).optional(),
});

export const paginationQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
});
