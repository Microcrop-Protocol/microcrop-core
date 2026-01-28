import invitationService from '../services/invitation.service.js';

export const invitationController = {
  /**
   * Send admin invitation (Platform Admin)
   * POST /api/platform/organizations/:orgId/invitations
   */
  async send(req, res, next) {
    try {
      const invitation = await invitationService.send(
        req.params.orgId,
        req.body,
        req.user.id
      );
      res.status(201).json({
        success: true,
        data: invitation,
        message: 'Invitation sent successfully.',
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get invitation details by token (public)
   * GET /api/invitations/:token
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
   * POST /api/invitations/:token/accept
   */
  async accept(req, res, next) {
    try {
      const { password } = req.body;
      const user = await invitationService.accept(req.params.token, password);
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
   * List invitations for an organization (Platform Admin)
   * GET /api/platform/organizations/:orgId/invitations
   */
  async listByOrganization(req, res, next) {
    try {
      const result = await invitationService.listByOrganization(
        req.params.orgId,
        req.query
      );
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
   * Revoke an invitation (Platform Admin)
   * DELETE /api/platform/organizations/:orgId/invitations/:invitationId
   */
  async revoke(req, res, next) {
    try {
      const invitation = await invitationService.revoke(
        req.params.invitationId,
        req.params.orgId
      );
      res.json({
        success: true,
        data: invitation,
        message: 'Invitation revoked successfully.',
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Resend an invitation (Platform Admin)
   * POST /api/platform/organizations/:orgId/invitations/:invitationId/resend
   */
  async resend(req, res, next) {
    try {
      const invitation = await invitationService.resend(
        req.params.invitationId,
        req.params.orgId
      );
      res.json({
        success: true,
        data: invitation,
        message: 'Invitation resent successfully.',
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
