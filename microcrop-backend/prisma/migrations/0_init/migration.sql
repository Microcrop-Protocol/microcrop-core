-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "OrgType" AS ENUM ('COOPERATIVE', 'NGO', 'MFI', 'INSURANCE_COMPANY', 'GOVERNMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "OrgKYBStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'PENDING_REVIEW', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "OnboardingStep" AS ENUM ('APPLICATION', 'KYB_VERIFICATION', 'POOL_DEPLOYMENT', 'ADMIN_SETUP', 'COMPLETED');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('PLATFORM_ADMIN', 'ORG_ADMIN', 'ORG_STAFF', 'FARMER');

-- CreateEnum
CREATE TYPE "KYCStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "CropType" AS ENUM ('MAIZE', 'BEANS', 'RICE', 'SORGHUM', 'MILLET', 'VEGETABLES', 'CASSAVA', 'SWEET_POTATO', 'BANANA', 'COFFEE', 'TEA', 'WHEAT', 'BARLEY', 'POTATOES');

-- CreateEnum
CREATE TYPE "CoverageType" AS ENUM ('DROUGHT', 'FLOOD', 'BOTH', 'COMPREHENSIVE');

-- CreateEnum
CREATE TYPE "PolicyStatus" AS ENUM ('PENDING', 'ACTIVE', 'EXPIRED', 'CANCELLED', 'CLAIMED');

-- CreateEnum
CREATE TYPE "DamageSource" AS ENUM ('ON_CHAIN', 'MANUAL', 'CRE');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('PREMIUM', 'PAYOUT', 'REFUND');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('PENDING_REVIEW', 'UNDER_REVIEW', 'KYB_REQUIRED', 'KYB_IN_PROGRESS', 'KYB_SUBMITTED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'DOCUMENTS_REQUIRED', 'UNDER_REVIEW', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "KYBDocumentType" AS ENUM ('BUSINESS_REGISTRATION', 'TAX_CERTIFICATE', 'DIRECTOR_ID', 'PROOF_OF_ADDRESS', 'BANK_STATEMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED');

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "registrationNumber" TEXT NOT NULL,
    "type" "OrgType" NOT NULL,
    "poolAddress" TEXT,
    "adminWallet" TEXT,
    "ussdShortCode" TEXT,
    "brandName" TEXT NOT NULL,
    "brandColor" TEXT DEFAULT '#1a73e8',
    "logoUrl" TEXT,
    "apiKey" TEXT NOT NULL,
    "apiSecret" TEXT NOT NULL,
    "webhookUrl" TEXT,
    "contactPerson" TEXT,
    "contactPhone" TEXT,
    "contactEmail" TEXT,
    "county" TEXT,
    "country" TEXT NOT NULL DEFAULT 'Kenya',
    "kybStatus" "OrgKYBStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "onboardingStep" "OnboardingStep" NOT NULL DEFAULT 'APPLICATION',
    "totalPoliciesCreated" INTEGER NOT NULL DEFAULT 0,
    "totalPremiumsCollected" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "totalFeesGenerated" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "totalPayoutsProcessed" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "lastPolicyCreatedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "password" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "organizationId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "lastLogin" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Farmer" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "nationalId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "walletAddress" TEXT,
    "county" TEXT NOT NULL,
    "subCounty" TEXT NOT NULL,
    "ward" TEXT,
    "village" TEXT,
    "kycStatus" "KYCStatus" NOT NULL DEFAULT 'PENDING',
    "kycApprovedBy" TEXT,
    "kycApprovedAt" TIMESTAMP(3),
    "kycRejectedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Farmer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Plot" (
    "id" TEXT NOT NULL,
    "farmerId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "latitude" DECIMAL(10,8) NOT NULL,
    "longitude" DECIMAL(11,8) NOT NULL,
    "acreage" DECIMAL(10,2) NOT NULL,
    "cropType" "CropType" NOT NULL,
    "plantingDate" TIMESTAMP(3),
    "weatherStationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Plot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Policy" (
    "id" TEXT NOT NULL,
    "policyId" TEXT,
    "onChainPolicyId" TEXT,
    "policyNumber" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "poolAddress" TEXT NOT NULL,
    "farmerId" TEXT NOT NULL,
    "plotId" TEXT NOT NULL,
    "coverageType" "CoverageType" NOT NULL,
    "sumInsured" DECIMAL(12,2) NOT NULL,
    "premium" DECIMAL(12,2) NOT NULL,
    "platformFee" DECIMAL(12,2) NOT NULL,
    "netPremium" DECIMAL(12,2) NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "durationDays" INTEGER NOT NULL,
    "status" "PolicyStatus" NOT NULL DEFAULT 'PENDING',
    "txHash" TEXT,
    "blockNumber" BIGINT,
    "premiumPaid" BOOLEAN NOT NULL DEFAULT false,
    "premiumTxHash" TEXT,
    "premiumPaidAt" TIMESTAMP(3),
    "premiumKES" DECIMAL(12,2),
    "swyptOrderId" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Policy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DamageAssessment" (
    "id" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "organizationId" TEXT,
    "weatherDamage" DECIMAL(5,2),
    "satelliteDamage" DECIMAL(5,2),
    "combinedDamage" DECIMAL(5,2),
    "damagePercent" INTEGER,
    "proof" TEXT,
    "source" "DamageSource" NOT NULL DEFAULT 'ON_CHAIN',
    "txHash" TEXT,
    "blockNumber" BIGINT,
    "triggered" BOOLEAN NOT NULL DEFAULT false,
    "triggerDate" TIMESTAMP(3),
    "proofHash" TEXT,
    "submittedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DamageAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payout" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "farmerId" TEXT,
    "amountUSDC" DECIMAL(12,2) NOT NULL,
    "amountKES" DECIMAL(12,2),
    "exchangeRate" DECIMAL(10,4),
    "damagePercent" DECIMAL(5,2) NOT NULL,
    "status" "PayoutStatus" NOT NULL DEFAULT 'PENDING',
    "txHash" TEXT,
    "blockNumber" BIGINT,
    "mpesaRef" TEXT,
    "mpesaPhone" TEXT,
    "swyptOrderId" TEXT,
    "initiatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processingAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "failureReason" TEXT,

    CONSTRAINT "Payout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "farmerId" TEXT,
    "type" "TransactionType" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USDC',
    "status" "TransactionStatus" NOT NULL DEFAULT 'PENDING',
    "policyId" TEXT,
    "payoutId" TEXT,
    "reference" TEXT NOT NULL,
    "phoneNumber" TEXT,
    "description" TEXT,
    "externalRef" TEXT,
    "failureReason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformFee" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "poolAddress" TEXT NOT NULL,
    "premium" DECIMAL(12,2) NOT NULL,
    "feeAmount" DECIMAL(12,2) NOT NULL,
    "feePercent" DECIMAL(5,2) NOT NULL,
    "txHash" TEXT NOT NULL,
    "blockNumber" BIGINT NOT NULL,
    "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformFee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "USSDSession" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "USSDSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncState" (
    "id" TEXT NOT NULL,
    "contractAddress" TEXT NOT NULL,
    "contractName" TEXT NOT NULL,
    "lastBlock" BIGINT NOT NULL,
    "lastSyncAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SyncState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeatherEvent" (
    "id" TEXT NOT NULL,
    "plotId" TEXT NOT NULL,
    "stationId" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "rainfall" DECIMAL(10,2),
    "temperature" DECIMAL(5,2),
    "humidity" DECIMAL(5,2),
    "windSpeed" DECIMAL(5,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeatherEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SatelliteData" (
    "id" TEXT NOT NULL,
    "plotId" TEXT NOT NULL,
    "captureDate" TIMESTAMP(3) NOT NULL,
    "ndvi" DECIMAL(4,3),
    "evi" DECIMAL(4,3),
    "cloudCover" DECIMAL(5,2),
    "biomass" DECIMAL(5,2),
    "imageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SatelliteData_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyOrganizationStats" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "policiesCreated" INTEGER NOT NULL DEFAULT 0,
    "payoutsProcessed" INTEGER NOT NULL DEFAULT 0,
    "farmersRegistered" INTEGER NOT NULL DEFAULT 0,
    "premiumsCollected" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "feesGenerated" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "payoutsAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyOrganizationStats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyPlatformStats" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "activeOrganizations" INTEGER NOT NULL DEFAULT 0,
    "totalPolicies" INTEGER NOT NULL DEFAULT 0,
    "totalPayoutsCount" INTEGER NOT NULL DEFAULT 0,
    "totalPremiums" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "totalFees" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "totalPayoutsAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyPlatformStats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationApplication" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "registrationNumber" TEXT NOT NULL,
    "type" "OrgType" NOT NULL,
    "contactFirstName" TEXT NOT NULL,
    "contactLastName" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "contactPhone" TEXT NOT NULL,
    "county" TEXT,
    "estimatedFarmers" INTEGER,
    "website" TEXT,
    "description" TEXT,
    "businessRegistrationCertUrl" TEXT,
    "businessRegistrationCertName" TEXT,
    "taxPinCertUrl" TEXT,
    "taxPinCertName" TEXT,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "organizationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KYBVerification" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "status" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "businessRegistrationVerified" BOOLEAN NOT NULL DEFAULT false,
    "taxCertificateVerified" BOOLEAN NOT NULL DEFAULT false,
    "directorIdVerified" BOOLEAN NOT NULL DEFAULT false,
    "proofOfAddressVerified" BOOLEAN NOT NULL DEFAULT false,
    "bankStatementVerified" BOOLEAN NOT NULL DEFAULT false,
    "verifierNotes" TEXT,
    "verifiedBy" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KYBVerification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KYBDocument" (
    "id" TEXT NOT NULL,
    "kybVerificationId" TEXT NOT NULL,
    "documentType" "KYBDocumentType" NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedBy" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KYBDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgAdminInvitation" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL,
    "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "usedAt" TIMESTAMP(3),
    "invitedBy" TEXT NOT NULL,
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrgAdminInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_registrationNumber_key" ON "Organization"("registrationNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_poolAddress_key" ON "Organization"("poolAddress");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_ussdShortCode_key" ON "Organization"("ussdShortCode");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_apiKey_key" ON "Organization"("apiKey");

-- CreateIndex
CREATE INDEX "Organization_poolAddress_idx" ON "Organization"("poolAddress");

-- CreateIndex
CREATE INDEX "Organization_isActive_idx" ON "Organization"("isActive");

-- CreateIndex
CREATE INDEX "Organization_type_idx" ON "Organization"("type");

-- CreateIndex
CREATE INDEX "Organization_country_county_idx" ON "Organization"("country", "county");

-- CreateIndex
CREATE INDEX "Organization_kybStatus_idx" ON "Organization"("kybStatus");

-- CreateIndex
CREATE INDEX "Organization_onboardingStep_idx" ON "Organization"("onboardingStep");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "User_organizationId_idx" ON "User"("organizationId");

-- CreateIndex
CREATE INDEX "Farmer_organizationId_idx" ON "Farmer"("organizationId");

-- CreateIndex
CREATE INDEX "Farmer_organizationId_phoneNumber_idx" ON "Farmer"("organizationId", "phoneNumber");

-- CreateIndex
CREATE INDEX "Farmer_organizationId_kycStatus_idx" ON "Farmer"("organizationId", "kycStatus");

-- CreateIndex
CREATE UNIQUE INDEX "Farmer_organizationId_phoneNumber_key" ON "Farmer"("organizationId", "phoneNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Farmer_organizationId_nationalId_key" ON "Farmer"("organizationId", "nationalId");

-- CreateIndex
CREATE INDEX "Plot_organizationId_idx" ON "Plot"("organizationId");

-- CreateIndex
CREATE INDEX "Plot_farmerId_idx" ON "Plot"("farmerId");

-- CreateIndex
CREATE INDEX "Plot_cropType_idx" ON "Plot"("cropType");

-- CreateIndex
CREATE INDEX "Plot_organizationId_farmerId_idx" ON "Plot"("organizationId", "farmerId");

-- CreateIndex
CREATE UNIQUE INDEX "Policy_policyId_key" ON "Policy"("policyId");

-- CreateIndex
CREATE UNIQUE INDEX "Policy_policyNumber_key" ON "Policy"("policyNumber");

-- CreateIndex
CREATE INDEX "Policy_organizationId_idx" ON "Policy"("organizationId");

-- CreateIndex
CREATE INDEX "Policy_organizationId_status_idx" ON "Policy"("organizationId", "status");

-- CreateIndex
CREATE INDEX "Policy_farmerId_idx" ON "Policy"("farmerId");

-- CreateIndex
CREATE INDEX "Policy_status_idx" ON "Policy"("status");

-- CreateIndex
CREATE INDEX "Policy_startDate_endDate_idx" ON "Policy"("startDate", "endDate");

-- CreateIndex
CREATE INDEX "Policy_poolAddress_idx" ON "Policy"("poolAddress");

-- CreateIndex
CREATE INDEX "DamageAssessment_policyId_idx" ON "DamageAssessment"("policyId");

-- CreateIndex
CREATE INDEX "DamageAssessment_triggerDate_idx" ON "DamageAssessment"("triggerDate");

-- CreateIndex
CREATE INDEX "DamageAssessment_triggered_idx" ON "DamageAssessment"("triggered");

-- CreateIndex
CREATE INDEX "DamageAssessment_organizationId_idx" ON "DamageAssessment"("organizationId");

-- CreateIndex
CREATE INDEX "Payout_organizationId_idx" ON "Payout"("organizationId");

-- CreateIndex
CREATE INDEX "Payout_organizationId_status_idx" ON "Payout"("organizationId", "status");

-- CreateIndex
CREATE INDEX "Payout_policyId_idx" ON "Payout"("policyId");

-- CreateIndex
CREATE INDEX "Payout_status_idx" ON "Payout"("status");

-- CreateIndex
CREATE INDEX "Payout_initiatedAt_idx" ON "Payout"("initiatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_reference_key" ON "Transaction"("reference");

-- CreateIndex
CREATE INDEX "Transaction_organizationId_idx" ON "Transaction"("organizationId");

-- CreateIndex
CREATE INDEX "Transaction_organizationId_type_idx" ON "Transaction"("organizationId", "type");

-- CreateIndex
CREATE INDEX "Transaction_farmerId_idx" ON "Transaction"("farmerId");

-- CreateIndex
CREATE INDEX "Transaction_type_idx" ON "Transaction"("type");

-- CreateIndex
CREATE INDEX "Transaction_status_idx" ON "Transaction"("status");

-- CreateIndex
CREATE INDEX "Transaction_reference_idx" ON "Transaction"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformFee_txHash_key" ON "PlatformFee"("txHash");

-- CreateIndex
CREATE INDEX "PlatformFee_organizationId_idx" ON "PlatformFee"("organizationId");

-- CreateIndex
CREATE INDEX "PlatformFee_organizationId_collectedAt_idx" ON "PlatformFee"("organizationId", "collectedAt");

-- CreateIndex
CREATE INDEX "PlatformFee_collectedAt_idx" ON "PlatformFee"("collectedAt");

-- CreateIndex
CREATE INDEX "PlatformFee_poolAddress_idx" ON "PlatformFee"("poolAddress");

-- CreateIndex
CREATE UNIQUE INDEX "USSDSession_sessionId_key" ON "USSDSession"("sessionId");

-- CreateIndex
CREATE INDEX "USSDSession_sessionId_idx" ON "USSDSession"("sessionId");

-- CreateIndex
CREATE INDEX "USSDSession_expiresAt_idx" ON "USSDSession"("expiresAt");

-- CreateIndex
CREATE INDEX "USSDSession_organizationId_phoneNumber_idx" ON "USSDSession"("organizationId", "phoneNumber");

-- CreateIndex
CREATE UNIQUE INDEX "SyncState_contractAddress_key" ON "SyncState"("contractAddress");

-- CreateIndex
CREATE INDEX "SyncState_contractAddress_idx" ON "SyncState"("contractAddress");

-- CreateIndex
CREATE INDEX "WeatherEvent_plotId_timestamp_idx" ON "WeatherEvent"("plotId", "timestamp" DESC);

-- CreateIndex
CREATE INDEX "WeatherEvent_stationId_idx" ON "WeatherEvent"("stationId");

-- CreateIndex
CREATE INDEX "SatelliteData_plotId_captureDate_idx" ON "SatelliteData"("plotId", "captureDate" DESC);

-- CreateIndex
CREATE INDEX "DailyOrganizationStats_organizationId_date_idx" ON "DailyOrganizationStats"("organizationId", "date");

-- CreateIndex
CREATE INDEX "DailyOrganizationStats_date_idx" ON "DailyOrganizationStats"("date");

-- CreateIndex
CREATE UNIQUE INDEX "DailyOrganizationStats_organizationId_date_key" ON "DailyOrganizationStats"("organizationId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "DailyPlatformStats_date_key" ON "DailyPlatformStats"("date");

-- CreateIndex
CREATE INDEX "DailyPlatformStats_date_idx" ON "DailyPlatformStats"("date");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationApplication_contactEmail_key" ON "OrganizationApplication"("contactEmail");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationApplication_organizationId_key" ON "OrganizationApplication"("organizationId");

-- CreateIndex
CREATE INDEX "OrganizationApplication_status_idx" ON "OrganizationApplication"("status");

-- CreateIndex
CREATE INDEX "OrganizationApplication_contactEmail_idx" ON "OrganizationApplication"("contactEmail");

-- CreateIndex
CREATE INDEX "OrganizationApplication_createdAt_idx" ON "OrganizationApplication"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "KYBVerification_applicationId_key" ON "KYBVerification"("applicationId");

-- CreateIndex
CREATE INDEX "KYBVerification_status_idx" ON "KYBVerification"("status");

-- CreateIndex
CREATE INDEX "KYBVerification_applicationId_idx" ON "KYBVerification"("applicationId");

-- CreateIndex
CREATE INDEX "KYBDocument_kybVerificationId_idx" ON "KYBDocument"("kybVerificationId");

-- CreateIndex
CREATE INDEX "KYBDocument_documentType_idx" ON "KYBDocument"("documentType");

-- CreateIndex
CREATE UNIQUE INDEX "OrgAdminInvitation_token_key" ON "OrgAdminInvitation"("token");

-- CreateIndex
CREATE INDEX "OrgAdminInvitation_token_idx" ON "OrgAdminInvitation"("token");

-- CreateIndex
CREATE INDEX "OrgAdminInvitation_email_idx" ON "OrgAdminInvitation"("email");

-- CreateIndex
CREATE INDEX "OrgAdminInvitation_organizationId_idx" ON "OrgAdminInvitation"("organizationId");

-- CreateIndex
CREATE INDEX "OrgAdminInvitation_status_idx" ON "OrgAdminInvitation"("status");

-- CreateIndex
CREATE INDEX "OrgAdminInvitation_expiresAt_idx" ON "OrgAdminInvitation"("expiresAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Farmer" ADD CONSTRAINT "Farmer_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Plot" ADD CONSTRAINT "Plot_farmerId_fkey" FOREIGN KEY ("farmerId") REFERENCES "Farmer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Plot" ADD CONSTRAINT "Plot_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Policy" ADD CONSTRAINT "Policy_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Policy" ADD CONSTRAINT "Policy_farmerId_fkey" FOREIGN KEY ("farmerId") REFERENCES "Farmer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Policy" ADD CONSTRAINT "Policy_plotId_fkey" FOREIGN KEY ("plotId") REFERENCES "Plot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DamageAssessment" ADD CONSTRAINT "DamageAssessment_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "Policy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "Policy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_farmerId_fkey" FOREIGN KEY ("farmerId") REFERENCES "Farmer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformFee" ADD CONSTRAINT "PlatformFee_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationApplication" ADD CONSTRAINT "OrganizationApplication_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KYBVerification" ADD CONSTRAINT "KYBVerification_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "OrganizationApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KYBDocument" ADD CONSTRAINT "KYBDocument_kybVerificationId_fkey" FOREIGN KEY ("kybVerificationId") REFERENCES "KYBVerification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgAdminInvitation" ADD CONSTRAINT "OrgAdminInvitation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

