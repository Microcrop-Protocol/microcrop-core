-- AlterEnum
ALTER TYPE "TransactionType" ADD VALUE 'WALLET_FUNDING';

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN "privyWalletId" TEXT,
ADD COLUMN "walletAddress" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Organization_privyWalletId_key" ON "Organization"("privyWalletId");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_walletAddress_key" ON "Organization"("walletAddress");
