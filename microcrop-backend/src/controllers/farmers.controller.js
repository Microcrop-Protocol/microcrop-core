import farmerService from '../services/farmer.service.js';
import { formatResponse, formatPaginatedResponse } from '../utils/helpers.js';

export const farmersController = {
  async register(req, res, next) {
    try {
      const result = await farmerService.register(req.organization.id, req.body);
      res.status(201).json(formatResponse(result));
    } catch (error) {
      next(error);
    }
  },

  async list(req, res, next) {
    try {
      const result = await farmerService.list(req.organization.id, req.query);
      res.status(200).json(formatPaginatedResponse(result.data, result.total, result.page, result.limit));
    } catch (error) {
      next(error);
    }
  },

  async getById(req, res, next) {
    try {
      const result = await farmerService.getById(req.organization.id, req.params.farmerId);
      res.status(200).json(formatResponse(result));
    } catch (error) {
      next(error);
    }
  },

  async update(req, res, next) {
    try {
      const result = await farmerService.update(req.organization.id, req.params.farmerId, req.body);
      res.status(200).json(formatResponse(result));
    } catch (error) {
      next(error);
    }
  },

  async updateKyc(req, res, next) {
    try {
      const result = await farmerService.updateKyc(
        req.organization.id,
        req.params.farmerId,
        req.body.status,
        req.body.reason,
        req.user.id,
      );
      res.status(200).json(formatResponse(result));
    } catch (error) {
      next(error);
    }
  },

  async bulkImport(req, res, next) {
    try {
      const result = await farmerService.bulkImport(req.organization.id, req.body.farmers);
      res.status(201).json(formatResponse(result));
    } catch (error) {
      next(error);
    }
  },

  async bulkImportPlots(req, res, next) {
    try {
      const result = await farmerService.bulkImportPlots(req.organization.id, req.body.plots);
      res.status(201).json(formatResponse(result));
    } catch (error) {
      next(error);
    }
  },
};

export default farmersController;
