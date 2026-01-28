import invitationService from '../services/invitation.service.js';

export const invitationController = {
  /**
   * List all invitations (Platform Admin)
   * GET /api/invitations
   */
  async list(req, res, next) {
    try {
      const result = await invitationService.listAll(req.query);
      res.json({
        success: true,
        data: result.invitations,
        pagination: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Create a new invitation (Platform Admin)
   * POST /api/invitations
   */
  async create(req, res, next) {
    try {
      const invitation = await invitationService.create(req.body, req.user.id);
      res.status(201).json({
        success: true,
        data: invitation,
        message: 'Invitation created successfully.',
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Send/resend invitation email (Platform Admin)
   * POST /api/invitations/:id/send
   */
  async send(req, res, next) {
    try {
      const invitation = await invitationService.sendEmail(req.params.id);
      res.json({
        success: true,
        data: invitation,
        message: 'Invitation email sent successfully.',
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Validate invitation token (public)
   * GET /api/invitations/validate/:token
   */
  async getByToken(req, res, next) {
    try {
      const invitation = await invitationService.getByToken(req.params.token);
      res.json({
        success: true,
        data: invitation,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Accept invitation and create account (public)
   * POST /api/invitations/accept
   */
  async accept(req, res, next) {
    try {
      const { token, password } = req.body;
      const user = await invitationService.accept(token, password);
      res.status(201).json({
        success: true,
        data: user,
        message: 'Account created successfully. You can now log in.',
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Cleanup expired invitations (internal/cron)
   * POST /api/internal/invitations/cleanup
   */
  async cleanupExpired(req, res, next) {
    try {
      const result = await invitationService.cleanupExpired();
      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },
};

export default invitationController;
