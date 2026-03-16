import { platformTreasury, ethers } from '../../config/blockchain.js';
import nonceManager from '../nonce-manager.js';
import logger from '../../utils/logger.js';
import { BlockchainError } from '../../utils/errors.js';

/**
 * Record premium payment in Treasury.
 * Collects USDC from backend wallet and deducts platform fee.
 */
export async function receivePremium(policyId, amount) {
  if (!platformTreasury) {
    throw new BlockchainError('Treasury contract not configured');
  }

  try {
    const amountWei = ethers.parseUnits(String(amount), 6);

    logger.info('Recording premium in Treasury', { policyId, amount });

    try {
      await platformTreasury.receivePremium.estimateGas(policyId, amountWei);
    } catch (gasError) {
      throw new BlockchainError(`receivePremium would revert: ${gasError.shortMessage || gasError.message}`, gasError);
    }

    return await nonceManager.serialize(async () => {
      const tx = await platformTreasury.receivePremium(policyId, amountWei);
      const receipt = await tx.wait(1, 120000);

      logger.info('Premium recorded in Treasury', {
        policyId,
        amount,
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
      });

      return {
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
      };
    });
  } catch (error) {
    logger.error('Failed to record premium in Treasury', { policyId, error: error.message });
    throw new BlockchainError('Failed to record premium in Treasury', error);
  }
}

/**
 * Distribute premium from Treasury to a RiskPool.
 * Sends net premium (after platform fee) for LP revenue split.
 */
export async function distributePremiumToPool(poolAddress, policyId, grossPremium, distributorAddress) {
  if (!platformTreasury) {
    throw new BlockchainError('Treasury contract not configured');
  }

  try {
    const premiumWei = ethers.parseUnits(String(grossPremium), 6);

    logger.info('Distributing premium to pool', { poolAddress, policyId, grossPremium, distributorAddress });

    try {
      await platformTreasury.distributePremiumToPool.estimateGas(poolAddress, policyId, premiumWei, distributorAddress);
    } catch (gasError) {
      throw new BlockchainError(`distributePremiumToPool would revert: ${gasError.shortMessage || gasError.message}`, gasError);
    }

    return await nonceManager.serialize(async () => {
      const tx = await platformTreasury.distributePremiumToPool(poolAddress, policyId, premiumWei, distributorAddress);
      const receipt = await tx.wait(1, 120000);

      logger.info('Premium distributed to pool', {
        poolAddress,
        policyId,
        grossPremium,
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
      });

      return {
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
      };
    });
  } catch (error) {
    logger.error('Failed to distribute premium to pool', { poolAddress, policyId, error: error.message });
    throw new BlockchainError('Failed to distribute premium to pool', error);
  }
}
