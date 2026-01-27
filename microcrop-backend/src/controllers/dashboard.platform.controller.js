import dashboardPlatformService from '../services/dashboard.platform.service.js';
import { formatResponse, formatPaginatedResponse } from '../utils/helpers.js';

export const dashboardPlatformController = {
  async getOverview(req, res, next) {
    try {
      const result = await dashboardPlatformService.getOverview(req.query);
      res.json(formatResponse(result));
    } catch (error) {
      next(error);
    }
  },

  async getOrganizations(req, res, next) {
    try {
      const result = await dashboardPlatformService.getOrganizations(req.query);
      res.json(formatPaginatedResponse(result.data, result.total, result.page, result.limit));
    } catch (error) {
      next(error);
    }
  },

  async getOrgMetrics(req, res, next) {
    try {
      const result = await dashboardPlatformService.getOrgMetrics(req.params.orgId, req.query);
      res.json(formatResponse(result));
    } catch (error) {
      next(error);
    }
  },

  async getRevenueAnalytics(req, res, next) {
    try {
      const result = await dashboardPlatformService.getRevenueAnalytics(req.query);
      res.json(formatResponse(result));
    } catch (error) {
      next(error);
    }
  },

  async getPolicyAnalytics(req, res, next) {
    try {
      const result = await dashboardPlatformService.getPolicyAnalytics(req.query);
      res.json(formatResponse(result));
    } catch (error) {
      next(error);
    }
  },

  async getFarmerAnalytics(req, res, next) {
    try {
      const result = await dashboardPlatformService.getFarmerAnalytics(req.query);
      res.json(formatResponse(result));
    } catch (error) {
      next(error);
    }
  },

  async getPayoutAnalytics(req, res, next) {
    try {
      const result = await dashboardPlatformService.getPayoutAnalytics(req.query);
      res.json(formatResponse(result));
    } catch (error) {
      next(error);
    }
  },

  async getDamageAssessments(req, res, next) {
    try {
      const result = await dashboardPlatformService.getDamageAssessments(req.query);
      res.json(formatPaginatedResponse(result.data, result.total, result.page, result.limit));
    } catch (error) {
      next(error);
    }
  },

  async getActivity(req, res, next) {
    try {
      const result = await dashboardPlatformService.getActivity(req.query);
      res.json(formatResponse(result));
    } catch (error) {
      next(error);
    }
  },
};

export default dashboardPlatformController;
