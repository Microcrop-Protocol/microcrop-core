import axios from 'axios';
import { env } from '../config/env.js';
import logger from '../utils/logger.js';
import { PaymentError } from '../utils/errors.js';

const swyptClient = axios.create({
  baseURL: env.swyptApiUrl,
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': env.swyptApiKey,
    'x-api-secret': env.swyptApiSecret,
  },
});

const swyptService = {
  async getQuote(fromCurrency, toCurrency, amount) {
    try {
      const response = await swyptClient.post('/quote', {
        fromCurrency,
        toCurrency,
        amount,
      });

      const { quoteId, fromAmount, toAmount, exchangeRate, expiresAt } = response.data;

      return { quoteId, fromAmount, toAmount, exchangeRate, expiresAt };
    } catch (error) {
      logger.error('Failed to get Swypt quote', { error: error.message });
      throw new PaymentError('Failed to get conversion quote', error);
    }
  },

  async initiateMpesaPayment(phoneNumber, amountKES, reference) {
    try {
      const response = await swyptClient.post('/mpesa/stk-push', {
        phoneNumber,
        amount: amountKES,
        reference,
      });

      const { transactionId, checkoutRequestId } = response.data;

      return {
        transactionId,
        checkoutRequestId,
        status: 'PENDING',
      };
    } catch (error) {
      logger.error('Failed to initiate M-Pesa payment', { error: error.message });
      throw new PaymentError('Failed to initiate M-Pesa payment', error);
    }
  },

  async sendMpesaPayout(phoneNumber, amountKES, reference) {
    try {
      const response = await swyptClient.post('/mpesa/b2c', {
        phoneNumber,
        amount: amountKES,
        reference,
      });

      const { transactionId, status } = response.data;

      return { transactionId, status };
    } catch (error) {
      logger.error('Failed to send M-Pesa payout', { error: error.message });
      throw new PaymentError('Failed to send M-Pesa payout', error);
    }
  },

  async checkPaymentStatus(transactionId) {
    try {
      const response = await swyptClient.get(`/transactions/${transactionId}`);

      const { status, mpesaRef, completedAt } = response.data;

      return { status, mpesaRef, completedAt };
    } catch (error) {
      logger.error('Failed to check payment status', { error: error.message });
      throw new PaymentError('Failed to check payment status', error);
    }
  },
};

export default swyptService;
