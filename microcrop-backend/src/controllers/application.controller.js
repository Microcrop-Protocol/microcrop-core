import applicationService from '../services/application.service.js';

export const applicationController = {
  /**
   * Submit a new organization application (public)
   * POST /api/applications
   */
  async submit(req, res, next) {
    try {
      const application = await applicationService.submit(req.body);
      res.status(201).json({
        success: true,
        data: application,
        message: 'Application submitted successfully. You will receive an email with updates on your application status.',
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get application status by email (public)
   * GET /api/applications/status?email=...
   */
  async getStatus(req, res, next) {
    try {
      const { email } = req.query;
      const application = await applicationService.getStatusByEmail(email);
      res.json({
        success: true,
        data: application,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * List all applications (Platform Admin)
   * GET /api/platform/applications
   */
  async list(req, res, next) {
    try {
      const result = await applicationService.list(req.query);
      res.json({
        success: true,
        data: result.applications,
        pagination: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get application by ID (Platform Admin)
   * GET /api/applications/organization/:id
   */
  async getById(req, res, next) {
    try {
      const application = await applicationService.getById(req.params.id);
      res.json({
        success: true,
        data: application,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Update application status (Platform Admin)
   * PUT /api/platform/applications/:applicationId/status
   */
  async updateStatus(req, res, next) {
    try {
      const { status, rejectionReason } = req.body;
      const application = await applicationService.updateStatus(
        req.params.applicationId,
        status,
        req.user.id,
        rejectionReason
      );
      res.json({
        success: true,
        data: application,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Verify/Approve application and create organization (Platform Admin)
   * POST /api/applications/organization/:id/verify
   */
  async approve(req, res, next) {
    try {
      const result = await applicationService.approve(
        req.params.id,
        req.user.id
      );
      res.json({
        success: true,
        data: result,
        message: 'Application verified and organization created successfully.',
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get application statistics (Platform Admin)
   * GET /api/platform/applications/stats
   */
  async getStats(req, res, next) {
    try {
      const stats = await applicationService.getStats();
      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      next(error);
    }
  },
};

export default applicationController;
