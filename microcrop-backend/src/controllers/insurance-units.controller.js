import insuranceUnitService from '../services/insurance-unit.service.js';
import { formatResponse, formatPaginatedResponse } from '../utils/helpers.js';

export const insuranceUnitsController = {
  async create(req, res, next) {
    try {
      const unit = await insuranceUnitService.create(req.body);
      res.status(201).json(formatResponse(unit));
    } catch (error) {
      next(error);
    }
  },

  async list(req, res, next) {
    try {
      const result = await insuranceUnitService.list(req.query);
      res.json(formatPaginatedResponse(result.data, result.total, result.page, result.limit));
    } catch (error) {
      next(error);
    }
  },

  async getById(req, res, next) {
    try {
      const unit = await insuranceUnitService.getById(req.params.id);
      res.json(formatResponse(unit));
    } catch (error) {
      next(error);
    }
  },

  async update(req, res, next) {
    try {
      const unit = await insuranceUnitService.update(req.params.id, req.body);
      res.json(formatResponse(unit));
    } catch (error) {
      next(error);
    }
  },
};
