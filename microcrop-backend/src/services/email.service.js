import { Resend } from 'resend';
import { env } from '../config/env.js';
import logger from '../utils/logger.js';

const resend = env.resendApiKey ? new Resend(env.resendApiKey) : null;

const emailService = {
  async send(to, subject, html) {
    if (!resend) {
      logger.warn('Resend not configured - email skipped', { to, subject });
      return { status: 'skipped', reason: 'Resend API key not configured' };
    }

    try {
      await resend.emails.send({
        from: env.emailFrom,
        to,
        subject,
        html,
      });

      logger.info('Email sent', { to, subject });
      return { status: 'sent' };
    } catch (error) {
      logger.error('Failed to send email', { to, subject, error: error.message });
      return { status: 'failed', reason: error.message };
    }
  },

  async sendWelcome(email, name) {
    const html = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Welcome to MicroCrop!</h2>
        <p>Hi${name ? ` ${name}` : ''},</p>
        <p>Your account has been created successfully. You're now part of the MicroCrop network — parametric crop insurance powered by blockchain.</p>
        <p>If you have any questions, feel free to reach out to our support team.</p>
        <p style="color: #666; font-size: 14px;">— The MicroCrop Team</p>
      </div>
    `;

    return this.send(email, 'Welcome to MicroCrop', html);
  },

  async sendInvitation(invitation) {
    const { email, firstName, organization, token } = invitation;
    const acceptUrl = `${env.frontendUrl}/accept-invitation?token=${token}`;
    const orgName = organization?.brandName || organization?.name || 'an organization';

    const html = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>You're Invited to MicroCrop</h2>
        <p>Hi${firstName ? ` ${firstName}` : ''},</p>
        <p>You've been invited to join <strong>${orgName}</strong> as an Organization Admin on the MicroCrop platform.</p>
        <p>Click the button below to set up your account. This invitation expires in 72 hours.</p>
        <p style="margin: 24px 0;">
          <a href="${acceptUrl}" style="display: inline-block; padding: 12px 24px; background: #2563eb; color: #fff; text-decoration: none; border-radius: 6px;">Accept Invitation</a>
        </p>
        <p style="color: #666; font-size: 14px;">If you weren't expecting this, you can safely ignore this email.</p>
        <p style="color: #999; font-size: 12px;">Link: ${acceptUrl}</p>
      </div>
    `;

    return this.send(email, `You're invited to join ${orgName} on MicroCrop`, html);
  },

  async sendPasswordReset(email, token) {
    const resetUrl = `${env.frontendUrl}/reset-password?token=${token}`;

    const html = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Password Reset</h2>
        <p>You requested a password reset for your MicroCrop account.</p>
        <p>Click the link below to set a new password. This link expires in 1 hour.</p>
        <p><a href="${resetUrl}" style="display: inline-block; padding: 12px 24px; background: #2563eb; color: #fff; text-decoration: none; border-radius: 6px;">Reset Password</a></p>
        <p style="color: #666; font-size: 14px;">If you didn't request this, you can safely ignore this email.</p>
        <p style="color: #999; font-size: 12px;">Link: ${resetUrl}</p>
      </div>
    `;

    return this.send(email, 'MicroCrop — Password Reset', html);
  },
};

export default emailService;
