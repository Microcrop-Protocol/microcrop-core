import herdService from '../services/herd.service.js';
import { formatResponse, formatPaginatedResponse } from '../utils/helpers.js';

export const herdsController = {
  async create(req, res, next) {
    try {
      const result = await herdService.create(req.organization.id, req.body);
      res.status(201).json(formatResponse(result));
    } catch (error) {
      next(error);
    }
  },

  async list(req, res, next) {
    try {
      const result = await herdService.list(req.organization.id, req.query);
      res.status(200).json(formatPaginatedResponse(result.data, result.total, result.page, result.limit));
    } catch (error) {
      next(error);
    }
  },

  async getById(req, res, next) {
    try {
      const result = await herdService.getById(req.organization.id, req.params.herdId);
      res.status(200).json(formatResponse(result));
    } catch (error) {
      next(error);
    }
  },

  async update(req, res, next) {
    try {
      const result = await herdService.update(req.organization.id, req.params.herdId, req.body);
      res.status(200).json(formatResponse(result));
    } catch (error) {
      next(error);
    }
  },
};

export default herdsController;
