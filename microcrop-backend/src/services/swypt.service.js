import axios from 'axios';
import { env } from '../config/env.js';
import logger from '../utils/logger.js';
import { PaymentError } from '../utils/errors.js';

const swyptClient = axios.create({
  baseURL: env.swyptApiUrl,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': env.swyptApiKey,
    'x-api-secret': env.swyptApiSecret,
  },
});

const swyptService = {
  /**
   * Get quote for currency conversions (onramp or offramp)
   * @param {string} type - 'onramp' or 'offramp'
   * @param {number} amount - Amount to convert
   * @param {string} fiatCurrency - Fiat currency (e.g., 'KES')
   * @param {string} cryptoCurrency - Crypto currency (e.g., 'USDC')
   * @param {string} network - Blockchain network (default: 'base')
   */
  async getQuote(type, amount, fiatCurrency, cryptoCurrency, network = 'base') {
    try {
      const response = await swyptClient.post('/fx-quotes', {
        type,
        amount: String(amount),
        fiatCurrency,
        cryptoCurrency,
        network,
        category: type === 'offramp' ? 'B2C' : undefined,
      });

      const { quoteId, inputAmount, outputAmount, exchangeRate, expiresAt } = response.data.data;

      return {
        quoteId,
        inputAmount,
        outputAmount,
        exchangeRate,
        expiresAt,
        // Legacy field names for backward compatibility
        fromAmount: inputAmount,
        toAmount: outputAmount,
      };
    } catch (error) {
      logger.error('Failed to get Swypt quote', { error: error.message, type, amount });
      throw new PaymentError('Failed to get conversion quote', error);
    }
  },

  /**
   * Initiate M-Pesa STK push for onramp (KES to USDC)
   * @param {string} phoneNumber - M-Pesa phone number
   * @param {number} amountKES - Amount in KES
   * @param {string} userAddress - Recipient wallet address for USDC
   * @param {string} tokenAddress - USDC token address on Base
   */
  async initiateMpesaPayment(phoneNumber, amountKES, userAddress, tokenAddress) {
    try {
      const response = await swyptClient.post('/onramp-orders', {
        partyA: phoneNumber,
        amount: String(amountKES),
        side: 'onramp',
        userAddress,
        tokenAddress,
      });

      const { orderID, status } = response.data.data;

      return {
        orderID,
        transactionId: orderID,
        checkoutRequestId: orderID,
        status: status || 'PENDING',
      };
    } catch (error) {
      logger.error('Failed to initiate M-Pesa payment', { error: error.message, phoneNumber });
      throw new PaymentError('Failed to initiate M-Pesa payment', error);
    }
  },

  /**
   * Check onramp order status
   * @param {string} orderID - Swypt order ID
   */
  async checkOnrampStatus(orderID) {
    try {
      const response = await swyptClient.get(`/onramp-order-status/${orderID}`);
      const { status, mpesaRef, completedAt, hash } = response.data.data;

      return {
        status,
        mpesaRef,
        completedAt,
        txHash: hash,
      };
    } catch (error) {
      logger.error('Failed to check onramp status', { error: error.message, orderID });
      throw new PaymentError('Failed to check onramp status', error);
    }
  },

  /**
   * Process crypto deposit after M-Pesa payment succeeds
   * @param {string} orderID - Swypt order ID
   * @param {string} userAddress - Recipient wallet address
   * @param {string} chain - Blockchain (default: 'base')
   */
  async processDeposit(orderID, userAddress, chain = 'base') {
    try {
      const response = await swyptClient.post('/deposit', {
        chain,
        address: userAddress,
        orderID,
        project: env.swyptProjectName,
      });

      return {
        hash: response.data.hash,
        txHash: response.data.hash,
      };
    } catch (error) {
      logger.error('Failed to process deposit', { error: error.message, orderID });
      throw new PaymentError('Failed to process deposit', error);
    }
  },

  /**
   * Initiate offramp (USDC to M-Pesa)
   * Must call after withdrawing USDC to Swypt escrow on-chain
   * @param {string} txHash - On-chain withdrawal transaction hash
   * @param {string} phoneNumber - M-Pesa recipient phone number
   * @param {string} tokenAddress - USDC token address
   * @param {string} userAddress - Sender wallet address
   */
  async initiateOfframp(txHash, phoneNumber, tokenAddress, userAddress) {
    try {
      const response = await swyptClient.post('/offramp-orders', {
        chain: 'base',
        hash: txHash,
        partyB: phoneNumber,
        tokenAddress,
        project: env.swyptProjectName,
        userAddress,
      });

      const { orderID, status } = response.data.data;

      return {
        orderID,
        transactionId: orderID,
        status: status || 'PENDING',
      };
    } catch (error) {
      logger.error('Failed to initiate offramp', { error: error.message, phoneNumber });
      throw new PaymentError('Failed to initiate offramp', error);
    }
  },

  /**
   * Check offramp order status
   * @param {string} orderID - Swypt order ID
   */
  async checkOfframpStatus(orderID) {
    try {
      const response = await swyptClient.get(`/offramp-order-status/${orderID}`);
      const { status, mpesaRef, completedAt, amountKES } = response.data.data;

      return {
        status,
        mpesaRef,
        completedAt,
        amountKES,
      };
    } catch (error) {
      logger.error('Failed to check offramp status', { error: error.message, orderID });
      throw new PaymentError('Failed to check offramp status', error);
    }
  },

  /**
   * Legacy method for backward compatibility
   * @deprecated Use initiateOfframp instead
   */
  async sendMpesaPayout(phoneNumber, amountKES, reference) {
    logger.warn('sendMpesaPayout is deprecated - use initiateOfframp with on-chain withdrawal');
    // This method is kept for backward compatibility but should be migrated
    // to the new flow: withdrawToEscrow -> initiateOfframp
    throw new PaymentError('sendMpesaPayout requires migration to new offramp flow');
  },

  /**
   * Check payment status (generic)
   * @param {string} transactionId - Transaction/Order ID
   */
  async checkPaymentStatus(transactionId) {
    try {
      // Try onramp status first
      const onrampResponse = await this.checkOnrampStatus(transactionId);
      return onrampResponse;
    } catch {
      // Fall back to offramp status
      try {
        const offrampResponse = await this.checkOfframpStatus(transactionId);
        return offrampResponse;
      } catch (error) {
        logger.error('Failed to check payment status', { error: error.message, transactionId });
        throw new PaymentError('Failed to check payment status', error);
      }
    }
  },
};

export default swyptService;
