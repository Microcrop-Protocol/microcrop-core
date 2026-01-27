import Joi from 'joi';

const CropType = [
  'MAIZE',
  'BEANS',
  'RICE',
  'SORGHUM',
  'MILLET',
  'VEGETABLES',
  'CASSAVA',
  'SWEET_POTATO',
  'BANANA',
  'COFFEE',
  'TEA',
  'WHEAT',
  'BARLEY',
  'POTATOES',
];

export const createPlotSchema = Joi.object({
  farmerId: Joi.string().uuid().required(),
  name: Joi.string().required(),
  latitude: Joi.number().min(-90).max(90).required(),
  longitude: Joi.number().min(-180).max(180).required(),
  acreage: Joi.number().positive().required(),
  cropType: Joi.string()
    .valid(...CropType)
    .required(),
  plantingDate: Joi.date().optional(),
});

export const listPlotsSchema = Joi.object({
  farmerId: Joi.string().uuid().optional(),
  page: Joi.number().integer().min(1).optional(),
  limit: Joi.number().integer().min(1).max(100).optional(),
});

export const quoteSchema = Joi.object({
  farmerId: Joi.string().uuid().required(),
  plotId: Joi.string().uuid().required(),
  sumInsured: Joi.number().min(1000).required(),
  coverageType: Joi.string().valid('DROUGHT', 'FLOOD', 'BOTH').required(),
  durationDays: Joi.number().integer().min(30).max(365).required(),
});

export const purchaseSchema = Joi.object({
  farmerId: Joi.string().uuid().required(),
  plotId: Joi.string().uuid().required(),
  sumInsured: Joi.number().min(1000).required(),
  coverageType: Joi.string().valid('DROUGHT', 'FLOOD', 'BOTH').required(),
  durationDays: Joi.number().integer().min(30).max(365).required(),
});
