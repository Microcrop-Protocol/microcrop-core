import { getRiskPoolContract, ethers } from '../../config/blockchain.js';
import logger from '../../utils/logger.js';

export async function getPoolStats(poolAddress) {
  if (!poolAddress) {
    return null;
  }

  try {
    const contract = getRiskPoolContract(poolAddress);

    const [totalCapitalRaw, totalPremiumsRaw, totalPayoutsRaw] = await Promise.all([
      contract.totalCapital(),
      contract.totalPremiums(),
      contract.totalPayouts(),
    ]);

    const totalCapital = ethers.formatUnits(totalCapitalRaw, 6);
    const totalPremiums = ethers.formatUnits(totalPremiumsRaw, 6);
    const totalPayouts = ethers.formatUnits(totalPayoutsRaw, 6);
    const balance = (
      parseFloat(totalCapital) + parseFloat(totalPremiums) - parseFloat(totalPayouts)
    ).toString();

    return {
      totalCapital,
      totalPremiums,
      totalPayouts,
      balance,
    };
  } catch (error) {
    logger.error('Failed to read pool stats', { poolAddress, error: error.message });
    throw error;
  }
}
