import axios from 'axios';
import { env } from '../config/env.js';
import logger from '../utils/logger.js';
import { PaymentError } from '../utils/errors.js';

const pretiumClient = axios.create({
  baseURL: env.pretiumApiUrl,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': env.pretiumApiKey,
  },
});

// Add response interceptor for logging
pretiumClient.interceptors.response.use(
  (response) => response,
  (error) => {
    logger.error('Pretium API error', {
      status: error.response?.status,
      data: error.response?.data,
      url: error.config?.url,
    });
    return Promise.reject(error);
  }
);

// Pretium's settlement wallet for Base network (for offramp - send USDC here first)
let settlementWalletAddress = null;

const pretiumService = {
  /**
   * Get account details including wallets and supported networks
   */
  async getAccountDetails() {
    try {
      const response = await pretiumClient.post('/account/detail');
      return response.data.data;
    } catch (error) {
      logger.error('Failed to get Pretium account details', { error: error.message });
      throw new PaymentError('Failed to get account details', error);
    }
  },

  /**
   * Get supported blockchain networks and settlement addresses
   */
  async getSupportedNetworks() {
    try {
      const response = await pretiumClient.post('/account/networks');
      return response.data.data;
    } catch (error) {
      logger.error('Failed to get Pretium networks', { error: error.message });
      throw new PaymentError('Failed to get supported networks', error);
    }
  },

  /**
   * Get settlement wallet address for a specific network
   * @param {string} network - Network name (e.g., 'Base', 'Celo')
   */
  async getSettlementWallet(network = 'Base') {
    try {
      // Cache the settlement wallet
      if (settlementWalletAddress) {
        return settlementWalletAddress;
      }

      const networks = await this.getSupportedNetworks();
      const targetNetwork = networks.find(
        (n) => n.name.toLowerCase() === network.toLowerCase()
      );

      if (!targetNetwork) {
        throw new Error(`Network ${network} not supported by Pretium`);
      }

      settlementWalletAddress = targetNetwork.settlement_wallet_address;
      return settlementWalletAddress;
    } catch (error) {
      logger.error('Failed to get settlement wallet', { error: error.message, network });
      throw new PaymentError('Failed to get settlement wallet', error);
    }
  },

  /**
   * Get wallet balance for a specific country
   * @param {string} countryId - Country ID (e.g., 'KE' for Kenya)
   */
  async getWalletBalance(countryId = 'KE') {
    try {
      const response = await pretiumClient.post(`/account/wallet/${countryId}`);
      return response.data.data;
    } catch (error) {
      logger.error('Failed to get Pretium wallet balance', { error: error.message, countryId });
      throw new PaymentError('Failed to get wallet balance', error);
    }
  },

  /**
   * Get exchange rate for a currency
   * @param {string} currencyCode - Currency code (e.g., 'KES')
   * @returns {Promise<{buyingRate: number, sellingRate: number, quotedRate: number}>}
   */
  async getExchangeRate(currencyCode = 'KES') {
    try {
      const response = await pretiumClient.post('/v1/exchange-rate', {
        currency_code: currencyCode,
      });

      const { buying_rate, selling_rate, quoted_rate } = response.data.data;

      return {
        buyingRate: parseFloat(buying_rate),
        sellingRate: parseFloat(selling_rate),
        quotedRate: parseFloat(quoted_rate),
        currencyCode,
      };
    } catch (error) {
      logger.error('Failed to get Pretium exchange rate', { error: error.message, currencyCode });
      throw new PaymentError('Failed to get exchange rate', error);
    }
  },

  /**
   * Get quote for onramp (fiat to crypto)
   * Uses buying_rate - how much KES per 1 USDC when user is buying crypto
   * @param {number} amountFiat - Amount in fiat (e.g., KES)
   * @param {string} fiatCurrency - Fiat currency code (e.g., 'KES')
   * @param {string} cryptoCurrency - Crypto currency (e.g., 'USDC')
   */
  async getOnrampQuote(amountFiat, fiatCurrency = 'KES', cryptoCurrency = 'USDC') {
    try {
      const rate = await this.getExchangeRate(fiatCurrency);
      // Buying rate = KES per 1 USD when user buys crypto
      const cryptoAmount = amountFiat / rate.buyingRate;

      return {
        inputAmount: amountFiat,
        inputCurrency: fiatCurrency,
        outputAmount: cryptoAmount.toFixed(6),
        outputCurrency: cryptoCurrency,
        exchangeRate: rate.buyingRate,
        quotedRate: rate.quotedRate,
      };
    } catch (error) {
      logger.error('Failed to get onramp quote', { error: error.message });
      throw new PaymentError('Failed to get onramp quote', error);
    }
  },

  /**
   * Get quote for offramp (crypto to fiat)
   * Uses selling_rate - how much KES per 1 USDC when user is selling crypto
   * @param {number} amountCrypto - Amount in crypto (e.g., USDC)
   * @param {string} cryptoCurrency - Crypto currency (e.g., 'USDC')
   * @param {string} fiatCurrency - Fiat currency code (e.g., 'KES')
   */
  async getOfframpQuote(amountCrypto, cryptoCurrency = 'USDC', fiatCurrency = 'KES') {
    try {
      const rate = await this.getExchangeRate(fiatCurrency);
      // Selling rate = KES per 1 USD when user sells crypto
      const fiatAmount = amountCrypto * rate.sellingRate;

      return {
        inputAmount: amountCrypto,
        inputCurrency: cryptoCurrency,
        outputAmount: fiatAmount.toFixed(2),
        outputCurrency: fiatCurrency,
        exchangeRate: rate.sellingRate,
        quotedRate: rate.quotedRate,
      };
    } catch (error) {
      logger.error('Failed to get offramp quote', { error: error.message });
      throw new PaymentError('Failed to get offramp quote', error);
    }
  },

  /**
   * Initiate M-Pesa STK push for onramp (KES to USDC)
   * User pays via M-Pesa, Pretium sends USDC to destination address
   *
   * @param {string} phoneNumber - M-Pesa phone number (07... or 254...)
   * @param {number} amountKES - Amount in KES
   * @param {string} destinationAddress - Wallet address to receive USDC
   * @param {string} network - Blockchain network (default: 'Base')
   * @param {string} asset - Token to receive (default: 'USDC')
   * @param {string} callbackUrl - URL for webhook notifications
   */
  async initiateOnramp(
    phoneNumber,
    amountKES,
    destinationAddress,
    network = 'Base',
    asset = 'USDC',
    callbackUrl = null
  ) {
    try {
      // Normalize phone number (remove + and ensure format)
      const shortcode = phoneNumber.replace(/^\+/, '').replace(/^254/, '0');

      const payload = {
        shortcode,
        amount: Math.round(amountKES), // Integer amount
        mobile_network: 'Safaricom', // Default to Safaricom for Kenya
        chain: network.toUpperCase(),
        asset: asset.toUpperCase(),
        address: destinationAddress,
      };

      if (callbackUrl) {
        payload.callback_url = callbackUrl;
      } else if (env.backendUrl) {
        payload.callback_url = `${env.backendUrl}/api/webhooks/pretium/onramp`;
      }

      logger.info('Initiating Pretium onramp', {
        shortcode,
        amount: amountKES,
        destinationAddress,
        network,
        asset,
      });

      const response = await pretiumClient.post('/v1/onramp/KES', payload);

      const { status, transaction_code, message } = response.data.data;

      return {
        transactionId: transaction_code,
        transactionCode: transaction_code,
        status: status,
        message: message,
      };
    } catch (error) {
      logger.error('Failed to initiate Pretium onramp', {
        error: error.message,
        phoneNumber,
        response: error.response?.data,
      });
      throw new PaymentError('Failed to initiate M-Pesa payment', error);
    }
  },

  /**
   * Initiate offramp / disbursement (USDC to M-Pesa)
   *
   * IMPORTANT: Before calling this, you must send USDC to Pretium's settlement wallet
   * and provide the transaction_hash of that transfer.
   *
   * @param {string} phoneNumber - M-Pesa recipient phone number
   * @param {number} amountKES - Amount in KES to disburse
   * @param {string} transactionHash - Hash of the USDC transfer to settlement wallet
   * @param {string} network - Blockchain network (default: 'Base')
   * @param {string} callbackUrl - URL for webhook notifications
   */
  async initiateOfframp(
    phoneNumber,
    amountKES,
    transactionHash,
    network = 'Base',
    callbackUrl = null
  ) {
    try {
      // Normalize phone number
      const shortcode = phoneNumber.replace(/^\+/, '').replace(/^254/, '0');

      const payload = {
        type: 'MOBILE',
        shortcode,
        amount: Math.round(amountKES), // Integer amount in KES
        mobile_network: 'Safaricom',
        chain: network.toUpperCase(),
        transaction_hash: transactionHash,
      };

      if (callbackUrl) {
        payload.callback_url = callbackUrl;
      } else if (env.backendUrl) {
        payload.callback_url = `${env.backendUrl}/api/webhooks/pretium/offramp`;
      }

      logger.info('Initiating Pretium offramp', {
        shortcode,
        amount: amountKES,
        transactionHash,
        network,
      });

      const response = await pretiumClient.post('/v1/pay/KES', payload);

      const { status, transaction_code, message } = response.data.data;

      return {
        transactionId: transaction_code,
        transactionCode: transaction_code,
        status: status,
        message: message,
        amountKES: amountKES,
      };
    } catch (error) {
      logger.error('Failed to initiate Pretium offramp', {
        error: error.message,
        phoneNumber,
        response: error.response?.data,
      });
      throw new PaymentError('Failed to initiate offramp', error);
    }
  },

  /**
   * Check transaction status
   * @param {string} transactionCode - Pretium transaction code
   * @param {string} currencyCode - Currency code (default: 'KES')
   */
  async checkTransactionStatus(transactionCode, currencyCode = 'KES') {
    try {
      const response = await pretiumClient.post(`/v1/status/${currencyCode}`, {
        transaction_code: transactionCode,
      });

      const data = response.data.data;

      // Map status to standardized format
      let normalizedStatus = data.status;
      if (data.status === 'COMPLETE') {
        normalizedStatus = 'SUCCESS';
      }

      return {
        transactionId: data.transaction_code,
        status: normalizedStatus,
        originalStatus: data.status,
        amount: parseFloat(data.amount),
        amountUSD: parseFloat(data.amount_in_usd),
        type: data.type,
        shortcode: data.shortcode,
        publicName: data.public_name,
        mpesaRef: data.receipt_number,
        receiptNumber: data.receipt_number,
        category: data.category, // DISBURSEMENT or COLLECTION
        chain: data.chain,
        asset: data.asset,
        txHash: data.transaction_hash,
        isReleased: data.is_released,
        message: data.message,
        createdAt: data.created_at,
      };
    } catch (error) {
      logger.error('Failed to check Pretium transaction status', {
        error: error.message,
        transactionCode,
      });
      throw new PaymentError('Failed to check transaction status', error);
    }
  },

  /**
   * Check onramp transaction status (alias for checkTransactionStatus)
   * @param {string} transactionCode - Pretium transaction code
   */
  async checkOnrampStatus(transactionCode) {
    const status = await this.checkTransactionStatus(transactionCode);
    return {
      status: status.status,
      mpesaRef: status.mpesaRef,
      completedAt: status.status === 'SUCCESS' ? new Date() : null,
      txHash: status.txHash,
      isReleased: status.isReleased,
    };
  },

  /**
   * Check offramp transaction status (alias for checkTransactionStatus)
   * @param {string} transactionCode - Pretium transaction code
   */
  async checkOfframpStatus(transactionCode) {
    const status = await this.checkTransactionStatus(transactionCode);
    return {
      status: status.status,
      mpesaRef: status.mpesaRef,
      completedAt: status.status === 'SUCCESS' ? new Date() : null,
      amountKES: status.amount,
    };
  },

  /**
   * Get all transactions within a date range (max 3 days)
   * @param {string} startDate - Start date (YYYY-MM-DD)
   * @param {string} endDate - End date (YYYY-MM-DD)
   * @param {string} currencyCode - Currency code (default: 'KES')
   */
  async getTransactions(startDate, endDate, currencyCode = 'KES') {
    try {
      const response = await pretiumClient.post(`/v1/transactions/${currencyCode}`, {
        start_date: startDate,
        end_date: endDate,
      });

      return response.data.data;
    } catch (error) {
      logger.error('Failed to get Pretium transactions', { error: error.message });
      throw new PaymentError('Failed to get transactions', error);
    }
  },
};

export default pretiumService;
