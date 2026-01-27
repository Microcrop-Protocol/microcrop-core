import staffService from '../services/staff.service.js';
import { formatResponse } from '../utils/helpers.js';

export const staffController = {
  async list(req, res, next) {
    try {
      const result = await staffService.list(req.organization.id);
      res.status(200).json(formatResponse(result));
    } catch (error) {
      next(error);
    }
  },

  async invite(req, res, next) {
    try {
      const result = await staffService.invite(req.organization.id, req.body);
      res.status(201).json(formatResponse(result));
    } catch (error) {
      next(error);
    }
  },

  async changeRole(req, res, next) {
    try {
      const result = await staffService.changeRole(req.organization.id, req.params.userId, req.body.role);
      res.status(200).json(formatResponse(result));
    } catch (error) {
      next(error);
    }
  },

  async deactivate(req, res, next) {
    try {
      const result = await staffService.deactivate(req.organization.id, req.params.userId);
      res.status(200).json(formatResponse(result));
    } catch (error) {
      next(error);
    }
  },

  async reactivate(req, res, next) {
    try {
      const result = await staffService.reactivate(req.organization.id, req.params.userId);
      res.status(200).json(formatResponse(result));
    } catch (error) {
      next(error);
    }
  },
};

export default staffController;
