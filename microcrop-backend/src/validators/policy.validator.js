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

export const updatePlotSchema = Joi.object({
  name: Joi.string().optional(),
  cropType: Joi.string()
    .valid(...CropType)
    .optional(),
  plantingDate: Joi.date().optional(),
  acreage: Joi.number().positive().optional(),
}).min(1).messages({
  'object.min': 'At least one field must be provided for update',
});

export const plotIdParamSchema = Joi.object({
  plotId: Joi.string().uuid().required(),
});

export const listPlotsSchema = Joi.object({
  farmerId: Joi.string().uuid().optional(),
  page: Joi.number().integer().min(1).optional(),
  limit: Joi.number().integer().min(1).max(100).optional(),
});

const allCoverageTypes = [
  'DROUGHT', 'FLOOD', 'BOTH', 'COMPREHENSIVE',
  'LIVESTOCK_DROUGHT', 'LIVESTOCK_DISEASE', 'LIVESTOCK_COMPREHENSIVE',
];

export const quoteSchema = Joi.object({
  farmerId: Joi.string().uuid().required(),
  productType: Joi.string().valid('CROP', 'LIVESTOCK').default('CROP'),
  plotId: Joi.string().uuid().when('productType', {
    is: 'CROP',
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
  herdId: Joi.string().uuid().when('productType', {
    is: 'LIVESTOCK',
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
  season: Joi.string().valid('LRLD', 'SRSD').when('productType', {
    is: 'LIVESTOCK',
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
  // sumInsured auto-calculated for IBLI livestock, required for crop
  sumInsured: Joi.number().min(1000).when('productType', {
    is: 'CROP',
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
  coverageType: Joi.string().valid(...allCoverageTypes).when('productType', {
    is: 'CROP',
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
  durationDays: Joi.number().integer().min(30).max(365).when('productType', {
    is: 'CROP',
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
});

export const purchaseSchema = Joi.object({
  farmerId: Joi.string().uuid().required(),
  productType: Joi.string().valid('CROP', 'LIVESTOCK').default('CROP'),
  plotId: Joi.string().uuid().when('productType', {
    is: 'CROP',
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
  herdId: Joi.string().uuid().when('productType', {
    is: 'LIVESTOCK',
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
  season: Joi.string().valid('LRLD', 'SRSD').when('productType', {
    is: 'LIVESTOCK',
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
  sumInsured: Joi.number().min(1000).when('productType', {
    is: 'CROP',
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
  coverageType: Joi.string().valid(...allCoverageTypes).when('productType', {
    is: 'CROP',
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
  durationDays: Joi.number().integer().min(30).max(365).when('productType', {
    is: 'CROP',
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
});
