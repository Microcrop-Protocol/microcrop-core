import { authService } from '../services/auth.service.js';
import { formatResponse } from '../utils/helpers.js';

export const authController = {
  async register(req, res, next) {
    try {
      const result = await authService.register(req.body);
      res.status(201).json(formatResponse(result));
    } catch (error) {
      next(error);
    }
  },

  async login(req, res, next) {
    try {
      const result = await authService.login(req.body.email, req.body.password);
      res.status(200).json(formatResponse(result));
    } catch (error) {
      next(error);
    }
  },

  async refreshToken(req, res, next) {
    try {
      const result = await authService.refreshToken(req.body.refreshToken);
      res.status(200).json(formatResponse(result));
    } catch (error) {
      next(error);
    }
  },

  async getMe(req, res, next) {
    try {
      const result = await authService.getMe(req.user.id);
      res.status(200).json(formatResponse(result));
    } catch (error) {
      next(error);
    }
  },
};

export default authController;
