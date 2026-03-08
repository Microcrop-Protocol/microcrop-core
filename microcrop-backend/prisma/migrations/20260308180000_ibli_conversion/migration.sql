-- CreateEnum
CREATE TYPE "IBLISeason" AS ENUM ('LRLD', 'SRSD');

-- CreateEnum
CREATE TYPE "ForageAlertStatus" AS ENUM ('TRIGGERED', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "InsuranceUnit" (
    "id" TEXT NOT NULL,
    "county" TEXT NOT NULL,
    "subCounty" TEXT,
    "unitCode" TEXT NOT NULL,
    "ndviBaselineLRLD" DECIMAL(4,3) NOT NULL,
    "ndviBaselineSRSD" DECIMAL(4,3) NOT NULL,
    "strikeLevelLRLD" DECIMAL(4,3) NOT NULL,
    "strikeLevelSRSD" DECIMAL(4,3) NOT NULL,
    "premiumRateLRLD" DECIMAL(10,2) NOT NULL,
    "premiumRateSRSD" DECIMAL(10,2) NOT NULL,
    "valuePerTLU" DECIMAL(10,2) NOT NULL DEFAULT 15000,
    "seasonalConfig" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InsuranceUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InsuranceUnitNDVI" (
    "id" TEXT NOT NULL,
    "insuranceUnitId" TEXT NOT NULL,
    "season" "IBLISeason" NOT NULL,
    "year" INTEGER NOT NULL,
    "captureDate" TIMESTAMP(3) NOT NULL,
    "ndviValue" DECIMAL(4,3) NOT NULL,
    "cumulativeNDVI" DECIMAL(6,3) NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'MODIS',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InsuranceUnitNDVI_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForageAlert" (
    "id" TEXT NOT NULL,
    "insuranceUnitId" TEXT NOT NULL,
    "season" "IBLISeason" NOT NULL,
    "year" INTEGER NOT NULL,
    "cumulativeNDVI" DECIMAL(6,3) NOT NULL,
    "strikeLevel" DECIMAL(4,3) NOT NULL,
    "deficitPercent" DECIMAL(5,2) NOT NULL,
    "status" "ForageAlertStatus" NOT NULL DEFAULT 'TRIGGERED',
    "policiesAffected" INTEGER NOT NULL DEFAULT 0,
    "totalPayoutUSDC" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ForageAlert_pkey" PRIMARY KEY ("id")
);

-- AlterTable: Herd — make lat/lng nullable, add TLU + insurance unit
ALTER TABLE "Herd" ALTER COLUMN "latitude" DROP NOT NULL;
ALTER TABLE "Herd" ALTER COLUMN "longitude" DROP NOT NULL;
ALTER TABLE "Herd" ADD COLUMN "tluCount" DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "Herd" ADD COLUMN "insuranceUnitId" TEXT;

-- AlterTable: Policy — add IBLI season + insurance unit
ALTER TABLE "Policy" ADD COLUMN "season" "IBLISeason";
ALTER TABLE "Policy" ADD COLUMN "insuranceUnitId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "InsuranceUnit_unitCode_key" ON "InsuranceUnit"("unitCode");
CREATE INDEX "InsuranceUnit_county_idx" ON "InsuranceUnit"("county");
CREATE INDEX "InsuranceUnit_isActive_idx" ON "InsuranceUnit"("isActive");

CREATE INDEX "InsuranceUnitNDVI_insuranceUnitId_season_year_idx" ON "InsuranceUnitNDVI"("insuranceUnitId", "season", "year");
CREATE INDEX "InsuranceUnitNDVI_captureDate_idx" ON "InsuranceUnitNDVI"("captureDate");
CREATE UNIQUE INDEX "InsuranceUnitNDVI_insuranceUnitId_season_year_captureDate_key" ON "InsuranceUnitNDVI"("insuranceUnitId", "season", "year", "captureDate");

CREATE INDEX "ForageAlert_insuranceUnitId_season_year_idx" ON "ForageAlert"("insuranceUnitId", "season", "year");
CREATE INDEX "ForageAlert_status_idx" ON "ForageAlert"("status");
CREATE INDEX "ForageAlert_createdAt_idx" ON "ForageAlert"("createdAt");

CREATE INDEX "Herd_insuranceUnitId_idx" ON "Herd"("insuranceUnitId");
CREATE INDEX "Policy_insuranceUnitId_season_idx" ON "Policy"("insuranceUnitId", "season");

-- AddForeignKey
ALTER TABLE "Herd" ADD CONSTRAINT "Herd_insuranceUnitId_fkey" FOREIGN KEY ("insuranceUnitId") REFERENCES "InsuranceUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Policy" ADD CONSTRAINT "Policy_insuranceUnitId_fkey" FOREIGN KEY ("insuranceUnitId") REFERENCES "InsuranceUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InsuranceUnitNDVI" ADD CONSTRAINT "InsuranceUnitNDVI_insuranceUnitId_fkey" FOREIGN KEY ("insuranceUnitId") REFERENCES "InsuranceUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ForageAlert" ADD CONSTRAINT "ForageAlert_insuranceUnitId_fkey" FOREIGN KEY ("insuranceUnitId") REFERENCES "InsuranceUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
