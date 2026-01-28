import applicationService from '../services/application.service.js';
import { getFileUrl } from '../middleware/upload.middleware.js';

export const applicationController = {
  /**
   * Submit a new organization application with documents (public)
   * POST /api/applications/organization (multipart/form-data)
   */
  async submit(req, res, next) {
    try {
      // Extract form fields from body
      const formData = {
        name: req.body.name,
        registrationNumber: req.body.registrationNumber,
        type: req.body.type,
        contactFirstName: req.body.contactFirstName,
        contactLastName: req.body.contactLastName,
        contactEmail: req.body.contactEmail,
        contactPhone: req.body.contactPhone,
        county: req.body.county,
        estimatedFarmers: req.body.estimatedFarmers ? parseInt(req.body.estimatedFarmers, 10) : undefined,
        website: req.body.website,
        description: req.body.description,
      };

      // Extract uploaded files
      const files = {};
      if (req.files) {
        if (req.files.businessRegistrationCert?.[0]) {
          const file = req.files.businessRegistrationCert[0];
          files.businessRegistrationCertUrl = getFileUrl(file.filename);
          files.businessRegistrationCertName = file.originalname;
        }
        if (req.files.taxPinCert?.[0]) {
          const file = req.files.taxPinCert[0];
          files.taxPinCertUrl = getFileUrl(file.filename);
          files.taxPinCertName = file.originalname;
        }
      }

      const application = await applicationService.submit({ ...formData, ...files });
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
