import { platformTreasury, ethers } from '../../config/blockchain.js';
import logger from '../../utils/logger.js';
import { BlockchainError } from '../../utils/errors.js';

/**
 * Get treasury balance using contract's getBalance method
 */
export async function getBalance() {
  if (!platformTreasury) {
    return '0';
  }

  try {
    const balance = await platformTreasury.getBalance();
    return ethers.formatUnits(balance, 6);
  } catch (error) {
    logger.error('Failed to get treasury balance', { error: error.message });
    return '0';
  }
}

/**
 * Get total premiums received using contract's getTotalPremiums method
 */
export async function getTotalPremiums() {
  if (!platformTreasury) {
    return '0';
  }

  try {
    const total = await platformTreasury.getTotalPremiums();
    return ethers.formatUnits(total, 6);
  } catch (error) {
    logger.error('Failed to get total premiums', { error: error.message });
    return '0';
  }
}

/**
 * Get total payouts sent using contract's getTotalPayouts method
 */
export async function getTotalPayouts() {
  if (!platformTreasury) {
    return '0';
  }

  try {
    const total = await platformTreasury.getTotalPayouts();
    return ethers.formatUnits(total, 6);
  } catch (error) {
    logger.error('Failed to get total payouts', { error: error.message });
    return '0';
  }
}

/**
 * Get accumulated platform fees using contract's accumulatedFees method
 */
export async function getAccumulatedFees() {
  if (!platformTreasury) {
    return '0';
  }

  try {
    const fees = await platformTreasury.accumulatedFees();
    return ethers.formatUnits(fees, 6);
  } catch (error) {
    logger.error('Failed to get accumulated fees', { error: error.message });
    return '0';
  }
}

/**
 * Get platform fee percentage using contract's platformFeePercent method
 */
export async function getPlatformFeePercent() {
  if (!platformTreasury) {
    return 5; // Default 5%
  }

  try {
    const feePercent = await platformTreasury.platformFeePercent();
    return Number(feePercent);
  } catch (error) {
    logger.error('Failed to get platform fee percent', { error: error.message });
    return 5;
  }
}

/**
 * Calculate platform fee for a premium amount using contract method
 */
export async function calculatePlatformFee(premium) {
  if (!platformTreasury) {
    const feePercent = 5;
    return (premium * feePercent / 100).toString();
  }

  try {
    const premiumWei = ethers.parseUnits(String(premium), 6);
    const fee = await platformTreasury.calculatePlatformFee(premiumWei);
    return ethers.formatUnits(fee, 6);
  } catch (error) {
    logger.error('Failed to calculate platform fee', { error: error.message });
    return (premium * 5 / 100).toString();
  }
}

/**
 * Get reserve ratio using contract's getReserveRatio method
 */
export async function getReserveRatio() {
  if (!platformTreasury) {
    return 150;
  }

  try {
    const ratio = await platformTreasury.getReserveRatio();
    return Number(ratio);
  } catch (error) {
    logger.error('Failed to get reserve ratio', { error: error.message });
    return 150;
  }
}

/**
 * Get required reserve amount using contract's getRequiredReserve method
 */
export async function getRequiredReserve() {
  if (!platformTreasury) {
    return '0';
  }

  try {
    const required = await platformTreasury.getRequiredReserve();
    return ethers.formatUnits(required, 6);
  } catch (error) {
    logger.error('Failed to get required reserve', { error: error.message });
    return '0';
  }
}

/**
 * Get available balance for payouts using contract's getAvailableForPayouts method
 */
export async function getAvailableForPayouts() {
  if (!platformTreasury) {
    return '0';
  }

  try {
    const available = await platformTreasury.getAvailableForPayouts();
    return ethers.formatUnits(available, 6);
  } catch (error) {
    logger.error('Failed to get available for payouts', { error: error.message });
    return '0';
  }
}

/**
 * Check if treasury meets reserve requirements using contract method
 */
export async function meetsReserveRequirements() {
  if (!platformTreasury) {
    return true;
  }

  try {
    return await platformTreasury.meetsReserveRequirements();
  } catch (error) {
    logger.error('Failed to check reserve requirements', { error: error.message });
    return true;
  }
}

/**
 * Check if premium has been received for a policy using contract method
 */
export async function isPremiumReceived(policyId) {
  if (!platformTreasury) {
    return false;
  }

  try {
    return await platformTreasury.isPremiumReceived(policyId);
  } catch (error) {
    logger.error('Failed to check premium received', { policyId, error: error.message });
    return false;
  }
}

/**
 * Check if payout has been processed for a policy using contract method
 */
export async function isPayoutProcessed(policyId) {
  if (!platformTreasury) {
    return false;
  }

  try {
    return await platformTreasury.isPayoutProcessed(policyId);
  } catch (error) {
    logger.error('Failed to check payout processed', { policyId, error: error.message });
    return false;
  }
}

/**
 * Check if treasury is paused using contract's paused method
 */
export async function isPaused() {
  if (!platformTreasury) {
    return false;
  }

  try {
    return await platformTreasury.paused();
  } catch (error) {
    logger.error('Failed to check if treasury is paused', { error: error.message });
    return false;
  }
}

/**
 * Get backend wallet address from contract
 */
export async function getBackendWallet() {
  if (!platformTreasury) {
    return null;
  }

  try {
    return await platformTreasury.backendWallet();
  } catch (error) {
    logger.error('Failed to get backend wallet', { error: error.message });
    return null;
  }
}

/**
 * Get full treasury stats by calling all contract methods
 */
export async function getTreasuryStats() {
  try {
    const [
      balance,
      totalPremiums,
      totalPayouts,
      accumulatedFees,
      platformFeePercent,
      reserveRatio,
      requiredReserve,
      availableForPayouts,
      meetsReserve,
      paused,
    ] = await Promise.all([
      getBalance(),
      getTotalPremiums(),
      getTotalPayouts(),
      getAccumulatedFees(),
      getPlatformFeePercent(),
      getReserveRatio(),
      getRequiredReserve(),
      getAvailableForPayouts(),
      meetsReserveRequirements(),
      isPaused(),
    ]);

    return {
      balance,
      totalPremiums,
      totalPayouts,
      accumulatedFees,
      platformFeePercent,
      reserveRatio,
      requiredReserve,
      availableForPayouts,
      meetsReserve,
      paused,
    };
  } catch (error) {
    logger.error('Failed to get treasury stats', { error: error.message });
    return {
      balance: '0',
      totalPremiums: '0',
      totalPayouts: '0',
      accumulatedFees: '0',
      platformFeePercent: 5,
      reserveRatio: 150,
      requiredReserve: '0',
      availableForPayouts: '0',
      meetsReserve: true,
      paused: false,
    };
  }
}
