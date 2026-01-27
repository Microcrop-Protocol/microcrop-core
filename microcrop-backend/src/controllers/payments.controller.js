import paymentService from '../services/payment.service.js';
import { formatResponse } from '../utils/helpers.js';

export const paymentsController = {
  async getQuote(req, res, next) {
    try {
      const result = await paymentService.getConversionQuote(req.body);
      res.status(200).json(formatResponse(result));
    } catch (error) {
      next(error);
    }
  },

  async initiate(req, res, next) {
    try {
      const result = await paymentService.initiatePremiumPayment(req.organization.id, req.body);
      res.status(200).json(formatResponse(result));
    } catch (error) {
      next(error);
    }
  },

  async checkStatus(req, res, next) {
    try {
      const result = await paymentService.checkPaymentStatus(req.organization.id, req.params.reference);
      res.status(200).json(formatResponse(result));
    } catch (error) {
      next(error);
    }
  },

  async callback(req, res, next) {
    try {
      await paymentService.handlePaymentCallback(req.body);
      res.status(200).json({ success: true });
    } catch (error) {
      next(error);
    }
  },
};

export default paymentsController;
