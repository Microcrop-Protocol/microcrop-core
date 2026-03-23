-- AlterEnum: Add SATELLITE to DamageSource
ALTER TYPE "DamageSource" ADD VALUE 'SATELLITE';

-- AlterEnum: Add resolution statuses to FraudFlagStatus
ALTER TYPE "FraudFlagStatus" ADD VALUE 'RESOLVED_FALSE_POSITIVE';
ALTER TYPE "FraudFlagStatus" ADD VALUE 'RESOLVED_CONFIRMED';
ALTER TYPE "FraudFlagStatus" ADD VALUE 'RESOLVED_INCONCLUSIVE';
