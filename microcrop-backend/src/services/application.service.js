import prisma from '../config/database.js';
import { AppError } from '../utils/errors.js';
import crypto from 'crypto';

export const applicationService = {
  /**
   * Submit a new organization application (public endpoint)
   */
  async submit(data) {
    // Check if email already has an application
    const existing = await prisma.organizationApplication.findUnique({
      where: { contactEmail: data.contactEmail },
    });

    if (existing) {
      throw new AppError('An application with this email already exists', 400, 'APPLICATION_EXISTS');
    }

    // Check if registration number is already used by an org
    const existingOrg = await prisma.organization.findUnique({
      where: { registrationNumber: data.registrationNumber },
    });

    if (existingOrg) {
      throw new AppError('An organization with this registration number already exists', 400, 'ORG_EXISTS');
    }

    const application = await prisma.organizationApplication.create({
      data: {
        name: data.name,
        registrationNumber: data.registrationNumber,
        type: data.type,
        contactFirstName: data.contactFirstName,
        contactLastName: data.contactLastName,
        contactEmail: data.contactEmail,
        contactPhone: data.contactPhone,
        county: data.county,
        estimatedFarmers: data.estimatedFarmers,
        website: data.website,
        description: data.description,
        status: 'PENDING_REVIEW',
      },
    });

    return application;
  },

  /**
   * Get application by ID
   */
  async getById(applicationId) {
    const application = await prisma.organizationApplication.findUnique({
      where: { id: applicationId },
      include: {
        kybVerification: {
          include: {
            documents: true,
          },
        },
        organization: {
          select: {
            id: true,
            name: true,
            poolAddress: true,
            isActive: true,
          },
        },
      },
    });

    if (!application) {
      throw new AppError('Application not found', 404, 'APPLICATION_NOT_FOUND');
    }

    return application;
  },

  /**
   * Get application status by email (public endpoint for applicants to check status)
   */
  async getStatusByEmail(email) {
    const application = await prisma.organizationApplication.findUnique({
      where: { contactEmail: email },
      select: {
        id: true,
        name: true,
        status: true,
        rejectionReason: true,
        createdAt: true,
        reviewedAt: true,
        kybVerification: {
          select: {
            status: true,
            businessRegistrationVerified: true,
            taxCertificateVerified: true,
            directorIdVerified: true,
            proofOfAddressVerified: true,
            bankStatementVerified: true,
          },
        },
      },
    });

    if (!application) {
      throw new AppError('No application found for this email', 404, 'APPLICATION_NOT_FOUND');
    }

    return application;
  },

  /**
   * List all applications (Platform Admin)
   */
  async list(query) {
    const { status, type, search, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const where = {};

    if (status) {
      where.status = status;
    }

    if (type) {
      where.type = type;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { contactEmail: { contains: search, mode: 'insensitive' } },
        { registrationNumber: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [applications, total] = await Promise.all([
      prisma.organizationApplication.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          kybVerification: {
            select: {
              status: true,
            },
          },
        },
      }),
      prisma.organizationApplication.count({ where }),
    ]);

    return {
      applications,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  },

  /**
   * Update application status (Platform Admin)
   */
  async updateStatus(applicationId, status, reviewedBy, rejectionReason = null) {
    const application = await prisma.organizationApplication.findUnique({
      where: { id: applicationId },
    });

    if (!application) {
      throw new AppError('Application not found', 404, 'APPLICATION_NOT_FOUND');
    }

    const updateData = {
      status,
      reviewedBy,
      reviewedAt: new Date(),
    };

    if (rejectionReason) {
      updateData.rejectionReason = rejectionReason;
    }

    const updated = await prisma.organizationApplication.update({
      where: { id: applicationId },
      data: updateData,
    });

    return updated;
  },

  /**
   * Approve application and create organization (Platform Admin)
   */
  async approve(applicationId, reviewedBy) {
    const application = await prisma.organizationApplication.findUnique({
      where: { id: applicationId },
      include: {
        kybVerification: true,
      },
    });

    if (!application) {
      throw new AppError('Application not found', 404, 'APPLICATION_NOT_FOUND');
    }

    if (application.status === 'APPROVED') {
      throw new AppError('Application is already approved', 400, 'ALREADY_APPROVED');
    }

    if (application.kybVerification?.status !== 'VERIFIED') {
      throw new AppError('KYB verification must be completed before approval', 400, 'KYB_NOT_VERIFIED');
    }

    // Generate API credentials
    const apiKey = `mc_${crypto.randomBytes(16).toString('hex')}`;
    const apiSecret = crypto.randomBytes(32).toString('hex');

    // Create organization and update application in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create organization
      const organization = await tx.organization.create({
        data: {
          name: application.name,
          registrationNumber: application.registrationNumber,
          type: application.type,
          brandName: application.name,
          contactPerson: `${application.contactFirstName} ${application.contactLastName}`,
          contactPhone: application.contactPhone,
          contactEmail: application.contactEmail,
          county: application.county,
          apiKey,
          apiSecret,
          kybStatus: 'VERIFIED',
          onboardingStep: 'POOL_DEPLOYMENT',
          isActive: false, // Activate after pool deployment and admin setup
        },
      });

      // Update application
      const updatedApplication = await tx.organizationApplication.update({
        where: { id: applicationId },
        data: {
          status: 'APPROVED',
          reviewedBy,
          reviewedAt: new Date(),
          organizationId: organization.id,
        },
      });

      return { organization, application: updatedApplication };
    });

    return result;
  },

  /**
   * Get application statistics (Platform Admin dashboard)
   */
  async getStats() {
    const [
      total,
      pendingReview,
      underReview,
      kybRequired,
      kybInProgress,
      approved,
      rejected,
    ] = await Promise.all([
      prisma.organizationApplication.count(),
      prisma.organizationApplication.count({ where: { status: 'PENDING_REVIEW' } }),
      prisma.organizationApplication.count({ where: { status: 'UNDER_REVIEW' } }),
      prisma.organizationApplication.count({ where: { status: 'KYB_REQUIRED' } }),
      prisma.organizationApplication.count({ where: { status: 'KYB_IN_PROGRESS' } }),
      prisma.organizationApplication.count({ where: { status: 'APPROVED' } }),
      prisma.organizationApplication.count({ where: { status: 'REJECTED' } }),
    ]);

    return {
      total,
      byStatus: {
        pendingReview,
        underReview,
        kybRequired,
        kybInProgress,
        approved,
        rejected,
      },
    };
  },
};

export default applicationService;
