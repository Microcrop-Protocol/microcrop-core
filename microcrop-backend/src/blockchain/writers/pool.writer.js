import { riskPoolFactory, wallet, ethers } from '../../config/blockchain.js';
import logger from '../../utils/logger.js';
import { BlockchainError } from '../../utils/errors.js';

export async function deployPool(organizationWallet, initialCapital) {
  if (!riskPoolFactory) {
    throw new BlockchainError('RiskPoolFactory contract not configured');
  }

  try {
    logger.info('Deploying risk pool', { organizationWallet, initialCapital });

    const tx = await riskPoolFactory.deployPool(
      organizationWallet,
      ethers.parseUnits(String(initialCapital), 6)
    );

    logger.info('Deploy pool transaction sent', { txHash: tx.hash });

    const receipt = await tx.wait();

    const poolDeployedEvent = receipt.logs
      .map((log) => {
        try {
          return riskPoolFactory.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((parsed) => parsed && parsed.name === 'PoolDeployed');

    const poolAddress = poolDeployedEvent
      ? poolDeployedEvent.args.poolAddress
      : null;

    logger.info('Risk pool deployed', {
      poolAddress,
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber,
    });

    return {
      poolAddress,
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber,
    };
  } catch (error) {
    logger.error('Failed to deploy pool', { error: error.message });
    throw new BlockchainError('Failed to deploy risk pool', error);
  }
}
