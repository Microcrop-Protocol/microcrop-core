import { getRiskPoolContract, ethers } from '../../config/blockchain.js';
import logger from '../../utils/logger.js';
import { BlockchainError } from '../../utils/errors.js';

export async function createPolicyOnChain(poolAddress, farmerAddress, sumInsured, premium, durationSeconds) {
  try {
    logger.info('Creating policy on-chain', {
      poolAddress,
      farmerAddress,
      sumInsured,
      premium,
      durationSeconds,
    });

    const riskPool = getRiskPoolContract(poolAddress);

    const tx = await riskPool.createPolicy(
      farmerAddress,
      ethers.parseUnits(String(sumInsured), 6),
      ethers.parseUnits(String(premium), 6),
      durationSeconds
    );

    logger.info('Create policy transaction sent', { txHash: tx.hash });

    const receipt = await tx.wait();

    logger.info('Policy created on-chain', {
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber,
    });

    return {
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber,
    };
  } catch (error) {
    logger.error('Failed to create policy on-chain', { error: error.message });
    throw new BlockchainError('Failed to create policy on-chain', error);
  }
}
