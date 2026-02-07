import { policyManager, getRiskPoolContract, provider } from '../../config/blockchain.js';
import prisma from '../../config/database.js';
import logger from '../../utils/logger.js';
import { env } from '../../config/env.js';

const activePollers = [];
let policyManagerPoller = null;
const POLL_INTERVAL_MS = 15000; // Poll every 15 seconds
const GAP_WARNING_THRESHOLD = 5000; // ~2.5 hours on Base

const POLICY_MANAGER_ADDRESS = env.isDev
  ? env.contractPolicyManagerDev
  : env.contractPolicyManager;

async function getStartBlock(contractAddress) {
  const syncState = await prisma.syncState.findUnique({
    where: { contractAddress: contractAddress.toLowerCase() },
  });

  if (syncState?.lastBlock) {
    return Number(syncState.lastBlock) + 1;
  }

  // Default to recent blocks
  const currentBlock = await provider.getBlockNumber();
  return Math.max(0, currentBlock - 1800);
}

// Poll PolicyManager for PolicyCreated events
let policyManagerLastBlock = null;

async function pollPolicyManagerEvents() {
  if (!policyManager || !POLICY_MANAGER_ADDRESS) return;

  try {
    const currentBlock = await provider.getBlockNumber();

    if (policyManagerLastBlock === null) {
      policyManagerLastBlock = await getStartBlock(POLICY_MANAGER_ADDRESS);
    }

    if (policyManagerLastBlock >= currentBlock) {
      return;
    }

    // Warn if there's a large gap (possible missed events during downtime)
    const pmGap = currentBlock - policyManagerLastBlock;
    if (pmGap > GAP_WARNING_THRESHOLD) {
      logger.warn('PolicyManager listener: large block gap detected', {
        lastProcessedBlock: policyManagerLastBlock,
        currentBlock,
        gap: pmGap,
        estimatedHoursBehind: Math.round(pmGap * 2 / 3600 * 10) / 10,
      });
    }

    const fromBlock = policyManagerLastBlock;
    const toBlock = Math.min(currentBlock, fromBlock + 2000);

    // Listen for PolicyCreated events from PolicyManager
    const filter = policyManager.filters.PolicyCreated();
    const events = await policyManager.queryFilter(filter, fromBlock, toBlock);

    for (const event of events) {
      try {
        // New event args: policyId (indexed), farmer (indexed), plotId (indexed), sumInsured, premium, startDate, endDate, coverageType
        const { policyId, farmer, plotId, sumInsured, premium, startDate, endDate, coverageType } = event.args;
        const txHash = event.transactionHash;
        const blockNumber = event.blockNumber;

        logger.info('PolicyCreated event received from PolicyManager', {
          policyId: policyId.toString(),
          farmer,
          plotId: plotId.toString(),
          sumInsured: sumInsured.toString(),
          premium: premium.toString(),
          coverageType: Number(coverageType),
          txHash,
        });

        // Try to find policy by txHash first
        let policy = await prisma.policy.findFirst({
          where: { txHash },
        });

        // If not found by txHash, try by farmer wallet and pending status
        if (!policy) {
          const farmerRecord = await prisma.farmer.findFirst({
            where: { walletAddress: farmer.toLowerCase() },
          });

          if (farmerRecord) {
            policy = await prisma.policy.findFirst({
              where: {
                farmerId: farmerRecord.id,
                status: { in: ['PENDING', 'ACTIVE'] },
                onChainPolicyId: null,
              },
              orderBy: { createdAt: 'desc' },
            });
          }
        }

        if (!policy) {
          logger.warn('No policy found for PolicyCreated event', {
            policyId: policyId.toString(),
            farmer,
            txHash,
          });
          continue;
        }

        // Update policy with on-chain data
        await prisma.policy.update({
          where: { id: policy.id },
          data: {
            onChainPolicyId: policyId.toString(),
            policyNumber: policyId.toString(),
            status: 'ACTIVE',
            txHash,
            blockNumber: BigInt(blockNumber),
            startDate: new Date(Number(startDate) * 1000),
            endDate: new Date(Number(endDate) * 1000),
          },
        });

        logger.info('Policy updated with on-chain data', {
          policyId: policy.id,
          onChainPolicyId: policyId.toString(),
          txHash,
        });
      } catch (error) {
        logger.error('Error handling PolicyCreated event', {
          error: error.message,
          txHash: event.transactionHash,
        });
      }
    }

    // Update sync state
    await prisma.syncState.upsert({
      where: { contractAddress: POLICY_MANAGER_ADDRESS.toLowerCase() },
      update: {
        lastBlock: BigInt(toBlock),
        lastSyncAt: new Date(),
      },
      create: {
        contractAddress: POLICY_MANAGER_ADDRESS.toLowerCase(),
        contractName: 'PolicyManager',
        lastBlock: BigInt(toBlock),
        lastSyncAt: new Date(),
      },
    });

    policyManagerLastBlock = toBlock + 1;
  } catch (error) {
    if (error.code === 'NETWORK_ERROR' || error.message?.includes('filter')) {
      logger.debug('PolicyManager listener network issue, will retry', { error: error.message });
    } else {
      logger.error('Error polling PolicyManager events', { error: error.message });
    }
  }
}

// Poll RiskPool for PremiumCollected events
async function pollEventsForPool(org, riskPool, lastBlockRef) {
  try {
    const currentBlock = await provider.getBlockNumber();

    if (lastBlockRef.value === null) {
      lastBlockRef.value = await getStartBlock(org.poolAddress);
    }

    if (lastBlockRef.value >= currentBlock) {
      return;
    }

    // Warn if there's a large gap (possible missed events during downtime)
    const poolGap = currentBlock - lastBlockRef.value;
    if (poolGap > GAP_WARNING_THRESHOLD) {
      logger.warn('RiskPool listener: large block gap detected', {
        poolAddress: org.poolAddress,
        lastProcessedBlock: lastBlockRef.value,
        currentBlock,
        gap: poolGap,
        estimatedHoursBehind: Math.round(poolGap * 2 / 3600 * 10) / 10,
      });
    }

    const fromBlock = lastBlockRef.value;
    const toBlock = Math.min(currentBlock, fromBlock + 2000);

    // Listen for PremiumCollected events from RiskPool
    const filter = riskPool.filters.PremiumCollected();
    const events = await riskPool.queryFilter(filter, fromBlock, toBlock);

    for (const event of events) {
      try {
        // Event args: policyId (indexed), grossAmount, lpShare, builderShare, protocolShare, distributorShare
        const { policyId, grossAmount, lpShare, builderShare, protocolShare, distributorShare } = event.args;
        const txHash = event.transactionHash;
        const blockNumber = event.blockNumber;

        logger.info('PremiumCollected event received', {
          policyId: policyId.toString(),
          grossAmount: grossAmount.toString(),
          lpShare: lpShare.toString(),
          protocolShare: protocolShare.toString(),
          txHash,
        });

        // Find policy by onChainPolicyId
        const policy = await prisma.policy.findFirst({
          where: {
            organizationId: org.id,
            onChainPolicyId: policyId.toString(),
          },
        });

        if (!policy) {
          logger.warn('No policy found for PremiumCollected event', {
            organizationId: org.id,
            policyId: policyId.toString(),
          });
          continue;
        }

        // Update policy premium payment status
        await prisma.policy.update({
          where: { id: policy.id },
          data: {
            premiumPaid: true,
            premiumPaidAt: new Date(),
            premiumTxHash: txHash,
          },
        });

        // Record platform fee (protocol share)
        await prisma.platformFee.create({
          data: {
            organizationId: org.id,
            policyId: policy.id,
            poolAddress: org.poolAddress,
            premium: parseFloat(grossAmount.toString()) / 1e6,
            feeAmount: parseFloat(protocolShare.toString()) / 1e6,
            feePercent: 5,
            txHash,
            blockNumber: BigInt(blockNumber),
          },
        });

        // Update organization stats
        await prisma.organization.update({
          where: { id: org.id },
          data: {
            totalPremiumsCollected: { increment: parseFloat(grossAmount.toString()) / 1e6 },
          },
        });

        logger.info('Premium collected for policy', {
          policyId: policy.id,
          amount: parseFloat(grossAmount.toString()) / 1e6,
          txHash,
        });
      } catch (error) {
        logger.error('Error handling PremiumCollected event', {
          error: error.message,
          txHash: event.transactionHash,
        });
      }
    }

    // Update sync state after processing
    await prisma.syncState.upsert({
      where: { contractAddress: org.poolAddress.toLowerCase() },
      update: {
        lastBlock: BigInt(toBlock),
        lastSyncAt: new Date(),
      },
      create: {
        contractAddress: org.poolAddress.toLowerCase(),
        contractName: `RiskPool_${org.name}`,
        lastBlock: BigInt(toBlock),
        lastSyncAt: new Date(),
      },
    });

    lastBlockRef.value = toBlock + 1;
  } catch (error) {
    if (error.code === 'NETWORK_ERROR' || error.message?.includes('filter')) {
      logger.debug('Policy listener network issue, will retry', {
        poolAddress: org.poolAddress,
        error: error.message,
      });
    } else {
      logger.error('Error polling policy events', {
        poolAddress: org.poolAddress,
        error: error.message,
      });
    }
  }
}

export async function start() {
  // Start PolicyManager listener (global)
  if (policyManager && POLICY_MANAGER_ADDRESS) {
    await pollPolicyManagerEvents();
    policyManagerPoller = setInterval(pollPolicyManagerEvents, POLL_INTERVAL_MS);
    logger.info('PolicyManager listener started (polling mode)');
  } else {
    logger.warn('PolicyManager contract not configured - PolicyManager listener skipped');
  }

  // Start RiskPool listeners per organization
  const organizations = await prisma.organization.findMany({
    where: {
      isActive: true,
      poolAddress: { not: null },
    },
  });

  for (const org of organizations) {
    try {
      const riskPool = getRiskPoolContract(org.poolAddress);
      const lastBlockRef = { value: null };

      // Initial poll
      await pollEventsForPool(org, riskPool, lastBlockRef);

      // Start polling interval
      const intervalId = setInterval(
        () => pollEventsForPool(org, riskPool, lastBlockRef),
        POLL_INTERVAL_MS
      );

      activePollers.push({
        intervalId,
        poolAddress: org.poolAddress,
      });

      logger.info('RiskPool listener started for organization', {
        organizationId: org.id,
        poolAddress: org.poolAddress,
      });
    } catch (error) {
      logger.error('Failed to start RiskPool listener for organization', {
        organizationId: org.id,
        error: error.message,
      });
    }
  }

  logger.info('Policy listeners started (polling mode)', {
    policyManager: !!policyManagerPoller,
    riskPools: activePollers.length,
  });
}

export function stop() {
  // Stop PolicyManager listener
  if (policyManagerPoller) {
    clearInterval(policyManagerPoller);
    policyManagerPoller = null;
  }
  policyManagerLastBlock = null;

  // Stop RiskPool listeners
  for (const poller of activePollers) {
    clearInterval(poller.intervalId);
  }
  activePollers.length = 0;

  logger.info('Policy listeners stopped');
}
