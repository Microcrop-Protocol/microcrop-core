import kybService from '../services/kyb.service.js';

export const kybController = {
  /**
   * Initiate KYB verification (Platform Admin)
   * POST /api/platform/kyb/initiate
   */
  async initiate(req, res, next) {
    try {
      const { applicationId } = req.body;
      const kyb = await kybService.initiate(applicationId);
      res.status(201).json({
        success: true,
        data: kyb,
        message: 'KYB verification initiated successfully.',
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get KYB verification by ID (Platform Admin)
   * GET /api/platform/kyb/:kybId
   */
  async getById(req, res, next) {
    try {
      const kyb = await kybService.getById(req.params.kybId);
      res.json({
        success: true,
        data: kyb,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get KYB verification by application ID
   * GET /api/platform/kyb/application/:applicationId
   */
  async getByApplicationId(req, res, next) {
    try {
      const kyb = await kybService.getByApplicationId(req.params.applicationId);
      res.json({
        success: true,
        data: kyb,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get presigned URL for document upload
   * POST /api/kyb/:kybId/upload-url
   */
  async getUploadUrl(req, res, next) {
    try {
      const { documentType, fileName, fileSize, mimeType } = req.body;
      const result = await kybService.getUploadUrl(
        req.params.kybId,
        documentType,
        fileName,
        fileSize,
        mimeType
      );
      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Record uploaded document
   * POST /api/kyb/:kybId/documents
   */
  async recordDocument(req, res, next) {
    try {
      const { documentType, fileName, fileUrl, fileSize, mimeType } = req.body;
      const document = await kybService.recordDocument(
        req.params.kybId,
        documentType,
        fileName,
        fileUrl,
        fileSize,
        mimeType
      );
      res.status(201).json({
        success: true,
        data: document,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get documents for a KYB verification
   * GET /api/kyb/:kybId/documents
   */
  async getDocuments(req, res, next) {
    try {
      const documents = await kybService.getDocuments(req.params.kybId);
      res.json({
        success: true,
        data: documents,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Verify or reject a document (Platform Admin)
   * PUT /api/platform/kyb/documents/:documentId/verify
   */
  async verifyDocument(req, res, next) {
    try {
      const { isVerified, rejectionReason } = req.body;
      const document = await kybService.verifyDocument(
        req.params.documentId,
        isVerified,
        req.user.id,
        rejectionReason
      );
      res.json({
        success: true,
        data: document,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Update KYB verification status (Platform Admin)
   * PUT /api/platform/kyb/:kybId/status
   */
  async updateStatus(req, res, next) {
    try {
      const { status, verifierNotes } = req.body;
      const kyb = await kybService.updateStatus(
        req.params.kybId,
        status,
        req.user.id,
        verifierNotes
      );
      res.json({
        success: true,
        data: kyb,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Submit KYB for review (Applicant action)
   * POST /api/kyb/:kybId/submit
   */
  async submitForReview(req, res, next) {
    try {
      const kyb = await kybService.submitForReview(req.params.kybId);
      res.json({
        success: true,
        data: kyb,
        message: 'KYB documents submitted for review.',
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get KYB statistics (Platform Admin)
   * GET /api/platform/kyb/stats
   */
  async getStats(req, res, next) {
    try {
      const stats = await kybService.getStats();
      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      next(error);
    }
  },
};

export default kybController;
