import { ethers } from 'ethers';
import { wallet } from '../../config/blockchain.js';
import { env } from '../../config/env.js';
import logger from '../../utils/logger.js';
import { BlockchainError } from '../../utils/errors.js';

// Swypt contract ABI (minimal for withdrawToEscrow)
const SWYPT_ABI = [
  'function withdrawToEscrow(address _tokenAddress, uint256 _amount) payable returns (uint256 nonce)',
  'function withdrawWithPermit(address _tokenAddress, uint256 _amount, uint256 deadline, uint8 v, bytes32 r, bytes32 s) returns (uint256 nonce)',
  'event Withdrawal(uint256 indexed nonce, address indexed user, address indexed tokenAddress, uint256 amount)',
];

// ERC20 ABI for approve and allowance
const ERC20_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
];

// USDC has 6 decimals
const USDC_DECIMALS = 6;

/**
 * Get Swypt contract instance
 */
function getSwyptContract() {
  if (!env.swyptContractAddress) {
    throw new BlockchainError('Swypt contract address not configured');
  }
  if (!wallet) {
    throw new BlockchainError('Wallet not configured for blockchain operations');
  }
  return new ethers.Contract(env.swyptContractAddress, SWYPT_ABI, wallet);
}

/**
 * Get USDC contract instance
 */
function getUsdcContract() {
  const usdcAddress = env.isDev ? env.contractUsdcDev : env.contractUsdc;
  if (!usdcAddress) {
    throw new BlockchainError('USDC contract address not configured');
  }
  return new ethers.Contract(usdcAddress, ERC20_ABI, wallet);
}

/**
 * Withdraw USDC to Swypt escrow for offramp
 * @param {string} tokenAddress - USDC token address
 * @param {number} amount - Amount in USDC (not wei)
 * @returns {Promise<{hash: string, blockNumber: number, nonce: string}>}
 */
export async function withdrawToEscrow(tokenAddress, amount) {
  try {
    if (!wallet) {
      throw new BlockchainError('Wallet not configured for blockchain operations');
    }

    const amountWei = ethers.parseUnits(String(amount), USDC_DECIMALS);
    const swyptContract = getSwyptContract();
    const usdc = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);

    logger.info('Initiating Swypt withdrawal', {
      tokenAddress,
      amount,
      amountWei: amountWei.toString(),
    });

    // Check balance
    const balance = await usdc.balanceOf(wallet.address);
    if (balance < amountWei) {
      throw new BlockchainError(
        `Insufficient USDC balance. Have: ${ethers.formatUnits(balance, USDC_DECIMALS)}, Need: ${amount}`
      );
    }

    // Check and approve if needed
    const currentAllowance = await usdc.allowance(wallet.address, env.swyptContractAddress);
    if (currentAllowance < amountWei) {
      logger.info('Approving Swypt contract for USDC spending', {
        currentAllowance: currentAllowance.toString(),
        requiredAmount: amountWei.toString(),
      });

      const approveTx = await usdc.approve(env.swyptContractAddress, amountWei);
      await approveTx.wait();

      logger.info('USDC approval confirmed', { txHash: approveTx.hash });
    }

    // Withdraw to escrow
    const tx = await swyptContract.withdrawToEscrow(tokenAddress, amountWei);
    logger.info('Swypt withdrawal transaction sent', { txHash: tx.hash });

    const receipt = await tx.wait();

    // Extract nonce from Withdrawal event
    let nonce = null;
    for (const log of receipt.logs) {
      try {
        const parsed = swyptContract.interface.parseLog({
          topics: log.topics,
          data: log.data,
        });
        if (parsed && parsed.name === 'Withdrawal') {
          nonce = parsed.args.nonce.toString();
          break;
        }
      } catch {
        // Not our event, skip
      }
    }

    logger.info('Swypt withdrawal confirmed', {
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      nonce,
    });

    return {
      hash: receipt.hash,
      blockNumber: receipt.blockNumber,
      nonce,
    };
  } catch (error) {
    logger.error('Failed to withdraw to Swypt escrow', { error: error.message });
    throw new BlockchainError('Failed to withdraw to Swypt escrow', error);
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

/**
 * Approve Swypt contract to spend USDC
 * @param {number} amount - Amount in USDC to approve
 * @returns {Promise<{hash: string, blockNumber: number}>}
 */
export async function approveSwyptSpending(amount) {
  try {
    const usdc = getUsdcContract();
    const amountWei = ethers.parseUnits(String(amount), USDC_DECIMALS);

    const tx = await usdc.approve(env.swyptContractAddress, amountWei);
    const receipt = await tx.wait();

    logger.info('Swypt approval confirmed', {
      txHash: receipt.hash,
      amount,
    });

    return {
      hash: receipt.hash,
      blockNumber: receipt.blockNumber,
    };
  } catch (error) {
    logger.error('Failed to approve Swypt spending', { error: error.message });
    throw new BlockchainError('Failed to approve Swypt spending', error);
  }
}

export default {
  withdrawToEscrow,
  checkUsdcBalance,
  approveSwyptSpending,
};
