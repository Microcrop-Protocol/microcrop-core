import organizationService from '../services/organization.service.js';
import { formatResponse, formatPaginatedResponse } from '../utils/helpers.js';

export const platformController = {
  async registerOrg(req, res, next) {
    try {
      const result = await organizationService.registerOrganization(req.body);
      res.status(201).json(formatResponse(result));
    } catch (error) {
      next(error);
    }
  },

  async deployPool(req, res, next) {
    try {
      const result = await organizationService.deployPool(req.params.orgId, req.body.initialCapital);
      res.status(200).json(formatResponse(result));
    } catch (error) {
      next(error);
    }
  },

  async listOrgs(req, res, next) {
    try {
      const { page, limit, ...filters } = req.query;
      const result = await organizationService.listOrganizations(filters, { page, limit });
      res.status(200).json(formatPaginatedResponse(result.data, result.total, result.page, result.limit));
    } catch (error) {
      next(error);
    }
  },

  async getOrg(req, res, next) {
    try {
      const result = await organizationService.getOrganization(req.params.orgId);
      res.status(200).json(formatResponse(result));
    } catch (error) {
      next(error);
    }
  },

  async configureOrg(req, res, next) {
    try {
      const result = await organizationService.configureOrganization(req.params.orgId, req.body);
      res.status(200).json(formatResponse(result));
    } catch (error) {
      next(error);
    }
  },

  async activateOrg(req, res, next) {
    try {
      const result = await organizationService.activateOrganization(req.params.orgId);
      res.status(200).json(formatResponse(result));
    } catch (error) {
      next(error);
    }
  },

  async deactivateOrg(req, res, next) {
    try {
      const result = await organizationService.deactivateOrganization(req.params.orgId, req.body.reason);
      res.status(200).json(formatResponse(result));
    } catch (error) {
      next(error);
    }
  },

  async getAnalytics(req, res, next) {
    try {
      const result = await organizationService.getPlatformAnalytics(req.query.startDate, req.query.endDate);
      res.status(200).json(formatResponse(result));
    } catch (error) {
      next(error);
    }
  },

  async getOnboardingStatus(req, res, next) {
    try {
      const result = await organizationService.getOnboardingStatus(req.params.orgId);
      res.status(200).json(formatResponse(result));
    } catch (error) {
      next(error);
    }
  },
};

export default platformController;
