import { policyManager, ethers } from '../../config/blockchain.js';
import nonceManager from '../nonce-manager.js';
import logger from '../../utils/logger.js';
import { BlockchainError } from '../../utils/errors.js';

// Coverage type enum matching contract
const CoverageType = {
  DROUGHT: 0,
  FLOOD: 1,
  PEST: 2,
  DISEASE: 3,
  COMPREHENSIVE: 4,
};

/**
 * Create a new policy on-chain via PolicyManager
 */
export async function createPolicyOnChain({
  farmerAddress,
  plotId,
  sumInsured,
  premium,
  durationDays,
  coverageType = CoverageType.COMPREHENSIVE,
}) {
  if (!policyManager) {
    throw new BlockchainError('PolicyManager contract not configured');
  }

  try {
    logger.info('Creating policy on-chain', {
      farmerAddress,
      plotId,
      sumInsured,
      premium,
      durationDays,
      coverageType,
    });

    const args = [
      farmerAddress,
      plotId,
      ethers.parseUnits(String(sumInsured), 6),
      ethers.parseUnits(String(premium), 6),
      durationDays,
      coverageType,
    ];

    // Pre-check: estimate gas to catch revert conditions before sending
    try {
      await policyManager.createPolicy.estimateGas(...args);
    } catch (gasError) {
      throw new BlockchainError(`Transaction would revert: ${gasError.shortMessage || gasError.message}`, gasError);
    }

    // Serialize tx send + wait to prevent nonce collisions
    return await nonceManager.serialize(async () => {
      const tx = await policyManager.createPolicy(...args);

      logger.info('Create policy transaction sent', { txHash: tx.hash });

      const receipt = await tx.wait(1, 120000);

      // Extract policyId from PolicyCreated event
      const policyCreatedEvent = receipt.logs
        .map((log) => {
          try {
            return policyManager.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .find((parsed) => parsed && parsed.name === 'PolicyCreated');

      const onChainPolicyId = policyCreatedEvent?.args?.policyId?.toString();

      logger.info('Policy created on-chain', {
        onChainPolicyId,
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
      });

      return {
        onChainPolicyId,
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
      };
    });
  } catch (error) {
    logger.error('Failed to create policy on-chain', { error: error.message });
    throw new BlockchainError('Failed to create policy on-chain', error);
  }
}

/**
 * Activate a pending policy
 */
export async function activatePolicy(policyId, distributor, distributorName, region) {
  if (!policyManager) {
    throw new BlockchainError('PolicyManager contract not configured');
  }

  try {
    logger.info('Activating policy on-chain', { policyId, distributor, distributorName, region });

    try {
      await policyManager.activatePolicy.estimateGas(policyId, distributor, distributorName, region);
    } catch (gasError) {
      throw new BlockchainError(`Transaction would revert: ${gasError.shortMessage || gasError.message}`, gasError);
    }

    return await nonceManager.serialize(async () => {
      const tx = await policyManager.activatePolicy(policyId, distributor, distributorName, region);
      const receipt = await tx.wait(1, 120000);

      logger.info('Policy activated on-chain', {
        policyId,
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
      });

      return {
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
      };
    });
  } catch (error) {
    logger.error('Failed to activate policy on-chain', { policyId, error: error.message });
    throw new BlockchainError('Failed to activate policy on-chain', error);
  }
}

/**
 * Cancel a policy
 */
export async function cancelPolicy(policyId) {
  if (!policyManager) {
    throw new BlockchainError('PolicyManager contract not configured');
  }

  try {
    logger.info('Cancelling policy on-chain', { policyId });

    try {
      await policyManager.cancelPolicy.estimateGas(policyId);
    } catch (gasError) {
      throw new BlockchainError(`Transaction would revert: ${gasError.shortMessage || gasError.message}`, gasError);
    }

    return await nonceManager.serialize(async () => {
      const tx = await policyManager.cancelPolicy(policyId);
      const receipt = await tx.wait(1, 120000);

      logger.info('Policy cancelled on-chain', {
        policyId,
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
      });

      return {
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
      };
    });
  } catch (error) {
    logger.error('Failed to cancel policy on-chain', { policyId, error: error.message });
    throw new BlockchainError('Failed to cancel policy on-chain', error);
  }
}

/**
 * Mark a policy as claimed
 */
export async function markAsClaimed(policyId) {
  if (!policyManager) {
    throw new BlockchainError('PolicyManager contract not configured');
  }

  try {
    logger.info('Marking policy as claimed on-chain', { policyId });

    try {
      await policyManager.markAsClaimed.estimateGas(policyId);
    } catch (gasError) {
      throw new BlockchainError(`Transaction would revert: ${gasError.shortMessage || gasError.message}`, gasError);
    }

    return await nonceManager.serialize(async () => {
      const tx = await policyManager.markAsClaimed(policyId);
      const receipt = await tx.wait(1, 120000);

      logger.info('Policy marked as claimed on-chain', {
        policyId,
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
      });

      return {
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
      };
    });
  } catch (error) {
    logger.error('Failed to mark policy as claimed on-chain', { policyId, error: error.message });
    throw new BlockchainError('Failed to mark policy as claimed on-chain', error);
  }
}

/**
 * Increment claim count for a farmer
 */
export async function incrementClaimCount(farmerAddress) {
  if (!policyManager) {
    throw new BlockchainError('PolicyManager contract not configured');
  }

  try {
    logger.info('Incrementing claim count on-chain', { farmerAddress });

    try {
      await policyManager.incrementClaimCount.estimateGas(farmerAddress);
    } catch (gasError) {
      throw new BlockchainError(`Transaction would revert: ${gasError.shortMessage || gasError.message}`, gasError);
    }

    return await nonceManager.serialize(async () => {
      const tx = await policyManager.incrementClaimCount(farmerAddress);
      const receipt = await tx.wait(1, 120000);

      logger.info('Claim count incremented on-chain', {
        farmerAddress,
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
      });

      return {
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
      };
    });
  } catch (error) {
    logger.error('Failed to increment claim count on-chain', { farmerAddress, error: error.message });
    throw new BlockchainError('Failed to increment claim count on-chain', error);
  }
}

export { CoverageType };
