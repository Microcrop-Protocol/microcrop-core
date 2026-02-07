import { riskPoolFactory, provider } from '../../config/blockchain.js';
import prisma from '../../config/database.js';
import logger from '../../utils/logger.js';
import { env } from '../../config/env.js';

let pollingInterval = null;
let lastProcessedBlock = null;
const POLL_INTERVAL_MS = 15000; // Poll every 15 seconds
const GAP_WARNING_THRESHOLD = 5000; // ~2.5 hours on Base

// Use factory address as the sync state key
const FACTORY_ADDRESS = env.isDev
  ? env.contractRiskPoolFactoryDev
  : env.contractRiskPoolFactory;

async function getStartBlock() {
  if (!FACTORY_ADDRESS) return null;

  // Try to get last processed block from database
  const syncState = await prisma.syncState.findUnique({
    where: { contractAddress: FACTORY_ADDRESS.toLowerCase() },
  });

  if (syncState?.lastBlock) {
    return Number(syncState.lastBlock) + 1;
  }

  // Default to recent blocks (last ~1 hour on Base)
  const currentBlock = await provider.getBlockNumber();
  return Math.max(0, currentBlock - 1800);
}

async function pollEvents() {
  if (!riskPoolFactory || !FACTORY_ADDRESS) return;

  try {
    const currentBlock = await provider.getBlockNumber();

    if (lastProcessedBlock === null) {
      lastProcessedBlock = await getStartBlock();
    }

    if (lastProcessedBlock >= currentBlock) {
      return; // No new blocks
    }

    // Warn if there's a large gap (possible missed events during downtime)
    const gap = currentBlock - lastProcessedBlock;
    if (gap > GAP_WARNING_THRESHOLD) {
      logger.warn('Pool listener: large block gap detected', {
        lastProcessedBlock,
        currentBlock,
        gap,
        estimatedHoursBehind: Math.round(gap * 2 / 3600 * 10) / 10,
      });
    }

    // Query in chunks to avoid RPC limits
    const fromBlock = lastProcessedBlock;
    const toBlock = Math.min(currentBlock, fromBlock + 2000);

    // Listen for PoolCreated event (new event name in updated ABI)
    const filter = riskPoolFactory.filters.PoolCreated();
    const events = await riskPoolFactory.queryFilter(filter, fromBlock, toBlock);

    for (const event of events) {
      try {
        // New event args: poolId (indexed), poolAddress (indexed), poolType, name, symbol, poolOwner
        const { poolId, poolAddress, poolType, name, symbol, poolOwner } = event.args;

        logger.info('PoolCreated event received', {
          poolId: poolId.toString(),
          poolAddress,
          poolType: Number(poolType),
          name,
          symbol,
          poolOwner,
          blockNumber: event.blockNumber,
        });

        // Find organization by poolOwner wallet
        const org = await prisma.organization.findFirst({
          where: { adminWallet: poolOwner.toLowerCase() },
        });

        if (org) {
          await prisma.organization.update({
            where: { id: org.id },
            data: {
              poolAddress,
            },
          });

          logger.info('Organization pool address updated', {
            organizationId: org.id,
            poolAddress,
            onChainPoolId: poolId.toString(),
          });
        } else {
          logger.warn('No organization found for pool owner', { poolOwner });
        }
      } catch (error) {
        logger.error('Error handling PoolCreated event', {
          error: error.message,
          txHash: event.transactionHash,
        });
      }
    }

    // Update sync state after processing
    await prisma.syncState.upsert({
      where: { contractAddress: FACTORY_ADDRESS.toLowerCase() },
      update: {
        lastBlock: BigInt(toBlock),
        lastSyncAt: new Date(),
      },
      create: {
        contractAddress: FACTORY_ADDRESS.toLowerCase(),
        contractName: 'RiskPoolFactory',
        lastBlock: BigInt(toBlock),
        lastSyncAt: new Date(),
      },
    });

    lastProcessedBlock = toBlock + 1;
  } catch (error) {
    // Don't log network errors as errors (expected with public RPCs)
    if (error.code === 'NETWORK_ERROR' || error.message?.includes('filter')) {
      logger.debug('Pool listener network issue, will retry', { error: error.message });
    } else {
      logger.error('Error polling pool events', { error: error.message });
    }
  }
}

export async function start() {
  if (!riskPoolFactory) {
    logger.warn('RiskPoolFactory contract not configured - pool listener skipped');
    return;
  }

  // Initial poll
  await pollEvents();

  // Start polling interval
  pollingInterval = setInterval(pollEvents, POLL_INTERVAL_MS);

  logger.info('Pool listener started (polling mode)');
}

export function stop() {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
  lastProcessedBlock = null;
  logger.info('Pool listener stopped');
}
