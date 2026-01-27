import payoutService from '../services/payout.service.js';
import { formatResponse } from '../utils/helpers.js';

export const payoutsController = {
  async retry(req, res, next) {
    try {
      const result = await payoutService.retry(req.organization.id, req.params.payoutId);
      res.status(200).json(formatResponse(result));
    } catch (error) {
      next(error);
    }
  },

  async batchRetry(req, res, next) {
    try {
      const result = await payoutService.batchRetry(req.organization.id, req.body);
      res.status(200).json(formatResponse(result));
    } catch (error) {
      next(error);
    }
  },

  async getReconciliation(req, res, next) {
    try {
      const result = await payoutService.getReconciliation(req.organization.id, req.query);
      res.status(200).json(formatResponse(result));
    } catch (error) {
      next(error);
    }
  },
};

export default payoutsController;
