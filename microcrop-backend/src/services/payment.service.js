import prisma from '../config/database.js';
import swyptService from './swypt.service.js';
import logger from '../utils/logger.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import { v4 as uuidv4 } from 'uuid';

const paymentService = {
  async getConversionQuote(data) {
    const quote = await swyptService.getQuote(
      data.fromCurrency,
      data.toCurrency,
      data.amount
    );
    return quote;
  },

  async initiatePremiumPayment(organizationId, data) {
    const policy = await prisma.policy.findFirst({
      where: { id: data.reference, organizationId },
    });

    if (!policy) {
      throw new NotFoundError('Policy not found');
    }

    if (policy.status !== 'PENDING') {
      throw new ValidationError(`Policy is not in PENDING status. Current: ${policy.status}`);
    }

    const reference = uuidv4();

    const transaction = await prisma.transaction.create({
      data: {
        reference,
        type: 'PREMIUM',
        status: 'PENDING',
        amount: data.amount,
        currency: 'KES',
        phoneNumber: data.phoneNumber,
        policyId: data.reference,
        organizationId,
        metadata: {},
      },
    });

    const mpesaResult = await swyptService.initiateMpesaPayment(
      data.phoneNumber,
      data.amount,
      reference
    );

    await prisma.transaction.update({
      where: { id: transaction.id },
      data: {
        metadata: {
          checkoutRequestId: mpesaResult.checkoutRequestId,
        },
      },
    });

    return {
      transactionId: transaction.id,
      reference,
      status: 'PENDING',
      instructions: 'Check your phone for M-Pesa prompt',
    };
  },

  async checkPaymentStatus(organizationId, reference) {
    const transaction = await prisma.transaction.findFirst({
      where: { reference, organizationId },
    });

    if (!transaction) {
      throw new NotFoundError('Transaction not found');
    }

    return {
      id: transaction.id,
      reference: transaction.reference,
      type: transaction.type,
      status: transaction.status,
      amount: transaction.amount,
      currency: transaction.currency,
      completedAt: transaction.completedAt,
      createdAt: transaction.createdAt,
    };
  },

  async handlePaymentCallback(webhookData) {
    const transaction = await prisma.transaction.findFirst({
      where: {
        OR: [
          { reference: webhookData.reference },
          { metadata: { path: ['checkoutRequestId'], equals: webhookData.checkoutRequestId } },
        ],
      },
    });

    if (!transaction) {
      logger.warn('Transaction not found for payment callback', {
        reference: webhookData.reference,
        checkoutRequestId: webhookData.checkoutRequestId,
      });
      return;
    }

    if (webhookData.status === 'SUCCESS') {
      await prisma.transaction.update({
        where: { id: transaction.id },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          externalRef: webhookData.mpesaRef || webhookData.transactionId,
        },
      });

      if (transaction.policyId) {
        await prisma.policy.update({
          where: { id: transaction.policyId },
          data: {
            status: 'ACTIVE',
            premiumPaid: true,
            premiumPaidAt: new Date(),
          },
        });

        logger.info('Policy activated via payment callback', {
          policyId: transaction.policyId,
          transactionId: transaction.id,
        });
      }
    } else if (webhookData.status === 'FAILED') {
      await prisma.transaction.update({
        where: { id: transaction.id },
        data: {
          status: 'FAILED',
          failureReason: webhookData.reason || 'Payment failed',
        },
      });

      logger.info('Payment failed', {
        transactionId: transaction.id,
        reason: webhookData.reason,
      });
    }
  },
};

export default paymentService;
