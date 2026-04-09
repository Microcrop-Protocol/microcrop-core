-- AlterTable: Add on-chain step checkpoint fields to Policy
ALTER TABLE "Policy" ADD COLUMN "premiumReceivedOnChain" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Policy" ADD COLUMN "premiumDistributedOnChain" BOOLEAN NOT NULL DEFAULT false;
