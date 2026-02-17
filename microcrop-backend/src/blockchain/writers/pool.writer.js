import { riskPoolFactory, getRiskPoolContract, getUsdcAddress, wallet, ethers, provider } from '../../config/blockchain.js';
import nonceManager from '../nonce-manager.js';
import { sendOrgTransaction } from '../wallet-manager.js';
import logger from '../../utils/logger.js';
import { BlockchainError } from '../../utils/errors.js';
import { env } from '../../config/env.js';

// Minimal ABI interfaces for encoding calldata
const USDC_IFACE = new ethers.Interface([
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
]);

const POOL_IFACE = new ethers.Interface([
  'function deposit(uint256 amount, uint256 minTokensOut) returns (uint256)',
  'function withdraw(uint256 tokenAmount, uint256 minUsdcOut) returns (uint256)',
  'event Deposited(address indexed investor, uint256 usdcAmount, uint256 tokensMinted, uint256 tokenPrice)',
  'event Withdrawn(address indexed investor, uint256 tokenAmount, uint256 usdcReceived)',
]);

// Pool type enum matching contract
const PoolType = {
  PUBLIC: 0,
  PRIVATE: 1,
  MUTUAL: 2,
};

// Coverage type enum matching contract
const CoverageType = {
  DROUGHT: 0,
  FLOOD: 1,
  PEST: 2,
  DISEASE: 3,
  COMPREHENSIVE: 4,
};

/**
 * Deploy a private risk pool for an organization
 * Private pools have whitelisted depositors
 */
export async function createPrivatePool({
  name,
  symbol,
  coverageType = CoverageType.COMPREHENSIVE,
  region,
  poolOwner,
  minDeposit,
  maxDeposit,
  targetCapital,
  maxCapital,
  productBuilder,
}) {
  if (!riskPoolFactory) {
    throw new BlockchainError('RiskPoolFactory contract not configured');
  }

  try {
    logger.info('Creating private risk pool', { name, poolOwner, targetCapital });

    const params = {
      name,
      symbol,
      coverageType,
      region,
      poolOwner,
      minDeposit: ethers.parseUnits(String(minDeposit), 6),
      maxDeposit: ethers.parseUnits(String(maxDeposit), 6),
      targetCapital: ethers.parseUnits(String(targetCapital), 6),
      maxCapital: ethers.parseUnits(String(maxCapital), 6),
      productBuilder: productBuilder || poolOwner,
    };

    try {
      await riskPoolFactory.createPrivatePool.estimateGas(params);
    } catch (gasError) {
      throw new BlockchainError(`Transaction would revert: ${gasError.shortMessage || gasError.message}`, gasError);
    }

    return await nonceManager.serialize(async () => {
      const tx = await riskPoolFactory.createPrivatePool(params);
      logger.info('Create private pool transaction sent', { txHash: tx.hash });

      const receipt = await tx.wait(1, 120000);

      // Extract pool address from PoolCreated event
      const poolCreatedEvent = receipt.logs
        .map((log) => {
          try {
            return riskPoolFactory.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .find((parsed) => parsed && parsed.name === 'PoolCreated');

      const poolAddress = poolCreatedEvent?.args?.poolAddress;
      const poolId = poolCreatedEvent?.args?.poolId;

      logger.info('Private pool created', {
        poolAddress,
        poolId: poolId?.toString(),
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
      });

      return {
        poolAddress,
        poolId: poolId?.toString(),
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
      };
    });
  } catch (error) {
    logger.error('Failed to create private pool', { error: error.message });
    throw new BlockchainError('Failed to create private pool', error);
  }
}

/**
 * Deploy a public risk pool (anyone can deposit)
 */
export async function createPublicPool({
  name,
  symbol,
  coverageType = CoverageType.COMPREHENSIVE,
  region,
  targetCapital,
  maxCapital,
}) {
  if (!riskPoolFactory) {
    throw new BlockchainError('RiskPoolFactory contract not configured');
  }

  try {
    logger.info('Creating public risk pool', { name, targetCapital });

    const params = {
      name,
      symbol,
      coverageType,
      region,
      targetCapital: ethers.parseUnits(String(targetCapital), 6),
      maxCapital: ethers.parseUnits(String(maxCapital), 6),
    };

    try {
      await riskPoolFactory.createPublicPool.estimateGas(params);
    } catch (gasError) {
      throw new BlockchainError(`Transaction would revert: ${gasError.shortMessage || gasError.message}`, gasError);
    }

    return await nonceManager.serialize(async () => {
      const tx = await riskPoolFactory.createPublicPool(params);
      const receipt = await tx.wait(1, 120000);

      const poolCreatedEvent = receipt.logs
        .map((log) => {
          try {
            return riskPoolFactory.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .find((parsed) => parsed && parsed.name === 'PoolCreated');

      const poolAddress = poolCreatedEvent?.args?.poolAddress;
      const poolId = poolCreatedEvent?.args?.poolId;

      logger.info('Public pool created', { poolAddress, poolId: poolId?.toString() });

      return {
        poolAddress,
        poolId: poolId?.toString(),
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
      };
    });
  } catch (error) {
    logger.error('Failed to create public pool', { error: error.message });
    throw new BlockchainError('Failed to create public pool', error);
  }
}

/**
 * Deploy a mutual risk pool (for cooperatives)
 */
export async function createMutualPool({
  name,
  symbol,
  coverageType = CoverageType.COMPREHENSIVE,
  region,
  poolOwner,
  memberContribution,
  targetCapital,
  maxCapital,
}) {
  if (!riskPoolFactory) {
    throw new BlockchainError('RiskPoolFactory contract not configured');
  }

  try {
    logger.info('Creating mutual risk pool', { name, poolOwner, targetCapital });

    const params = {
      name,
      symbol,
      coverageType,
      region,
      poolOwner,
      memberContribution: ethers.parseUnits(String(memberContribution), 6),
      targetCapital: ethers.parseUnits(String(targetCapital), 6),
      maxCapital: ethers.parseUnits(String(maxCapital), 6),
    };

    try {
      await riskPoolFactory.createMutualPool.estimateGas(params);
    } catch (gasError) {
      throw new BlockchainError(`Transaction would revert: ${gasError.shortMessage || gasError.message}`, gasError);
    }

    return await nonceManager.serialize(async () => {
      const tx = await riskPoolFactory.createMutualPool(params);
      const receipt = await tx.wait(1, 120000);

      const poolCreatedEvent = receipt.logs
        .map((log) => {
          try {
            return riskPoolFactory.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .find((parsed) => parsed && parsed.name === 'PoolCreated');

      const poolAddress = poolCreatedEvent?.args?.poolAddress;
      const poolId = poolCreatedEvent?.args?.poolId;

      logger.info('Mutual pool created', { poolAddress, poolId: poolId?.toString() });

      return {
        poolAddress,
        poolId: poolId?.toString(),
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
      };
    });
  } catch (error) {
    logger.error('Failed to create mutual pool', { error: error.message });
    throw new BlockchainError('Failed to create mutual pool', error);
  }
}

/**
 * Deposit USDC into a risk pool (add liquidity).
 * If orgWalletId is provided, sends via Privy server wallet (gas sponsored).
 * Otherwise falls back to the platform wallet.
 */
export async function depositToPool(poolAddress, amount, minTokensOut = 0, orgWalletId = null) {
  try {
    const amountWei = ethers.parseUnits(String(amount), 6);
    const usdcAddress = getUsdcAddress();

    logger.info('Depositing to pool', { poolAddress, amount, viaPrivy: !!orgWalletId });

    // --- Privy org wallet path ---
    if (orgWalletId) {
      // 1. Approve USDC for the pool (max approval for simplicity)
      const approveData = USDC_IFACE.encodeFunctionData('approve', [poolAddress, amountWei]);
      const approveTx = await sendOrgTransaction(orgWalletId, usdcAddress, approveData);
      logger.info('USDC approval sent via Privy', { hash: approveTx.hash });

      // Wait for approval to confirm
      const approveReceipt = await provider.waitForTransaction(approveTx.hash, 1, 120000);
      if (!approveReceipt || approveReceipt.status === 0) {
        throw new BlockchainError('USDC approval transaction failed');
      }

      // 2. Deposit to pool
      const depositData = POOL_IFACE.encodeFunctionData('deposit', [amountWei, minTokensOut]);
      const depositTx = await sendOrgTransaction(orgWalletId, poolAddress, depositData);

      const receipt = await provider.waitForTransaction(depositTx.hash, 1, 120000);
      if (!receipt || receipt.status === 0) {
        throw new BlockchainError('Deposit transaction failed');
      }

      // Parse Deposited event
      const depositedEvent = receipt.logs
        .map((log) => {
          try { return POOL_IFACE.parseLog(log); } catch { return null; }
        })
        .find((parsed) => parsed && parsed.name === 'Deposited');

      const tokensMinted = depositedEvent?.args?.tokensMinted;
      const tokenPrice = depositedEvent?.args?.tokenPrice;

      logger.info('Deposit successful via Privy wallet', {
        poolAddress, amount, txHash: receipt.hash,
        tokensMinted: tokensMinted ? ethers.formatUnits(tokensMinted, 6) : null,
      });

      return {
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        tokensMinted: tokensMinted ? ethers.formatUnits(tokensMinted, 6) : null,
        tokenPrice: tokenPrice ? ethers.formatUnits(tokenPrice, 6) : null,
      };
    }

    // --- Platform wallet fallback ---
    if (!wallet) {
      throw new BlockchainError('Wallet not configured for deposits');
    }

    const pool = getRiskPoolContract(poolAddress);
    const usdcAbi = [
      'function approve(address spender, uint256 amount) returns (bool)',
      'function allowance(address owner, address spender) view returns (uint256)',
    ];
    const usdc = new ethers.Contract(usdcAddress, usdcAbi, wallet);

    try {
      await pool.deposit.estimateGas(amountWei, minTokensOut);
    } catch (gasError) {
      throw new BlockchainError(`Deposit would revert: ${gasError.shortMessage || gasError.message}`, gasError);
    }

    return await nonceManager.serialize(async () => {
      const allowance = await usdc.allowance(wallet.address, poolAddress);
      if (allowance < amountWei) {
        logger.info('Approving USDC for pool deposit', { poolAddress, amount });
        const approveTx = await usdc.approve(poolAddress, amountWei);
        await approveTx.wait(1, 120000);
      }

      const tx = await pool.deposit(amountWei, minTokensOut);
      const receipt = await tx.wait(1, 120000);

      const depositedEvent = receipt.logs
        .map((log) => {
          try { return pool.interface.parseLog(log); } catch { return null; }
        })
        .find((parsed) => parsed && parsed.name === 'Deposited');

      const tokensMinted = depositedEvent?.args?.tokensMinted;
      const tokenPrice = depositedEvent?.args?.tokenPrice;

      logger.info('Deposit successful', {
        poolAddress, amount,
        tokensMinted: tokensMinted ? ethers.formatUnits(tokensMinted, 6) : null,
        txHash: receipt.hash,
      });

      return {
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        tokensMinted: tokensMinted ? ethers.formatUnits(tokensMinted, 6) : null,
        tokenPrice: tokenPrice ? ethers.formatUnits(tokenPrice, 6) : null,
      };
    });
  } catch (error) {
    logger.error('Failed to deposit to pool', { poolAddress, error: error.message });
    throw new BlockchainError('Failed to deposit to pool', error);
  }
}

/**
 * Withdraw USDC from a risk pool (remove liquidity).
 * If orgWalletId is provided, sends via Privy server wallet (gas sponsored).
 * Otherwise falls back to the platform wallet.
 */
export async function withdrawFromPool(poolAddress, tokenAmount, minUsdcOut = 0, orgWalletId = null) {
  try {
    const tokenAmountWei = ethers.parseUnits(String(tokenAmount), 6);

    logger.info('Withdrawing from pool', { poolAddress, tokenAmount, viaPrivy: !!orgWalletId });

    // --- Privy org wallet path ---
    if (orgWalletId) {
      const withdrawData = POOL_IFACE.encodeFunctionData('withdraw', [tokenAmountWei, minUsdcOut]);
      const withdrawTx = await sendOrgTransaction(orgWalletId, poolAddress, withdrawData);

      const receipt = await provider.waitForTransaction(withdrawTx.hash, 1, 120000);
      if (!receipt || receipt.status === 0) {
        throw new BlockchainError('Withdraw transaction failed');
      }

      const withdrawnEvent = receipt.logs
        .map((log) => {
          try { return POOL_IFACE.parseLog(log); } catch { return null; }
        })
        .find((parsed) => parsed && parsed.name === 'Withdrawn');

      const usdcReceived = withdrawnEvent?.args?.usdcReceived;

      logger.info('Withdrawal successful via Privy wallet', {
        poolAddress, tokenAmount, txHash: receipt.hash,
        usdcReceived: usdcReceived ? ethers.formatUnits(usdcReceived, 6) : null,
      });

      return {
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        usdcReceived: usdcReceived ? ethers.formatUnits(usdcReceived, 6) : null,
      };
    }

    // --- Platform wallet fallback ---
    if (!wallet) {
      throw new BlockchainError('Wallet not configured for withdrawals');
    }

    const pool = getRiskPoolContract(poolAddress);

    try {
      await pool.withdraw.estimateGas(tokenAmountWei, minUsdcOut);
    } catch (gasError) {
      throw new BlockchainError(`Withdrawal would revert: ${gasError.shortMessage || gasError.message}`, gasError);
    }

    return await nonceManager.serialize(async () => {
      const tx = await pool.withdraw(tokenAmountWei, minUsdcOut);
      const receipt = await tx.wait(1, 120000);

      const withdrawnEvent = receipt.logs
        .map((log) => {
          try { return pool.interface.parseLog(log); } catch { return null; }
        })
        .find((parsed) => parsed && parsed.name === 'Withdrawn');

      const usdcReceived = withdrawnEvent?.args?.usdcReceived;

      logger.info('Withdrawal successful', {
        poolAddress, tokenAmount,
        usdcReceived: usdcReceived ? ethers.formatUnits(usdcReceived, 6) : null,
        txHash: receipt.hash,
      });

      return {
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        usdcReceived: usdcReceived ? ethers.formatUnits(usdcReceived, 6) : null,
      };
    });
  } catch (error) {
    logger.error('Failed to withdraw from pool', { poolAddress, error: error.message });
    throw new BlockchainError('Failed to withdraw from pool', error);
  }
}

/**
 * Add a depositor to the whitelist (private pools only)
 */
export async function addDepositor(poolAddress, depositorAddress) {
  if (!wallet) {
    throw new BlockchainError('Wallet not configured');
  }

  try {
    const pool = getRiskPoolContract(poolAddress);

    logger.info('Adding depositor to pool', { poolAddress, depositorAddress });
    const tx = await pool.addDepositor(depositorAddress);
    const receipt = await tx.wait(1, 120000);

    logger.info('Depositor added', { poolAddress, depositorAddress, txHash: receipt.hash });

    return {
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber,
    };
  } catch (error) {
    logger.error('Failed to add depositor', { poolAddress, error: error.message });
    throw new BlockchainError('Failed to add depositor', error);
  }
}

/**
 * Remove a depositor from the whitelist
 */
export async function removeDepositor(poolAddress, depositorAddress) {
  if (!wallet) {
    throw new BlockchainError('Wallet not configured');
  }

  try {
    const pool = getRiskPoolContract(poolAddress);

    logger.info('Removing depositor from pool', { poolAddress, depositorAddress });
    const tx = await pool.removeDepositor(depositorAddress);
    const receipt = await tx.wait(1, 120000);

    logger.info('Depositor removed', { poolAddress, depositorAddress, txHash: receipt.hash });

    return {
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber,
    };
  } catch (error) {
    logger.error('Failed to remove depositor', { poolAddress, error: error.message });
    throw new BlockchainError('Failed to remove depositor', error);
  }
}

/**
 * Set deposits open/closed for a pool
 */
export async function setDepositsOpen(poolAddress, open) {
  if (!wallet) {
    throw new BlockchainError('Wallet not configured');
  }

  try {
    const pool = getRiskPoolContract(poolAddress);

    logger.info('Setting deposits open', { poolAddress, open });
    const tx = await pool.setDepositsOpen(open);
    const receipt = await tx.wait(1, 120000);

    logger.info('Deposits status updated', { poolAddress, open, txHash: receipt.hash });

    return {
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber,
    };
  } catch (error) {
    logger.error('Failed to set deposits open', { poolAddress, error: error.message });
    throw new BlockchainError('Failed to set deposits status', error);
  }
}

/**
 * Set withdrawals open/closed for a pool
 */
export async function setWithdrawalsOpen(poolAddress, open) {
  if (!wallet) {
    throw new BlockchainError('Wallet not configured');
  }

  try {
    const pool = getRiskPoolContract(poolAddress);

    logger.info('Setting withdrawals open', { poolAddress, open });
    const tx = await pool.setWithdrawalsOpen(open);
    const receipt = await tx.wait(1, 120000);

    logger.info('Withdrawals status updated', { poolAddress, open, txHash: receipt.hash });

    return {
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber,
    };
  } catch (error) {
    logger.error('Failed to set withdrawals open', { poolAddress, error: error.message });
    throw new BlockchainError('Failed to set withdrawals status', error);
  }
}

// Legacy export for backward compatibility
export async function deployPool(organizationWallet, initialCapital) {
  return createPrivatePool({
    name: 'Organization Pool',
    symbol: 'ORGPOOL',
    coverageType: CoverageType.COMPREHENSIVE,
    region: 'Africa',
    poolOwner: organizationWallet,
    minDeposit: 100,
    maxDeposit: 1000000,
    targetCapital: initialCapital,
    maxCapital: initialCapital * 2,
    productBuilder: env.backendWallet || organizationWallet,
  });
}

export { PoolType, CoverageType };
