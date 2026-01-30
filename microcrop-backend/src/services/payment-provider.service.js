/**
 * Unified Payment Provider Service
 *
 * Abstracts over multiple payment providers (Pretium, Swypt) and handles
 * automatic failover. Pretium is the primary provider due to lower fees.
 */

import { env } from '../config/env.js';
import pretiumService from './pretium.service.js';
import swyptService from './swypt.service.js';
import logger from '../utils/logger.js';
import { PaymentError } from '../utils/errors.js';

// Provider identifiers
export const PROVIDERS = {
  PRETIUM: 'pretium',
  SWYPT: 'swypt',
};

/**
 * Get the active provider based on configuration
 */
function getPrimaryProvider() {
  if (env.primaryPaymentProvider === PROVIDERS.PRETIUM && env.pretiumEnabled) {
    return PROVIDERS.PRETIUM;
  }
  if (env.primaryPaymentProvider === PROVIDERS.SWYPT && env.swyptEnabled) {
    return PROVIDERS.SWYPT;
  }
  // Default to whichever is enabled
  if (env.pretiumEnabled) return PROVIDERS.PRETIUM;
  if (env.swyptEnabled) return PROVIDERS.SWYPT;
  throw new PaymentError('No payment provider is enabled');
}

/**
 * Get fallback provider
 */
function getFallbackProvider(primary) {
  if (primary === PROVIDERS.PRETIUM && env.swyptEnabled) {
    return PROVIDERS.SWYPT;
  }
  if (primary === PROVIDERS.SWYPT && env.pretiumEnabled) {
    return PROVIDERS.PRETIUM;
  }
  return null;
}

/**
 * Execute with fallback - tries primary provider, falls back to secondary on failure
 */
async function executeWithFallback(operation, primaryProvider, fallbackProvider) {
  try {
    const result = await operation(primaryProvider);
    return { ...result, provider: primaryProvider };
  } catch (primaryError) {
    logger.warn(`Primary provider (${primaryProvider}) failed, trying fallback`, {
      error: primaryError.message,
    });

    if (fallbackProvider) {
      try {
        const result = await operation(fallbackProvider);
        return { ...result, provider: fallbackProvider };
      } catch (fallbackError) {
        logger.error(`Fallback provider (${fallbackProvider}) also failed`, {
          error: fallbackError.message,
        });
        throw new PaymentError(
          `All payment providers failed. Primary: ${primaryError.message}, Fallback: ${fallbackError.message}`,
          primaryError
        );
      }
    }

    throw primaryError;
  }
}

const paymentProviderService = {
  /**
   * Get the current active provider
   */
  getActiveProvider() {
    return getPrimaryProvider();
  },

  /**
   * Get exchange rate / quote for onramp (fiat → crypto)
   * @param {number} amountFiat - Amount in fiat currency
   * @param {string} fiatCurrency - Fiat currency code (default: KES)
   * @param {string} cryptoCurrency - Crypto currency (default: USDC)
   */
  async getOnrampQuote(amountFiat, fiatCurrency = 'KES', cryptoCurrency = 'USDC') {
    const primary = getPrimaryProvider();
    const fallback = getFallbackProvider(primary);

    return executeWithFallback(
      async (provider) => {
        if (provider === PROVIDERS.PRETIUM) {
          return pretiumService.getOnrampQuote(amountFiat, fiatCurrency, cryptoCurrency);
        } else {
          const quote = await swyptService.getQuote('onramp', amountFiat, fiatCurrency, cryptoCurrency);
          return {
            inputAmount: amountFiat,
            inputCurrency: fiatCurrency,
            outputAmount: quote.outputAmount,
            outputCurrency: cryptoCurrency,
            exchangeRate: quote.exchangeRate,
          };
        }
      },
      primary,
      fallback
    );
  },

  /**
   * Get exchange rate / quote for offramp (crypto → fiat)
   * @param {number} amountCrypto - Amount in crypto
   * @param {string} cryptoCurrency - Crypto currency (default: USDC)
   * @param {string} fiatCurrency - Fiat currency code (default: KES)
   */
  async getOfframpQuote(amountCrypto, cryptoCurrency = 'USDC', fiatCurrency = 'KES') {
    const primary = getPrimaryProvider();
    const fallback = getFallbackProvider(primary);

    return executeWithFallback(
      async (provider) => {
        if (provider === PROVIDERS.PRETIUM) {
          return pretiumService.getOfframpQuote(amountCrypto, cryptoCurrency, fiatCurrency);
        } else {
          const quote = await swyptService.getQuote('offramp', amountCrypto, fiatCurrency, cryptoCurrency);
          return {
            inputAmount: amountCrypto,
            inputCurrency: cryptoCurrency,
            outputAmount: quote.outputAmount,
            outputCurrency: fiatCurrency,
            exchangeRate: quote.exchangeRate,
          };
        }
      },
      primary,
      fallback
    );
  },

  /**
   * Initiate M-Pesa payment for premium collection (onramp: KES → USDC)
   * @param {string} phoneNumber - M-Pesa phone number
   * @param {number} amountKES - Amount in KES
   * @param {string} destinationAddress - Wallet/pool address to receive USDC
   * @param {string} tokenAddress - USDC token address (used by Swypt)
   * @param {string} reference - Unique reference
   */
  async initiateOnramp(phoneNumber, amountKES, destinationAddress, tokenAddress, reference) {
    const primary = getPrimaryProvider();
    const fallback = getFallbackProvider(primary);

    return executeWithFallback(
      async (provider) => {
        if (provider === PROVIDERS.PRETIUM) {
          const result = await pretiumService.initiateOnramp(
            phoneNumber,
            amountKES,
            destinationAddress,
            'Base', // Network
            'USDC'  // Asset
          );
          return {
            orderId: result.transactionCode,
            transactionId: result.transactionCode,
            status: result.status,
            message: result.message,
          };
        } else {
          const result = await swyptService.initiateMpesaPayment(
            phoneNumber,
            amountKES,
            destinationAddress,
            tokenAddress
          );
          return {
            orderId: result.orderID,
            transactionId: result.orderID,
            status: result.status,
          };
        }
      },
      primary,
      fallback
    );
  },

  /**
   * Check onramp transaction status
   * @param {string} transactionId - Provider transaction ID
   * @param {string} provider - Which provider to check (optional, will try both)
   */
  async checkOnrampStatus(transactionId, provider = null) {
    // If provider is specified, only check that one
    if (provider === PROVIDERS.PRETIUM) {
      return { ...await pretiumService.checkOnrampStatus(transactionId), provider };
    }
    if (provider === PROVIDERS.SWYPT) {
      return { ...await swyptService.checkOnrampStatus(transactionId), provider };
    }

    // Try primary first, then fallback
    const primary = getPrimaryProvider();
    const fallback = getFallbackProvider(primary);

    return executeWithFallback(
      async (p) => {
        if (p === PROVIDERS.PRETIUM) {
          return pretiumService.checkOnrampStatus(transactionId);
        } else {
          return swyptService.checkOnrampStatus(transactionId);
        }
      },
      primary,
      fallback
    );
  },

  /**
   * Initiate offramp for payout (USDC → KES via M-Pesa)
   *
   * NOTE: Both providers require an on-chain transfer BEFORE calling this method:
   * - Pretium: Transfer USDC to their settlement wallet (use pretium.writer.js)
   * - Swypt: Transfer USDC to their escrow contract (use swypt.writer.js)
   *
   * @param {string} phoneNumber - M-Pesa recipient phone number
   * @param {number} amountKESOrUSDC - Amount (KES for Pretium, USDC for Swypt)
   * @param {string} txHash - Transaction hash of the USDC transfer
   * @param {string} tokenAddress - USDC token address (used by Swypt)
   * @param {string} reference - Unique reference
   * @param {string} forcedProvider - Force a specific provider (optional)
   */
  async initiateOfframp(phoneNumber, amountKESOrUSDC, txHash, tokenAddress, reference, forcedProvider = null) {
    const provider = forcedProvider || getPrimaryProvider();

    try {
      if (provider === PROVIDERS.PRETIUM) {
        // Pretium expects amount in KES
        const result = await pretiumService.initiateOfframp(
          phoneNumber,
          amountKESOrUSDC, // This should be KES amount
          txHash,
          'Base'
        );
        return {
          orderId: result.transactionCode,
          transactionId: result.transactionCode,
          status: result.status,
          amountKES: result.amountKES,
          provider: PROVIDERS.PRETIUM,
        };
      } else {
        // Swypt
        const result = await swyptService.initiateOfframp(
          txHash,
          phoneNumber,
          tokenAddress,
          env.backendWallet
        );
        return {
          orderId: result.orderID,
          transactionId: result.orderID,
          status: result.status,
          provider: PROVIDERS.SWYPT,
        };
      }
    } catch (error) {
      // Try fallback if not forced
      if (!forcedProvider) {
        const fallback = getFallbackProvider(provider);
        if (fallback) {
          logger.warn(`Primary provider (${provider}) failed for offramp, trying fallback`, {
            error: error.message,
          });
          return this.initiateOfframp(phoneNumber, amountKESOrUSDC, txHash, tokenAddress, reference, fallback);
        }
      }
      throw error;
    }
  },

  /**
   * Check offramp transaction status
   * @param {string} transactionId - Provider transaction ID
   * @param {string} provider - Which provider to check (optional)
   */
  async checkOfframpStatus(transactionId, provider = null) {
    if (provider === PROVIDERS.PRETIUM) {
      return { ...await pretiumService.checkOfframpStatus(transactionId), provider };
    }
    if (provider === PROVIDERS.SWYPT) {
      return { ...await swyptService.checkOfframpStatus(transactionId), provider };
    }

    const primary = getPrimaryProvider();
    const fallback = getFallbackProvider(primary);

    return executeWithFallback(
      async (p) => {
        if (p === PROVIDERS.PRETIUM) {
          return pretiumService.checkOfframpStatus(transactionId);
        } else {
          return swyptService.checkOfframpStatus(transactionId);
        }
      },
      primary,
      fallback
    );
  },

  /**
   * Get the settlement/escrow address for offramp transfers
   * @param {string} provider - Provider name
   * @param {string} network - Network name
   */
  async getOfframpDestination(provider = null, network = 'Base') {
    const activeProvider = provider || getPrimaryProvider();

    if (activeProvider === PROVIDERS.PRETIUM) {
      const settlementWallet = await pretiumService.getSettlementWallet(network);
      return {
        provider: PROVIDERS.PRETIUM,
        address: settlementWallet,
        type: 'settlement_wallet',
      };
    } else {
      // Swypt uses contract-based escrow
      return {
        provider: PROVIDERS.SWYPT,
        address: env.swyptContractAddress,
        type: 'escrow_contract',
      };
    }
  },

  /**
   * Get account/wallet info from the active provider
   */
  async getAccountInfo() {
    const provider = getPrimaryProvider();

    if (provider === PROVIDERS.PRETIUM) {
      const account = await pretiumService.getAccountDetails();
      return {
        provider,
        account,
        networks: account.networks,
        wallets: account.wallets,
      };
    }

    // Swypt doesn't have an account details endpoint
    return {
      provider,
      account: null,
    };
  },
};

export default paymentProviderService;
