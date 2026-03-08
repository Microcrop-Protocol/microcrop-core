-- CreateEnum
CREATE TYPE "LivestockType" AS ENUM ('CATTLE', 'GOAT', 'SHEEP', 'CAMEL', 'POULTRY');

-- CreateEnum
CREATE TYPE "LivestockPeril" AS ENUM ('DROUGHT_PASTURE', 'DISEASE_OUTBREAK', 'HEAT_STRESS');

-- CreateEnum
CREATE TYPE "InsuranceProduct" AS ENUM ('CROP', 'LIVESTOCK');

-- AlterEnum
ALTER TYPE "CoverageType" ADD VALUE 'LIVESTOCK_DROUGHT';
ALTER TYPE "CoverageType" ADD VALUE 'LIVESTOCK_DISEASE';
ALTER TYPE "CoverageType" ADD VALUE 'LIVESTOCK_COMPREHENSIVE';

-- AlterTable: Organization
ALTER TABLE "Organization" ADD COLUMN "livestockPoolAddress" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Organization_livestockPoolAddress_key" ON "Organization"("livestockPoolAddress");

-- CreateTable: Herd
CREATE TABLE "Herd" (
    "id" TEXT NOT NULL,
    "farmerId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "livestockType" "LivestockType" NOT NULL,
    "headCount" INTEGER NOT NULL,
    "estimatedValue" DECIMAL(12,2) NOT NULL,
    "latitude" DECIMAL(10,8) NOT NULL,
    "longitude" DECIMAL(11,8) NOT NULL,
    "weatherStationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Herd_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Herd_organizationId_idx" ON "Herd"("organizationId");
CREATE INDEX "Herd_farmerId_idx" ON "Herd"("farmerId");
CREATE INDEX "Herd_livestockType_idx" ON "Herd"("livestockType");
CREATE INDEX "Herd_organizationId_farmerId_idx" ON "Herd"("organizationId", "farmerId");

-- AddForeignKey
ALTER TABLE "Herd" ADD CONSTRAINT "Herd_farmerId_fkey" FOREIGN KEY ("farmerId") REFERENCES "Farmer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Herd" ADD CONSTRAINT "Herd_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: Policy — add livestock fields
ALTER TABLE "Policy" ADD COLUMN "productType" "InsuranceProduct" NOT NULL DEFAULT 'CROP',
ADD COLUMN "herdId" TEXT,
ADD COLUMN "livestockPeril" "LivestockPeril";

-- Make plotId nullable (livestock policies have no plot)
ALTER TABLE "Policy" ALTER COLUMN "plotId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "Policy_productType_idx" ON "Policy"("productType");
CREATE INDEX "Policy_herdId_idx" ON "Policy"("herdId");

-- AddForeignKey
ALTER TABLE "Policy" ADD CONSTRAINT "Policy_herdId_fkey" FOREIGN KEY ("herdId") REFERENCES "Herd"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable: DamageAssessment — add NDVI damage for pasture
ALTER TABLE "DamageAssessment" ADD COLUMN "ndviDamage" DECIMAL(5,2);
