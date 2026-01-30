import { ethers } from 'ethers';
import { wallet } from '../../config/blockchain.js';
import { env } from '../../config/env.js';
import pretiumService from '../../services/pretium.service.js';
import logger from '../../utils/logger.js';
import { BlockchainError } from '../../utils/errors.js';

// ERC20 ABI for transfer
const ERC20_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)',
];

// USDC has 6 decimals
const USDC_DECIMALS = 6;

/**
 * Get USDC contract instance
 */
function getUsdcContract() {
  const usdcAddress = env.isDev ? env.contractUsdcDev : env.contractUsdc;
  if (!usdcAddress) {
    throw new BlockchainError('USDC contract address not configured');
  }
  if (!wallet) {
    throw new BlockchainError('Wallet not configured for blockchain operations');
  }
  return new ethers.Contract(usdcAddress, ERC20_ABI, wallet);
}

/**
 * Transfer USDC to Pretium's settlement wallet for offramp
 *
 * This is required before calling Pretium's /v1/pay endpoint.
 * Pretium verifies the transaction_hash to confirm receipt of funds.
 *
 * @param {number} amountUSDC - Amount in USDC (not wei)
 * @param {string} network - Network name (default: 'Base')
 * @returns {Promise<{hash: string, blockNumber: number, settlementWallet: string}>}
 */
export async function transferToSettlementWallet(amountUSDC, network = 'Base') {
  try {
    if (!wallet) {
      throw new BlockchainError('Wallet not configured for blockchain operations');
    }

    // Get Pretium's settlement wallet address for the network
    const settlementWallet = await pretiumService.getSettlementWallet(network);
    if (!settlementWallet) {
      throw new BlockchainError(`No settlement wallet found for network: ${network}`);
    }

    const usdc = getUsdcContract();
    const amountWei = ethers.parseUnits(String(amountUSDC), USDC_DECIMALS);

    logger.info('Initiating USDC transfer to Pretium settlement wallet', {
      amountUSDC,
      amountWei: amountWei.toString(),
      settlementWallet,
      network,
    });

    // Check balance
    const balance = await usdc.balanceOf(wallet.address);
    if (balance < amountWei) {
      throw new BlockchainError(
        `Insufficient USDC balance. Have: ${ethers.formatUnits(balance, USDC_DECIMALS)}, Need: ${amountUSDC}`
      );
    }

    // Transfer USDC to Pretium's settlement wallet
    const tx = await usdc.transfer(settlementWallet, amountWei);
    logger.info('USDC transfer transaction sent', { txHash: tx.hash });

    const receipt = await tx.wait();

    logger.info('USDC transferred to Pretium settlement wallet', {
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      settlementWallet,
      amountUSDC,
    });

    return {
      hash: receipt.hash,
      blockNumber: receipt.blockNumber,
      settlementWallet,
    };
  } catch (error) {
    logger.error('Failed to transfer USDC to Pretium', { error: error.message });
    throw new BlockchainError('Failed to transfer USDC to Pretium settlement wallet', error);
  }
}

/**
 * Check USDC balance for the backend wallet
 * @returns {Promise<{balance: string, balanceFormatted: string}>}
 */
export async function checkUsdcBalance() {
  try {
    const usdc = getUsdcContract();
    const balance = await usdc.balanceOf(wallet.address);

    return {
      balance: balance.toString(),
      balanceFormatted: ethers.formatUnits(balance, USDC_DECIMALS),
    };
  } catch (error) {
    logger.error('Failed to check USDC balance', { error: error.message });
    throw new BlockchainError('Failed to check USDC balance', error);
  }
}

export default {
  transferToSettlementWallet,
  checkUsdcBalance,
};
