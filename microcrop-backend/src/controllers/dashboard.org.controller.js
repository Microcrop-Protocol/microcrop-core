import dashboardOrgService from '../services/dashboard.org.service.js';
import { formatResponse, formatPaginatedResponse } from '../utils/helpers.js';

export const dashboardOrgController = {
  async getOverview(req, res, next) {
    try {
      const result = await dashboardOrgService.getOverview(req.organization.id, req.query);
      res.json(formatResponse(result));
    } catch (error) {
      next(error);
    }
  },

  async getFarmers(req, res, next) {
    try {
      const result = await dashboardOrgService.getFarmers(req.organization.id, req.query);
      res.json(formatPaginatedResponse(result.data, result.total, result.page, result.limit));
    } catch (error) {
      next(error);
    }
  },

  async getFarmerAnalytics(req, res, next) {
    try {
      const result = await dashboardOrgService.getFarmerAnalytics(req.organization.id, req.query);
      res.json(formatResponse(result));
    } catch (error) {
      next(error);
    }
  },

  async getPolicies(req, res, next) {
    try {
      const result = await dashboardOrgService.getPolicies(req.organization.id, req.query);
      res.json(formatResponse(result));
    } catch (error) {
      next(error);
    }
  },

  async getPolicyAnalytics(req, res, next) {
    try {
      const result = await dashboardOrgService.getPolicyAnalytics(req.organization.id, req.query);
      res.json(formatResponse(result));
    } catch (error) {
      next(error);
    }
  },

  async getPayouts(req, res, next) {
    try {
      const result = await dashboardOrgService.getPayouts(req.organization.id, req.query);
      res.json(formatResponse(result));
    } catch (error) {
      next(error);
    }
  },

  async getDamageAssessments(req, res, next) {
    try {
      const result = await dashboardOrgService.getDamageAssessments(req.organization.id, req.query);
      res.json(formatPaginatedResponse(
        result.assessments.data,
        result.assessments.total,
        result.assessments.page,
        result.assessments.limit,
      ));
    } catch (error) {
      next(error);
    }
  },

  async getFinancials(req, res, next) {
    try {
      const result = await dashboardOrgService.getFinancials(req.organization.id, req.query);
      res.json(formatResponse(result));
    } catch (error) {
      next(error);
    }
  },

  async getPlots(req, res, next) {
    try {
      const result = await dashboardOrgService.getPlots(req.organization.id, req.query);
      res.json(formatResponse({
        ...formatPaginatedResponse(
          result.plots.data,
          result.plots.total,
          result.plots.page,
          result.plots.limit,
        ),
        cropDistribution: result.cropDistribution,
      }));
    } catch (error) {
      next(error);
    }
  },

  async getActivity(req, res, next) {
    try {
      const result = await dashboardOrgService.getActivity(req.organization.id, req.query);
      res.json(formatResponse(result));
    } catch (error) {
      next(error);
    }
  },
};

export default dashboardOrgController;
