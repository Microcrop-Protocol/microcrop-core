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
  from: Joi.date().iso().optional().default(() => {
    const d = new Date();
    d.setDate(d.getDate() - 90);
    return d;
  }),
  to: Joi.date().iso().optional().default(() => new Date()),
  source: Joi.string().valid('SENTINEL2', 'PLANETSCOPE', 'MODIS').default('SENTINEL2'),
}).custom((value, helpers) => {
  const from = new Date(value.from);
  const to = new Date(value.to);

  if (from >= to) {
    return helpers.error('any.invalid', { message: '\'from\' date must be before \'to\' date' });
  }

  const diffMs = to.getTime() - from.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  if (diffDays > 365) {
    return helpers.error('any.invalid', { message: 'Date range must not exceed 365 days' });
  }

  return value;
}).messages({
  'any.invalid': '{{#message}}',
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
  status: Joi.string().valid(
    'RESOLVED_FALSE_POSITIVE',
    'RESOLVED_CONFIRMED',
    'RESOLVED_INCONCLUSIVE',
    'INVESTIGATING',
    'CONFIRMED_FRAUD',
    'CLEARED',
    'DISMISSED'
  ).required(),
  resolution: Joi.string().trim().min(1).max(1000).when('status', {
    is: Joi.string().valid('RESOLVED_FALSE_POSITIVE', 'RESOLVED_CONFIRMED', 'RESOLVED_INCONCLUSIVE'),
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
  resolvedBy: Joi.string().optional(),
});

export const paginationQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
});

export const gpsTrackSchema = Joi.object({
  points: Joi.array()
    .items(
      Joi.object({
        lat: Joi.number().min(-90).max(90).required(),
        lon: Joi.number().min(-180).max(180).required(),
        accuracy: Joi.number().positive().required(),
        timestamp: Joi.string().isoDate().required(),
      })
    )
    .min(4)
    .max(10000)
    .required(),
  accuracyThreshold: Joi.number().min(1).max(50).default(15),
});
