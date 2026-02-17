import { ethers } from 'ethers';
import { privyClient } from '../config/privy.js';
import { provider, getUsdcAddress } from '../config/blockchain.js';
import { env } from '../config/env.js';
import logger from '../utils/logger.js';

const CAIP2 = env.isDev ? 'eip155:84532' : 'eip155:8453';

/**
 * Create a new Privy server wallet for an organization.
 * @returns {{ walletId: string, address: string }}
 */
export async function createOrgWallet() {
  if (!privyClient) {
    throw new Error('Privy client not configured');
  }

  const wallet = await privyClient.wallets().create({
    chain_type: 'ethereum',
  });

  logger.info('Created Privy wallet for organization', {
    walletId: wallet.id,
    address: wallet.address,
  });

  return { walletId: wallet.id, address: wallet.address };
}

/**
 * Send a transaction from an org's Privy wallet.
 * Gas is sponsored by Privy paymaster.
 * @param {string} walletId - Privy wallet ID
 * @param {string} to - Destination contract/address
 * @param {string} data - Encoded calldata (hex)
 * @param {string} [value='0x0'] - ETH value (hex)
 * @returns {{ hash: string }}
 */
export async function sendOrgTransaction(walletId, to, data, value = '0x0') {
  if (!privyClient) {
    throw new Error('Privy client not configured');
  }

  const result = await privyClient.wallets().ethereum().sendTransaction(walletId, {
    caip2: CAIP2,
    params: {
      transaction: {
        to,
        data,
        value,
      },
    },
    sponsor: true,
  });

  logger.info('Sent sponsored transaction via Privy', {
    walletId,
    hash: result.hash,
    to,
  });

  return { hash: result.hash };
}

/**
 * Get USDC and ETH balances for a wallet address.
 * @param {string} walletAddress
 * @returns {{ usdc: string, eth: string }}
 */
export async function getWalletBalances(walletAddress) {
  const usdcAddress = getUsdcAddress();

  const usdcIface = new ethers.Interface([
    'function balanceOf(address) view returns (uint256)',
  ]);

  const [ethBalance, usdcRaw] = await Promise.all([
    provider.getBalance(walletAddress),
    provider.call({
      to: usdcAddress,
      data: usdcIface.encodeFunctionData('balanceOf', [walletAddress]),
    }),
  ]);

  const usdcBalance = ethers.formatUnits(usdcRaw, 6);
  const ethFormatted = ethers.formatEther(ethBalance);

  return { usdc: usdcBalance, eth: ethFormatted };
}
