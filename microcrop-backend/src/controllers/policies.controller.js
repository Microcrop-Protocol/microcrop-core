import policyService from '../services/policy.service.js';
import { formatResponse, formatPaginatedResponse } from '../utils/helpers.js';

export const policiesController = {
  async quote(req, res, next) {
    try {
      const result = await policyService.calculateQuote(req.organization.id, req.body);
      res.status(200).json(formatResponse(result));
    } catch (error) {
      next(error);
    }
  },

  async purchase(req, res, next) {
    try {
      const result = await policyService.purchase(req.organization.id, req.body);
      res.status(201).json(formatResponse(result));
    } catch (error) {
      next(error);
    }
  },

  async list(req, res, next) {
    try {
      const result = await policyService.list(req.organization.id, req.query);
      res.status(200).json(formatPaginatedResponse(result.data, result.total, result.page, result.limit));
    } catch (error) {
      next(error);
    }
  },

  async getById(req, res, next) {
    try {
      const result = await policyService.getById(req.organization.id, req.params.policyId);
      res.status(200).json(formatResponse(result));
    } catch (error) {
      next(error);
    }
  },

  async getStatus(req, res, next) {
    try {
      const result = await policyService.getStatus(req.organization.id, req.params.policyId);
      res.status(200).json(formatResponse(result));
    } catch (error) {
      next(error);
    }
  },

  async activate(req, res, next) {
    try {
      const result = await policyService.activate(req.organization.id, req.params.policyId, req.body.paymentReference);
      res.status(200).json(formatResponse(result));
    } catch (error) {
      next(error);
    }
  },

  async cancel(req, res, next) {
    try {
      const result = await policyService.cancel(req.organization.id, req.params.policyId, req.body.reason);
      res.json(formatResponse(result));
    } catch (error) {
      next(error);
    }
  },

  async expireCheck(req, res, next) {
    try {
      const result = await policyService.expireOverdue();
      res.json(formatResponse(result));
    } catch (error) {
      next(error);
    }
  },
};

export default policiesController;
