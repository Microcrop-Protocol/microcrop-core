import { riskPoolFactory, getRiskPoolContract, ethers } from '../../config/blockchain.js';
import logger from '../../utils/logger.js';
import { BlockchainError } from '../../utils/errors.js';

/**
 * Get all pools from the factory
 */
export async function getAllPools() {
  if (!riskPoolFactory) {
    logger.warn('RiskPoolFactory contract not configured');
    return [];
  }

  try {
    const poolAddresses = await riskPoolFactory.getAllPools();
    return poolAddresses;
  } catch (error) {
    logger.error('Failed to get all pools', { error: error.message });
    throw new BlockchainError('Failed to get all pools', error);
  }
}

/**
 * Get pools by organization address
 */
export async function getPoolsByOwner(ownerAddress) {
  if (!riskPoolFactory) {
    logger.warn('RiskPoolFactory contract not configured');
    return [];
  }

  try {
    // Use the new getPoolsByOwner method
    const poolAddresses = await riskPoolFactory.getPoolsByOwner(ownerAddress);
    return poolAddresses;
  } catch (error) {
    logger.error('Failed to get pools by owner', { ownerAddress, error: error.message });
    throw new BlockchainError('Failed to get pools by owner', error);
  }
}

/**
 * Get pool count from factory's built-in method
 */
export async function getPoolCount() {
  if (!riskPoolFactory) {
    return 0;
  }

  try {
    const count = await riskPoolFactory.getPoolCount();
    return Number(count);
  } catch (error) {
    logger.error('Failed to get pool count', { error: error.message });
    return 0;
  }
}

/**
 * Get pool counts by type from factory's built-in method
 */
export async function getPoolCountsByType() {
  if (!riskPoolFactory) {
    return { public: 0, private: 0, mutual: 0 };
  }

  try {
    const [publicCount, privateCount, mutualCount] = await riskPoolFactory.getPoolCountsByType();
    return {
      public: Number(publicCount),
      private: Number(privateCount),
      mutual: Number(mutualCount),
    };
  } catch (error) {
    logger.error('Failed to get pool counts by type', { error: error.message });
    return { public: 0, private: 0, mutual: 0 };
  }
}

/**
 * Check if an address is a valid pool using factory's built-in method
 */
export async function isValidPool(poolAddress) {
  if (!riskPoolFactory) {
    return false;
  }

  try {
    return await riskPoolFactory.isValidPool(poolAddress);
  } catch (error) {
    logger.error('Failed to check if valid pool', { poolAddress, error: error.message });
    return false;
  }
}

/**
 * Get pool metadata by pool ID using factory's built-in method
 */
export async function getPoolMetadata(poolIdOrAddress) {
  if (!riskPoolFactory) {
    throw new BlockchainError('RiskPoolFactory contract not configured');
  }

  try {
    // If it looks like an address, get config directly
    if (poolIdOrAddress.startsWith('0x') && poolIdOrAddress.length === 42) {
      return await getPoolConfig(poolIdOrAddress);
    }

    // Otherwise, use factory's getPoolMetadata
    const poolId = parseInt(poolIdOrAddress, 10);
    const metadata = await riskPoolFactory.getPoolMetadata(poolId);

    return {
      address: metadata.poolAddress,
      poolId: Number(metadata.poolId),
      name: metadata.name,
      poolType: Number(metadata.poolType),
      coverageType: Number(metadata.coverageType),
      region: metadata.region,
      poolOwner: metadata.poolOwner,
      createdAt: Number(metadata.createdAt),
    };
  } catch (error) {
    logger.error('Failed to get pool metadata', { poolIdOrAddress, error: error.message });
    throw new BlockchainError('Failed to get pool metadata', error);
  }
}

/**
 * Get pool summary (value, supply, price, etc.)
 */
export async function getPoolSummary(poolAddress) {
  try {
    const pool = getRiskPoolContract(poolAddress);

    // Try to call getPoolSummary first
    try {
      const [poolValue, supply, tokenPrice, premiums, payouts, exposure] = await pool.getPoolSummary();
      return {
        poolValue: ethers.formatUnits(poolValue, 6),
        totalSupply: ethers.formatUnits(supply, 6),
        tokenPrice: ethers.formatUnits(tokenPrice, 6),
        totalPremiums: ethers.formatUnits(premiums, 6),
        totalPayouts: ethers.formatUnits(payouts, 6),
        activeExposure: ethers.formatUnits(exposure, 6),
      };
    } catch {
      // Fallback: fetch individual values
      const [poolValue, supply, premiums, payouts] = await Promise.all([
        pool.getPoolValue().catch(() => BigInt(0)),
        pool.totalSupply().catch(() => BigInt(0)),
        pool.totalPremiums().catch(() => BigInt(0)),
        pool.totalPayouts().catch(() => BigInt(0)),
      ]);

      const tokenPrice = supply > 0 ? (poolValue * BigInt(1e6)) / supply : BigInt(1e6);

      return {
        poolValue: ethers.formatUnits(poolValue, 6),
        totalSupply: ethers.formatUnits(supply, 6),
        tokenPrice: ethers.formatUnits(tokenPrice, 6),
        totalPremiums: ethers.formatUnits(premiums, 6),
        totalPayouts: ethers.formatUnits(payouts, 6),
        activeExposure: '0',
      };
    }
  } catch (error) {
    logger.error('Failed to get pool summary', { poolAddress, error: error.message });
    throw new BlockchainError('Failed to get pool summary', error);
  }
}

/**
 * Get pool value (USDC balance)
 */
export async function getPoolValue(poolAddress) {
  try {
    const pool = getRiskPoolContract(poolAddress);
    const value = await pool.getPoolValue();
    return ethers.formatUnits(value, 6);
  } catch (error) {
    logger.error('Failed to get pool value', { poolAddress, error: error.message });
    throw new BlockchainError('Failed to get pool value', error);
  }
}

/**
 * Get available liquidity for new policies
 */
export async function getAvailableLiquidity(poolAddress) {
  try {
    const pool = getRiskPoolContract(poolAddress);
    const liquidity = await pool.getAvailableLiquidity();
    return ethers.formatUnits(liquidity, 6);
  } catch (error) {
    logger.error('Failed to get available liquidity', { poolAddress, error: error.message });
    throw new BlockchainError('Failed to get available liquidity', error);
  }
}

/**
 * Get token price for a pool
 */
export async function getTokenPrice(poolAddress) {
  try {
    const pool = getRiskPoolContract(poolAddress);
    const price = await pool.getTokenPrice();
    return ethers.formatUnits(price, 6);
  } catch (error) {
    logger.error('Failed to get token price', { poolAddress, error: error.message });
    throw new BlockchainError('Failed to get token price', error);
  }
}

/**
 * Get investor info for an address in a pool
 */
export async function getInvestorInfo(poolAddress, investorAddress) {
  try {
    const pool = getRiskPoolContract(poolAddress);

    // Try getInvestorInfo first
    try {
      const [deposited, tokensHeld, currentValue, roi] = await pool.getInvestorInfo(investorAddress);
      return {
        deposited: ethers.formatUnits(deposited, 6),
        tokensHeld: ethers.formatUnits(tokensHeld, 6),
        currentValue: ethers.formatUnits(currentValue, 6),
        roi: Number(roi) / 100,
      };
    } catch {
      // Fallback: calculate from balance
      const tokensHeld = await pool.balanceOf(investorAddress).catch(() => BigInt(0));
      const tokenPrice = await pool.getTokenPrice().catch(() => BigInt(1e6));
      const currentValue = (tokensHeld * tokenPrice) / BigInt(1e6);

      return {
        deposited: '0',
        tokensHeld: ethers.formatUnits(tokensHeld, 6),
        currentValue: ethers.formatUnits(currentValue, 6),
        roi: 0,
      };
    }
  } catch (error) {
    logger.error('Failed to get investor info', { poolAddress, investorAddress, error: error.message });
    throw new BlockchainError('Failed to get investor info', error);
  }
}

/**
 * Check if pool can accept a policy with given sum insured
 */
export async function canAcceptPolicy(poolAddress, sumInsured) {
  try {
    const pool = getRiskPoolContract(poolAddress);
    const sumInsuredWei = ethers.parseUnits(String(sumInsured), 6);
    return await pool.canAcceptPolicy(sumInsuredWei);
  } catch (error) {
    logger.error('Failed to check if pool can accept policy', { poolAddress, error: error.message });
    return false;
  }
}

/**
 * Check if an address can deposit to a pool
 */
export async function canDeposit(poolAddress, investorAddress) {
  try {
    const pool = getRiskPoolContract(poolAddress);
    return await pool.canDeposit(investorAddress);
  } catch (error) {
    logger.error('Failed to check if can deposit', { poolAddress, investorAddress, error: error.message });
    return false;
  }
}

/**
 * Get pool configuration
 */
export async function getPoolConfig(poolAddress) {
  try {
    const pool = getRiskPoolContract(poolAddress);

    // Fetch available config values with fallbacks
    const [
      poolName,
      symbol,
      poolType,
      depositsOpen,
      withdrawalsOpen,
      paused,
    ] = await Promise.all([
      pool.poolName().catch(() => pool.name().catch(() => 'Unknown')),
      pool.symbol().catch(() => 'POOL'),
      pool.poolType().catch(() => 1), // Default to PRIVATE
      pool.depositsOpen().catch(() => true),
      pool.withdrawalsOpen().catch(() => true),
      pool.paused().catch(() => false),
    ]);

    // Try to get optional config values
    const [
      coverageType,
      region,
      poolOwner,
      minDeposit,
      maxDeposit,
      targetCapital,
      maxCapital,
    ] = await Promise.all([
      pool.coverageType().catch(() => 4), // COMPREHENSIVE
      pool.region().catch(() => ''),
      pool.poolOwner().catch(() => pool.owner().catch(() => '0x0000000000000000000000000000000000000000')),
      pool.minDeposit().catch(() => BigInt(0)),
      pool.maxDeposit().catch(() => ethers.parseUnits('1000000', 6)),
      pool.targetCapital().catch(() => BigInt(0)),
      pool.maxCapital().catch(() => BigInt(0)),
    ]);

    return {
      address: poolAddress,
      name: poolName,
      symbol,
      poolType: Number(poolType),
      coverageType: Number(coverageType),
      region,
      poolOwner,
      minDeposit: ethers.formatUnits(minDeposit, 6),
      maxDeposit: ethers.formatUnits(maxDeposit, 6),
      targetCapital: ethers.formatUnits(targetCapital, 6),
      maxCapital: ethers.formatUnits(maxCapital, 6),
      depositsOpen,
      withdrawalsOpen,
      paused,
    };
  } catch (error) {
    logger.error('Failed to get pool config', { poolAddress, error: error.message });
    throw new BlockchainError('Failed to get pool config', error);
  }
}

/**
 * Calculate how many tokens will be minted for a USDC deposit
 */
export async function calculateMintAmount(poolAddress, usdcAmount) {
  try {
    const pool = getRiskPoolContract(poolAddress);
    const amountWei = ethers.parseUnits(String(usdcAmount), 6);
    const tokens = await pool.calculateMintAmount(amountWei);
    return ethers.formatUnits(tokens, 6);
  } catch (error) {
    logger.error('Failed to calculate mint amount', { poolAddress, error: error.message });
    throw new BlockchainError('Failed to calculate mint amount', error);
  }
}

/**
 * Calculate how much USDC will be received for burning tokens
 */
export async function calculateWithdrawAmount(poolAddress, tokenAmount) {
  try {
    const pool = getRiskPoolContract(poolAddress);
    const amountWei = ethers.parseUnits(String(tokenAmount), 6);
    const usdc = await pool.calculateWithdrawAmount(amountWei);
    return ethers.formatUnits(usdc, 6);
  } catch (error) {
    logger.error('Failed to calculate withdraw amount', { poolAddress, error: error.message });
    throw new BlockchainError('Failed to calculate withdraw amount', error);
  }
}

/**
 * Get full pool details (combines summary and config)
 */
export async function getFullPoolDetails(poolAddress) {
  try {
    const [summary, config] = await Promise.all([
      getPoolSummary(poolAddress).catch(() => ({
        poolValue: '0',
        totalSupply: '0',
        tokenPrice: '1.00',
        totalPremiums: '0',
        totalPayouts: '0',
        activeExposure: '0',
      })),
      getPoolConfig(poolAddress),
    ]);

    const targetCapital = parseFloat(config.targetCapital) || 1;
    const exposure = parseFloat(summary.activeExposure) || 0;

    return {
      address: poolAddress,
      ...config,
      ...summary,
      utilizationRate: (exposure / targetCapital) * 100,
    };
  } catch (error) {
    logger.error('Failed to get full pool details', { poolAddress, error: error.message });
    throw new BlockchainError('Failed to get full pool details', error);
  }
}

/**
 * Legacy function for backward compatibility
 */
export async function getPoolStats(poolAddress) {
  if (!poolAddress) {
    return null;
  }

  try {
    const summary = await getPoolSummary(poolAddress);
    const balance = (
      parseFloat(summary.poolValue) +
      parseFloat(summary.totalPremiums) -
      parseFloat(summary.totalPayouts)
    ).toString();

    return {
      totalCapital: summary.poolValue,
      totalPremiums: summary.totalPremiums,
      totalPayouts: summary.totalPayouts,
      balance,
    };
  } catch (error) {
    logger.error('Failed to read pool stats', { poolAddress, error: error.message });
    return null;
  }
}

/**
 * Get pool address by ID from factory
 */
export async function getPoolById(poolId) {
  if (!riskPoolFactory) {
    throw new BlockchainError('RiskPoolFactory contract not configured');
  }

  try {
    const address = await riskPoolFactory.getPoolById(poolId);
    return address;
  } catch (error) {
    logger.error('Failed to get pool by ID', { poolId, error: error.message });
    throw new BlockchainError('Failed to get pool by ID', error);
  }
}

/**
 * Get pools by type (PUBLIC, PRIVATE, MUTUAL)
 */
export async function getPoolsByType(poolType) {
  if (!riskPoolFactory) {
    return [];
  }

  try {
    const pools = await riskPoolFactory.getPoolsByType(poolType);
    return pools;
  } catch (error) {
    logger.error('Failed to get pools by type', { poolType, error: error.message });
    return [];
  }
}

/**
 * Get public pools
 */
export async function getPublicPools() {
  return getPoolsByType(0); // PUBLIC = 0
}

/**
 * Get private pools
 */
export async function getPrivatePools() {
  return getPoolsByType(1); // PRIVATE = 1
}

/**
 * Get mutual pools
 */
export async function getMutualPools() {
  return getPoolsByType(2); // MUTUAL = 2
}

/**
 * Check if an organization is registered in the factory
 */
export async function isOrganization(address) {
  if (!riskPoolFactory) {
    return false;
  }

  try {
    return await riskPoolFactory.isOrganization(address);
  } catch (error) {
    logger.error('Failed to check if organization', { address, error: error.message });
    return false;
  }
}
