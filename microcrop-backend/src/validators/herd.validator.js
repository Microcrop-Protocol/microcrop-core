import Joi from 'joi';

export const createHerdSchema = Joi.object({
  farmerId: Joi.string().uuid().required(),
  name: Joi.string().min(1).max(100).required(),
  livestockType: Joi.string()
    .valid('CATTLE', 'GOAT', 'SHEEP', 'CAMEL', 'POULTRY')
    .required(),
  headCount: Joi.number().integer().min(1).max(100000).required(),
  estimatedValue: Joi.number().positive().required(),
  latitude: Joi.number().min(-90).max(90).required(),
  longitude: Joi.number().min(-180).max(180).required(),
  weatherStationId: Joi.string().optional(),
});

export const updateHerdSchema = Joi.object({
  name: Joi.string().min(1).max(100).optional(),
  headCount: Joi.number().integer().min(1).max(100000).optional(),
  estimatedValue: Joi.number().positive().optional(),
  latitude: Joi.number().min(-90).max(90).optional(),
  longitude: Joi.number().min(-180).max(180).optional(),
  weatherStationId: Joi.string().allow(null).optional(),
}).min(1);

export const listHerdsSchema = Joi.object({
  page: Joi.number().integer().min(1).optional(),
  limit: Joi.number().integer().min(1).max(100).optional(),
  livestockType: Joi.string()
    .valid('CATTLE', 'GOAT', 'SHEEP', 'CAMEL', 'POULTRY')
    .optional(),
  farmerId: Joi.string().uuid().optional(),
  search: Joi.string().optional(),
});
