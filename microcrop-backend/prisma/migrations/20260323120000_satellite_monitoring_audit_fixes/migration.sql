-- CreateEnum
CREATE TYPE "FraudFlagType" AS ENUM ('NDVI_MISMATCH', 'BOUNDARY_OVERLAP', 'SUSPICIOUS_TIMING', 'HISTORICAL_ANOMALY');

-- CreateEnum
CREATE TYPE "FraudSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "FraudFlagStatus" AS ENUM ('OPEN', 'INVESTIGATING', 'CONFIRMED_FRAUD', 'CLEARED', 'DISMISSED');

-- AlterTable: Add satellite monitoring fields to Plot
ALTER TABLE "Plot" ADD COLUMN "boundary" JSONB,
ADD COLUMN "centroidLat" DECIMAL(10,8),
ADD COLUMN "centroidLon" DECIMAL(11,8),
ADD COLUMN "areaHectares" DECIMAL(10,4);

-- AlterTable: Add new fields to SatelliteData
ALTER TABLE "SatelliteData" ADD COLUMN "organizationId" TEXT,
ADD COLUMN "ndviMin" DECIMAL(4,3),
ADD COLUMN "ndviMax" DECIMAL(4,3),
ADD COLUMN "ndviStdDev" DECIMAL(4,3),
ADD COLUMN "sampleCount" INTEGER,
ADD COLUMN "source" TEXT NOT NULL DEFAULT 'SENTINEL2';

-- CreateTable
CREATE TABLE "NDVIBaseline" (
    "id" TEXT NOT NULL,
    "plotId" TEXT NOT NULL,
    "periodStart" INTEGER NOT NULL,
    "periodEnd" INTEGER NOT NULL,
    "baselineMean" DECIMAL(4,3) NOT NULL,
    "baselineMedian" DECIMAL(4,3) NOT NULL,
    "baselineStdDev" DECIMAL(4,3) NOT NULL,
    "yearsIncluded" INTEGER NOT NULL,
    "cropType" "CropType" NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NDVIBaseline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FraudFlag" (
    "id" TEXT NOT NULL,
    "policyId" TEXT,
    "plotId" TEXT,
    "farmerId" TEXT,
    "organizationId" TEXT NOT NULL,
    "type" "FraudFlagType" NOT NULL,
    "severity" "FraudSeverity" NOT NULL DEFAULT 'MEDIUM',
    "description" TEXT NOT NULL,
    "claimedDamage" DECIMAL(5,2),
    "satelliteNdvi" DECIMAL(4,3),
    "baselineNdvi" DECIMAL(4,3),
    "confidenceScore" DECIMAL(5,4) NOT NULL,
    "status" "FraudFlagStatus" NOT NULL DEFAULT 'OPEN',
    "resolvedBy" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolution" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FraudFlag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: SatelliteData unique constraint and indexes
CREATE UNIQUE INDEX "SatelliteData_plotId_captureDate_source_key" ON "SatelliteData"("plotId", "captureDate", "source");

-- SatelliteData_plotId_captureDate_idx already exists from init migration

CREATE INDEX "SatelliteData_organizationId_captureDate_idx" ON "SatelliteData"("organizationId", "captureDate" DESC);

CREATE INDEX "SatelliteData_captureDate_idx" ON "SatelliteData"("captureDate");

CREATE INDEX "SatelliteData_organizationId_idx" ON "SatelliteData"("organizationId");

-- CreateIndex: NDVIBaseline
CREATE UNIQUE INDEX "NDVIBaseline_plotId_periodStart_periodEnd_key" ON "NDVIBaseline"("plotId", "periodStart", "periodEnd");

CREATE INDEX "NDVIBaseline_plotId_idx" ON "NDVIBaseline"("plotId");

CREATE INDEX "NDVIBaseline_plotId_periodStart_idx" ON "NDVIBaseline"("plotId", "periodStart");

-- CreateIndex: FraudFlag
CREATE INDEX "FraudFlag_organizationId_status_idx" ON "FraudFlag"("organizationId", "status");

CREATE INDEX "FraudFlag_policyId_idx" ON "FraudFlag"("policyId");

CREATE INDEX "FraudFlag_plotId_idx" ON "FraudFlag"("plotId");

CREATE INDEX "FraudFlag_type_idx" ON "FraudFlag"("type");

CREATE INDEX "FraudFlag_createdAt_idx" ON "FraudFlag"("createdAt");

-- AddForeignKey
ALTER TABLE "SatelliteData" ADD CONSTRAINT "SatelliteData_plotId_fkey" FOREIGN KEY ("plotId") REFERENCES "Plot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "NDVIBaseline" ADD CONSTRAINT "NDVIBaseline_plotId_fkey" FOREIGN KEY ("plotId") REFERENCES "Plot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FraudFlag" ADD CONSTRAINT "FraudFlag_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "Policy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "FraudFlag" ADD CONSTRAINT "FraudFlag_plotId_fkey" FOREIGN KEY ("plotId") REFERENCES "Plot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "FraudFlag" ADD CONSTRAINT "FraudFlag_farmerId_fkey" FOREIGN KEY ("farmerId") REFERENCES "Farmer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
