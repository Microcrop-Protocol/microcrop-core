import prisma from '../config/database.js';
import { AppError } from '../utils/errors.js';
import crypto from 'crypto';

export const kybService = {
  /**
   * Initiate KYB verification for an application
   */
  async initiate(applicationId) {
    const application = await prisma.organizationApplication.findUnique({
      where: { id: applicationId },
      include: { kybVerification: true },
    });

    if (!application) {
      throw new AppError('Application not found', 404, 'APPLICATION_NOT_FOUND');
    }

    if (application.kybVerification) {
      return application.kybVerification;
    }

    // Create KYB verification and update application status
    const kybVerification = await prisma.$transaction(async (tx) => {
      const kyb = await tx.kYBVerification.create({
        data: {
          applicationId,
          status: 'PENDING',
        },
        include: {
          documents: true,
        },
      });

      await tx.organizationApplication.update({
        where: { id: applicationId },
        data: { status: 'KYB_IN_PROGRESS' },
      });

      return kyb;
    });

    return kybVerification;
  },

  /**
   * Get KYB verification by ID
   */
  async getById(kybId) {
    const kyb = await prisma.kYBVerification.findUnique({
      where: { id: kybId },
      include: {
        documents: true,
        application: {
          select: {
            id: true,
            name: true,
            registrationNumber: true,
            type: true,
            contactEmail: true,
            status: true,
          },
        },
      },
    });

    if (!kyb) {
      throw new AppError('KYB verification not found', 404, 'KYB_NOT_FOUND');
    }

    return kyb;
  },

  /**
   * Get KYB verification by application ID
   */
  async getByApplicationId(applicationId) {
    const kyb = await prisma.kYBVerification.findUnique({
      where: { applicationId },
      include: {
        documents: true,
        application: {
          select: {
            id: true,
            name: true,
            registrationNumber: true,
            type: true,
            contactEmail: true,
            status: true,
          },
        },
      },
    });

    if (!kyb) {
      throw new AppError('KYB verification not found for this application', 404, 'KYB_NOT_FOUND');
    }

    return kyb;
  },

  /**
   * Generate presigned URL for document upload
   * In production, this would generate an S3/GCS presigned URL
   */
  async getUploadUrl(kybId, documentType, fileName, fileSize, mimeType) {
    const kyb = await prisma.kYBVerification.findUnique({
      where: { id: kybId },
    });

    if (!kyb) {
      throw new AppError('KYB verification not found', 404, 'KYB_NOT_FOUND');
    }

    // Generate a unique file key
    const fileKey = `kyb/${kybId}/${documentType}/${Date.now()}-${fileName}`;

    // In production, generate actual presigned URL from S3/GCS
    // For now, return a mock structure
    const uploadUrl = `https://storage.microcrop.app/upload/${fileKey}`;
    const downloadUrl = `https://storage.microcrop.app/files/${fileKey}`;

    return {
      uploadUrl,
      downloadUrl,
      fileKey,
      expiresIn: 3600, // 1 hour
    };
  },

  /**
   * Record uploaded document
   */
  async recordDocument(kybId, documentType, fileName, fileUrl, fileSize, mimeType) {
    const kyb = await prisma.kYBVerification.findUnique({
      where: { id: kybId },
    });

    if (!kyb) {
      throw new AppError('KYB verification not found', 404, 'KYB_NOT_FOUND');
    }

    // Check if document of this type already exists
    const existingDoc = await prisma.kYBDocument.findFirst({
      where: {
        kybVerificationId: kybId,
        documentType,
      },
    });

    if (existingDoc) {
      // Update existing document
      const document = await prisma.kYBDocument.update({
        where: { id: existingDoc.id },
        data: {
          fileName,
          fileUrl,
          fileSize,
          mimeType,
          isVerified: false,
          verifiedBy: null,
          verifiedAt: null,
          rejectionReason: null,
        },
      });
      return document;
    }

    // Create new document
    const document = await prisma.kYBDocument.create({
      data: {
        kybVerificationId: kybId,
        documentType,
        fileName,
        fileUrl,
        fileSize,
        mimeType,
      },
    });

    return document;
  },

  /**
   * Get documents for a KYB verification
   */
  async getDocuments(kybId) {
    const documents = await prisma.kYBDocument.findMany({
      where: { kybVerificationId: kybId },
      orderBy: { uploadedAt: 'desc' },
    });

    return documents;
  },

  /**
   * Verify or reject a document (Platform Admin)
   */
  async verifyDocument(documentId, isVerified, verifiedBy, rejectionReason = null) {
    const document = await prisma.kYBDocument.findUnique({
      where: { id: documentId },
      include: { kybVerification: true },
    });

    if (!document) {
      throw new AppError('Document not found', 404, 'DOCUMENT_NOT_FOUND');
    }

    const updateData = {
      isVerified,
      verifiedBy,
      verifiedAt: new Date(),
    };

    if (!isVerified && rejectionReason) {
      updateData.rejectionReason = rejectionReason;
    }

    const updatedDocument = await prisma.$transaction(async (tx) => {
      const doc = await tx.kYBDocument.update({
        where: { id: documentId },
        data: updateData,
      });

      // Update KYB verification checklist based on document type
      const kybUpdateData = {};
      const fieldMap = {
        BUSINESS_REGISTRATION: 'businessRegistrationVerified',
        TAX_CERTIFICATE: 'taxCertificateVerified',
        DIRECTOR_ID: 'directorIdVerified',
        PROOF_OF_ADDRESS: 'proofOfAddressVerified',
        BANK_STATEMENT: 'bankStatementVerified',
      };

      if (fieldMap[document.documentType]) {
        kybUpdateData[fieldMap[document.documentType]] = isVerified;
      }

      if (Object.keys(kybUpdateData).length > 0) {
        await tx.kYBVerification.update({
          where: { id: document.kybVerificationId },
          data: kybUpdateData,
        });
      }

      return doc;
    });

    return updatedDocument;
  },

  /**
   * Update KYB verification status (Platform Admin)
   */
  async updateStatus(kybId, status, verifiedBy, verifierNotes = null) {
    const kyb = await prisma.kYBVerification.findUnique({
      where: { id: kybId },
      include: { application: true },
    });

    if (!kyb) {
      throw new AppError('KYB verification not found', 404, 'KYB_NOT_FOUND');
    }

    const updateData = {
      status,
      verifierNotes,
    };

    if (status === 'VERIFIED' || status === 'REJECTED') {
      updateData.verifiedBy = verifiedBy;
      updateData.verifiedAt = new Date();
    }

    const result = await prisma.$transaction(async (tx) => {
      const updatedKyb = await tx.kYBVerification.update({
        where: { id: kybId },
        data: updateData,
        include: {
          documents: true,
          application: true,
        },
      });

      // Update application status based on KYB status
      let applicationStatus = kyb.application.status;
      if (status === 'VERIFIED') {
        applicationStatus = 'KYB_SUBMITTED';
      } else if (status === 'DOCUMENTS_REQUIRED') {
        applicationStatus = 'KYB_IN_PROGRESS';
      } else if (status === 'REJECTED') {
        applicationStatus = 'REJECTED';
      }

      if (applicationStatus !== kyb.application.status) {
        await tx.organizationApplication.update({
          where: { id: kyb.applicationId },
          data: { status: applicationStatus },
        });
      }

      return updatedKyb;
    });

    return result;
  },

  /**
   * Submit KYB for review (applicant action)
   */
  async submitForReview(kybId) {
    const kyb = await prisma.kYBVerification.findUnique({
      where: { id: kybId },
      include: { documents: true },
    });

    if (!kyb) {
      throw new AppError('KYB verification not found', 404, 'KYB_NOT_FOUND');
    }

    // Check required documents
    const requiredTypes = ['BUSINESS_REGISTRATION', 'TAX_CERTIFICATE', 'DIRECTOR_ID'];
    const uploadedTypes = kyb.documents.map(d => d.documentType);
    const missingTypes = requiredTypes.filter(t => !uploadedTypes.includes(t));

    if (missingTypes.length > 0) {
      throw new AppError(
        `Missing required documents: ${missingTypes.join(', ')}`,
        400,
        'MISSING_DOCUMENTS'
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      const updatedKyb = await tx.kYBVerification.update({
        where: { id: kybId },
        data: { status: 'UNDER_REVIEW' },
      });

      await tx.organizationApplication.update({
        where: { id: kyb.applicationId },
        data: { status: 'KYB_SUBMITTED' },
      });

      return updatedKyb;
    });

    return result;
  },

  /**
   * Get KYB statistics (Platform Admin dashboard)
   */
  async getStats() {
    const [
      total,
      pending,
      inProgress,
      documentsRequired,
      underReview,
      verified,
      rejected,
    ] = await Promise.all([
      prisma.kYBVerification.count(),
      prisma.kYBVerification.count({ where: { status: 'PENDING' } }),
      prisma.kYBVerification.count({ where: { status: 'IN_PROGRESS' } }),
      prisma.kYBVerification.count({ where: { status: 'DOCUMENTS_REQUIRED' } }),
      prisma.kYBVerification.count({ where: { status: 'UNDER_REVIEW' } }),
      prisma.kYBVerification.count({ where: { status: 'VERIFIED' } }),
      prisma.kYBVerification.count({ where: { status: 'REJECTED' } }),
    ]);

    return {
      total,
      byStatus: {
        pending,
        inProgress,
        documentsRequired,
        underReview,
        verified,
        rejected,
      },
    };
  },
};

export default kybService;
