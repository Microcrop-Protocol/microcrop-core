import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import logger from '../utils/logger.js';

let transporter = null;

if (env.smtpHost && env.smtpUser) {
  transporter = nodemailer.createTransport({
    host: env.smtpHost,
    port: env.smtpPort,
    secure: env.smtpPort === 465,
    auth: {
      user: env.smtpUser,
      pass: env.smtpPass,
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 10000,
  });
}

const emailService = {
  async send(to, subject, html) {
    if (!transporter) {
      logger.warn('SMTP not configured - email skipped', { to, subject });
      return { status: 'skipped', reason: 'SMTP not configured' };
    }

    try {
      await transporter.sendMail({
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
