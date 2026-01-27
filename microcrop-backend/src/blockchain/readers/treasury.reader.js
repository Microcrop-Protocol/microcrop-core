import { platformTreasury, ethers } from '../../config/blockchain.js';
import logger from '../../utils/logger.js';

export async function getTreasuryStats() {
  if (!platformTreasury) {
    return { totalFeesCollected: '0' };
  }

  try {
    const totalFeesCollectedRaw = await platformTreasury.totalFeesCollected();
    const totalFeesCollected = ethers.formatUnits(totalFeesCollectedRaw, 6);

    return { totalFeesCollected };
  } catch (error) {
    logger.error('Failed to read treasury stats', { error: error.message });
    throw error;
  }
}

export async function getOrgFees(orgWallet) {
  if (!platformTreasury) {
    return '0';
  }

  try {
    const feesRaw = await platformTreasury.organizationFees(orgWallet);
    return ethers.formatUnits(feesRaw, 6);
  } catch (error) {
    logger.error('Failed to read org fees', { orgWallet, error: error.message });
    throw error;
  }
}
