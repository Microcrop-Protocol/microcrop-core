import prisma from '../config/database.js';
import { AppError } from '../utils/errors.js';
import crypto from 'crypto';
import bcrypt from 'bcrypt';

const INVITATION_EXPIRY_HOURS = 72; // 3 days

export const invitationService = {
  /**
   * List all invitations (Platform Admin)
   */
  async listAll(query) {
    const { status, organizationId, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const where = {};

    if (status) {
      where.status = status;
    }

    if (organizationId) {
      where.organizationId = organizationId;
    }

    const [invitations, total] = await Promise.all([
      prisma.orgAdminInvitation.findMany({
        where,
        skip,
        take: limit,
        orderBy: { invitedAt: 'desc' },
        include: {
          organization: {
            select: {
              id: true,
              name: true,
              brandName: true,
            },
          },
        },
      }),
      prisma.orgAdminInvitation.count({ where }),
    ]);

    return {
      invitations,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  },

  /**
   * Create a new invitation (Platform Admin)
   */
  async create(data, invitedBy) {
    const { organizationId, email, firstName, lastName, phone } = data;

    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
    });

    if (!organization) {
      throw new AppError('Organization not found', 404, 'ORG_NOT_FOUND');
    }

    // Check if email already has a user account
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new AppError('A user with this email already exists', 400, 'USER_EXISTS');
    }

    // Check for existing pending invitation
    const existingInvitation = await prisma.orgAdminInvitation.findFirst({
      where: {
        email,
        organizationId,
        status: 'PENDING',
      },
    });

    if (existingInvitation) {
      throw new AppError('A pending invitation already exists for this email', 400, 'INVITATION_EXISTS');
    }

    // Generate secure token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + INVITATION_EXPIRY_HOURS * 60 * 60 * 1000);

    const invitation = await prisma.orgAdminInvitation.create({
      data: {
        email,
        firstName,
        lastName,
        phone,
        token,
        expiresAt,
        organizationId,
        invitedBy,
        status: 'PENDING',
      },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            brandName: true,
          },
        },
      },
    });

    return {
      ...invitation,
      invitationLink: `https://app.microcrop.app/accept-invitation?token=${token}`,
    };
  },

  /**
   * Send/resend invitation email
   */
  async sendEmail(invitationId) {
    const invitation = await prisma.orgAdminInvitation.findUnique({
      where: { id: invitationId },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            brandName: true,
          },
        },
      },
    });

    if (!invitation) {
      throw new AppError('Invitation not found', 404, 'INVITATION_NOT_FOUND');
    }

    if (invitation.status !== 'PENDING') {
      throw new AppError('Can only send pending invitations', 400, 'CANNOT_SEND');
    }

    // Check if expired and regenerate token if needed
    if (new Date() > invitation.expiresAt) {
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + INVITATION_EXPIRY_HOURS * 60 * 60 * 1000);

      const updated = await prisma.orgAdminInvitation.update({
        where: { id: invitationId },
        data: { token, expiresAt },
        include: {
          organization: {
            select: {
              id: true,
              name: true,
              brandName: true,
            },
          },
        },
      });

      // In production, send email with invitation link
      // await emailService.sendInvitation(updated);

      return {
        ...updated,
        invitationLink: `https://app.microcrop.app/accept-invitation?token=${token}`,
        emailSent: true,
      };
    }

    // In production, send email with invitation link
    // await emailService.sendInvitation(invitation);

    return {
      ...invitation,
      invitationLink: `https://app.microcrop.app/accept-invitation?token=${invitation.token}`,
      emailSent: true,
    };
  },

  /**
   * Send admin invitation for an organization (legacy method)
   */
  async send(organizationId, data, invitedBy) {
    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
    });

    if (!organization) {
      throw new AppError('Organization not found', 404, 'ORG_NOT_FOUND');
    }

    // Check if email already has a user account
    const existingUser = await prisma.user.findUnique({
      where: { email: data.email },
    });

    if (existingUser) {
      throw new AppError('A user with this email already exists', 400, 'USER_EXISTS');
    }

    // Check for existing pending invitation
    const existingInvitation = await prisma.orgAdminInvitation.findFirst({
      where: {
        email: data.email,
        organizationId,
        status: 'PENDING',
      },
    });

    if (existingInvitation) {
      // Revoke existing and create new
      await prisma.orgAdminInvitation.update({
        where: { id: existingInvitation.id },
        data: { status: 'REVOKED' },
      });
    }

    // Generate secure token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + INVITATION_EXPIRY_HOURS * 60 * 60 * 1000);

    const invitation = await prisma.orgAdminInvitation.create({
      data: {
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
        token,
        expiresAt,
        organizationId,
        invitedBy,
        status: 'PENDING',
      },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            brandName: true,
          },
        },
      },
    });

    // In production, send email with invitation link
    // await emailService.sendInvitation(invitation);

    return {
      ...invitation,
      invitationLink: `https://app.microcrop.app/accept-invitation?token=${token}`,
    };
  },

  /**
   * Get invitation by token (public endpoint)
   */
  async getByToken(token) {
    const invitation = await prisma.orgAdminInvitation.findUnique({
      where: { token },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            brandName: true,
            logoUrl: true,
          },
        },
      },
    });

    if (!invitation) {
      throw new AppError('Invalid invitation token', 404, 'INVALID_TOKEN');
    }

    if (invitation.status !== 'PENDING') {
      throw new AppError(`Invitation has already been ${invitation.status.toLowerCase()}`, 400, 'INVITATION_USED');
    }

    if (new Date() > invitation.expiresAt) {
      // Mark as expired
      await prisma.orgAdminInvitation.update({
        where: { id: invitation.id },
        data: { status: 'EXPIRED' },
      });
      throw new AppError('Invitation has expired', 400, 'INVITATION_EXPIRED');
    }

    return {
      id: invitation.id,
      email: invitation.email,
      firstName: invitation.firstName,
      lastName: invitation.lastName,
      organization: invitation.organization,
      expiresAt: invitation.expiresAt,
    };
  },

  /**
   * Accept invitation and create user account
   */
  async accept(token, password) {
    const invitation = await prisma.orgAdminInvitation.findUnique({
      where: { token },
      include: {
        organization: true,
      },
    });

    if (!invitation) {
      throw new AppError('Invalid invitation token', 404, 'INVALID_TOKEN');
    }

    if (invitation.status !== 'PENDING') {
      throw new AppError(`Invitation has already been ${invitation.status.toLowerCase()}`, 400, 'INVITATION_USED');
    }

    if (new Date() > invitation.expiresAt) {
      await prisma.orgAdminInvitation.update({
        where: { id: invitation.id },
        data: { status: 'EXPIRED' },
      });
      throw new AppError('Invitation has expired', 400, 'INVITATION_EXPIRED');
    }

    // Check if email already exists (race condition protection)
    const existingUser = await prisma.user.findUnique({
      where: { email: invitation.email },
    });

    if (existingUser) {
      throw new AppError('A user with this email already exists', 400, 'USER_EXISTS');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create user and update invitation in transaction
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: invitation.email,
          phone: invitation.phone,
          password: hashedPassword,
          firstName: invitation.firstName,
          lastName: invitation.lastName,
          role: 'ORG_ADMIN',
          organizationId: invitation.organizationId,
          isActive: true,
          emailVerified: true, // Verified via invitation
        },
      });

      await tx.orgAdminInvitation.update({
        where: { id: invitation.id },
        data: {
          status: 'ACCEPTED',
          usedAt: new Date(),
        },
      });

      // Update organization onboarding step if needed
      if (invitation.organization.onboardingStep === 'ADMIN_SETUP') {
        await tx.organization.update({
          where: { id: invitation.organizationId },
          data: {
            onboardingStep: 'COMPLETED',
            isActive: true,
          },
        });
      }

      return user;
    });

    // Return user without password
    const { password: _, ...userWithoutPassword } = result;
    return userWithoutPassword;
  },

  /**
   * List invitations for an organization
   */
  async listByOrganization(organizationId, query) {
    const { status, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const where = { organizationId };

    if (status) {
      where.status = status;
    }

    const [invitations, total] = await Promise.all([
      prisma.orgAdminInvitation.findMany({
        where,
        skip,
        take: limit,
        orderBy: { invitedAt: 'desc' },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          status: true,
          expiresAt: true,
          invitedBy: true,
          invitedAt: true,
          usedAt: true,
        },
      }),
      prisma.orgAdminInvitation.count({ where }),
    ]);

    return {
      invitations,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  },

  /**
   * Revoke an invitation
   */
  async revoke(invitationId, organizationId) {
    const invitation = await prisma.orgAdminInvitation.findFirst({
      where: {
        id: invitationId,
        organizationId,
      },
    });

    if (!invitation) {
      throw new AppError('Invitation not found', 404, 'INVITATION_NOT_FOUND');
    }

    if (invitation.status !== 'PENDING') {
      throw new AppError('Can only revoke pending invitations', 400, 'CANNOT_REVOKE');
    }

    const updated = await prisma.orgAdminInvitation.update({
      where: { id: invitationId },
      data: { status: 'REVOKED' },
    });

    return updated;
  },

  /**
   * Resend invitation (generates new token)
   */
  async resend(invitationId, organizationId) {
    const invitation = await prisma.orgAdminInvitation.findFirst({
      where: {
        id: invitationId,
        organizationId,
      },
    });

    if (!invitation) {
      throw new AppError('Invitation not found', 404, 'INVITATION_NOT_FOUND');
    }

    if (invitation.status !== 'PENDING' && invitation.status !== 'EXPIRED') {
      throw new AppError('Can only resend pending or expired invitations', 400, 'CANNOT_RESEND');
    }

    // Generate new token and expiry
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + INVITATION_EXPIRY_HOURS * 60 * 60 * 1000);

    const updated = await prisma.orgAdminInvitation.update({
      where: { id: invitationId },
      data: {
        token,
        expiresAt,
        status: 'PENDING',
      },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            brandName: true,
          },
        },
      },
    });

    // In production, send email with new invitation link
    // await emailService.sendInvitation(updated);

    return {
      ...updated,
      invitationLink: `https://app.microcrop.app/accept-invitation?token=${token}`,
    };
  },

  /**
   * Cleanup expired invitations (called by cron job)
   */
  async cleanupExpired() {
    const result = await prisma.orgAdminInvitation.updateMany({
      where: {
        status: 'PENDING',
        expiresAt: { lt: new Date() },
      },
      data: { status: 'EXPIRED' },
    });

    return { expiredCount: result.count };
  },
};

export default invitationService;
