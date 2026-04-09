import prisma from '../config/database.js';
import paymentProviderService, { PROVIDERS } from './payment-provider.service.js';
import { createPolicyOnChain, activatePolicy } from '../blockchain/writers/policy.writer.js';
import { receivePremium, distributePremiumToPool } from '../blockchain/writers/treasury.writer.js';
import { addBlockchainRetryJob } from '../workers/blockchain.worker.js';
import { env } from '../config/env.js';
import logger from '../utils/logger.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import { v4 as uuidv4 } from 'uuid';

// Get USDC address based on environment
function getUsdcAddress() {
  return env.isDev ? env.contractUsdcDev : env.contractUsdc || env.contractUsdcDev;
}

const paymentService = {
  /**
   * Get conversion quote for premium payment
   */
  async getConversionQuote(data) {
    const quote = await paymentProviderService.getOnrampQuote(
      data.amount,
      data.fromCurrency || 'KES',
      data.toCurrency || 'USDC'
    );
    return quote;
  },

  /**
   * Initiate premium payment via M-Pesa
   * Uses Pretium as primary provider, Swypt as fallback
   */
  async initiatePremiumPayment(organizationId, data) {
    const policy = await prisma.policy.findFirst({
      where: { id: data.reference, organizationId },
      include: { organization: true },
    });

    if (!policy) {
      throw new NotFoundError('Policy not found');
    }

    if (policy.status !== 'PENDING') {
      throw new ValidationError(`Policy is not in PENDING status. Current: ${policy.status}`);
    }

    if (!policy.organization.poolAddress) {
      throw new ValidationError('Organization does not have a deployed risk pool');
    }

    // Validate payment amount covers the policy premium (KES)
    const expectedPremium = Number(policy.premiumKES || policy.premium);
    if (!data.amount || Number(data.amount) < expectedPremium) {
      throw new ValidationError(
        `Payment amount ${data.amount} is less than required premium ${expectedPremium} KES`
      );
    }

    const reference = uuidv4();
    const poolAddress = policy.organization.poolAddress;
    const usdcAddress = getUsdcAddress();

    // Create transaction record
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

    // Initiate M-Pesa payment via unified provider (Pretium first, Swypt fallback)
    const paymentResult = await paymentProviderService.initiateOnramp(
      data.phoneNumber,
      data.amount,
      poolAddress,
      usdcAddress,
      reference
    );

    // Update transaction with provider info
    await prisma.transaction.update({
      where: { id: transaction.id },
      data: {
        metadata: {
          provider: paymentResult.provider,
          orderId: paymentResult.orderId,
          checkoutRequestId: paymentResult.orderId,
        },
      },
    });

    // Store order ID on policy for tracking
    await prisma.policy.update({
      where: { id: data.reference },
      data: {
        swyptOrderId: paymentResult.orderId, // Reusing field for any provider's order ID
      },
    });

    logger.info('Premium payment initiated', {
      transactionId: transaction.id,
      provider: paymentResult.provider,
      orderId: paymentResult.orderId,
      policyId: data.reference,
    });

    return {
      transactionId: transaction.id,
      reference,
      orderId: paymentResult.orderId,
      provider: paymentResult.provider,
      status: 'PENDING',
      instructions: 'Check your phone for M-Pesa prompt',
    };
  },

  /**
   * Check payment status
   */
  async checkPaymentStatus(organizationId, reference) {
    const transaction = await prisma.transaction.findFirst({
      where: { reference, organizationId },
    });

    if (!transaction) {
      throw new NotFoundError('Transaction not found');
    }

    // Check provider status if we have an order ID and payment is pending
    const orderId = transaction.metadata?.orderId;
    const provider = transaction.metadata?.provider;

    if (orderId && transaction.status === 'PENDING') {
      try {
        const providerStatus = await paymentProviderService.checkOnrampStatus(orderId, provider);

        // Update transaction if status changed to success
        if (
          (providerStatus.status === 'SUCCESS' || providerStatus.status === 'COMPLETED') &&
          transaction.status !== 'COMPLETED'
        ) {
          await this.handlePaymentCallback({
            reference: transaction.reference,
            checkoutRequestId: orderId,
            status: 'SUCCESS',
            mpesaRef: providerStatus.mpesaRef,
            provider: provider,
          });
        }
      } catch (error) {
        logger.warn('Failed to check provider status', {
          error: error.message,
          orderId,
          provider,
        });
      }
    }

    // Reload transaction to get updated status
    const updatedTransaction = await prisma.transaction.findFirst({
      where: { reference, organizationId },
    });

    return {
      id: updatedTransaction.id,
      reference: updatedTransaction.reference,
      type: updatedTransaction.type,
      status: updatedTransaction.status,
      amount: updatedTransaction.amount,
      currency: updatedTransaction.currency,
      provider: updatedTransaction.metadata?.provider,
      completedAt: updatedTransaction.completedAt,
      createdAt: updatedTransaction.createdAt,
    };
  },

  /**
   * Handle payment callback/webhook from provider
   */
  async handlePaymentCallback(webhookData) {
    const transaction = await prisma.transaction.findFirst({
      where: {
        OR: [
          { reference: webhookData.reference },
          { metadata: { path: ['orderId'], equals: webhookData.checkoutRequestId } },
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

    // Idempotency: skip if already processed
    if (transaction.status === 'COMPLETED' || transaction.status === 'FAILED') {
      logger.info('Payment callback already processed, skipping', {
        transactionId: transaction.id,
        status: transaction.status,
      });
      return;
    }

    const provider = webhookData.provider || transaction.metadata?.provider;

    if (webhookData.status === 'SUCCESS' || webhookData.status === 'COMPLETED') {
      // Verify the received amount covers the policy premium
      if (transaction.policyId && webhookData.amount != null) {
        const policy = await prisma.policy.findUnique({
          where: { id: transaction.policyId },
        });

        if (policy) {
          const expectedPremium = Number(policy.premiumKES || policy.premium);
          if (Number(webhookData.amount) < expectedPremium) {
            logger.warn('Insufficient payment amount received', {
              transactionId: transaction.id,
              policyId: transaction.policyId,
              received: webhookData.amount,
              expected: expectedPremium,
            });

            await prisma.transaction.update({
              where: { id: transaction.id },
              data: {
                status: 'FAILED',
                failureReason: 'Insufficient payment amount',
                externalRef: webhookData.mpesaRef || webhookData.transactionId,
              },
            });
            return;
          }
        }
      }

      // Wrap transaction + policy updates in a DB transaction
      await prisma.$transaction(async (tx) => {
        await tx.transaction.update({
          where: { id: transaction.id },
          data: {
            status: 'COMPLETED',
            completedAt: new Date(),
            externalRef: webhookData.mpesaRef || webhookData.transactionId,
          },
        });

        if (transaction.policyId) {
          await tx.policy.update({
            where: { id: transaction.policyId },
            data: {
              premiumPaid: true,
              premiumPaidAt: new Date(),
              premiumTxHash: webhookData.mpesaRef,
            },
          });
        }
      });

      if (transaction.policyId) {
        // Get policy with organization and farmer
        const policy = await prisma.policy.findUnique({
          where: { id: transaction.policyId },
          include: { organization: true, farmer: true },
        });

        if (!policy) {
          logger.error('Policy not found for transaction', { policyId: transaction.policyId });
          return;
        }

        // Skip if policy already activated (another callback or listener already handled it)
        if (policy.status === 'ACTIVE' && policy.onChainPolicyId) {
          logger.info('Policy already active on-chain, skipping', { policyId: policy.id });
          return;
        }

        if (!policy.organization.poolAddress) {
          logger.error('Organization has no pool address', {
            organizationId: policy.organizationId,
            policyId: policy.id,
          });
          return;
        }

        // Premium already marked paid in the DB transaction above.
        // Blockchain operations run AFTER commit to avoid holding the DB tx open.
        try {
          // Create policy on-chain
          const backendWallet = env.backendWallet;
          if (!backendWallet) {
            logger.error('Backend wallet not configured - cannot create policy on-chain');
            return;
          }

          const farmerAddress = policy.farmer?.walletAddress || backendWallet;

          logger.info('Creating policy on-chain', {
            policyId: policy.id,
            farmerAddress,
            plotId: policy.plotId,
            sumInsured: policy.sumInsured,
            premium: policy.premium,
            durationDays: policy.durationDays,
            provider,
          });

          // Step 1: Create PENDING policy on-chain
          const { onChainPolicyId, txHash, blockNumber } = await createPolicyOnChain({
            farmerAddress,
            plotId: policy.plotId,
            sumInsured: Number(policy.sumInsured),
            premium: Number(policy.premium),
            durationDays: policy.durationDays,
            coverageType: 4, // COMPREHENSIVE
          });

          const poolAddress = policy.organization.poolAddress;
          const distributorAddress = policy.organization.walletAddress || backendWallet;
          const distributorName = policy.organization.name || 'MicroCrop';

          // Step 2: Record premium in Treasury
          await receivePremium(onChainPolicyId, Number(policy.premium));

          // Step 3: Distribute premium to RiskPool
          await distributePremiumToPool(poolAddress, onChainPolicyId, Number(policy.premium), distributorAddress);

          // Step 4: Activate policy + mint NFT
          await activatePolicy(onChainPolicyId, distributorAddress, distributorName, 'Africa', poolAddress);

          // Update policy with on-chain data
          await prisma.policy.update({
            where: { id: transaction.policyId },
            data: {
              status: 'ACTIVE',
              onChainPolicyId,
              txHash,
              blockNumber: BigInt(blockNumber),
            },
          });

          logger.info('Policy activated on-chain (V2 flow)', {
            policyId: transaction.policyId,
            onChainPolicyId,
            txHash,
            blockNumber,
            provider,
          });
        } catch (error) {
          logger.error('Failed to create policy on-chain', {
            policyId: transaction.policyId,
            error: error.message,
          });

          // Premium already marked paid in DB transaction above.
          // Leave status PENDING so it can be retried — DO NOT set ACTIVE without on-chain confirmation.
          // Queue automatic retry for on-chain policy creation
          addBlockchainRetryJob({
            type: 'CREATE_POLICY',
            policyId: transaction.policyId,
          }).catch((retryErr) =>
            logger.error('Failed to queue blockchain retry', { error: retryErr.message })
          );
        }
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
        provider,
      });
    }
  },

  /**
   * Initiate M-Pesa wallet funding for an organization.
   * USDC is sent directly to the org's Privy wallet address.
   */
  async initiateWalletFunding(organizationId, phoneNumber, amountKES) {
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
    });

    if (!org) {
      throw new NotFoundError('Organization not found');
    }

    if (!org.walletAddress) {
      throw new ValidationError('Organization does not have a wallet. Deploy a pool first.');
    }

    const reference = uuidv4();
    const usdcAddress = getUsdcAddress();

    // Create transaction record
    const transaction = await prisma.transaction.create({
      data: {
        reference,
        type: 'WALLET_FUNDING',
        status: 'PENDING',
        amount: amountKES,
        currency: 'KES',
        phoneNumber,
        organizationId,
        metadata: {},
      },
    });

    // Initiate M-Pesa payment — USDC goes to org wallet, NOT the pool
    const paymentResult = await paymentProviderService.initiateOnramp(
      phoneNumber,
      amountKES,
      org.walletAddress, // Destination: org's Privy wallet
      usdcAddress,
      reference
    );

    // Update transaction with provider info
    await prisma.transaction.update({
      where: { id: transaction.id },
      data: {
        metadata: {
          provider: paymentResult.provider,
          orderId: paymentResult.orderId,
          checkoutRequestId: paymentResult.orderId,
          destinationWallet: org.walletAddress,
        },
      },
    });

    logger.info('Wallet funding initiated', {
      transactionId: transaction.id,
      provider: paymentResult.provider,
      orderId: paymentResult.orderId,
      walletAddress: org.walletAddress,
      amountKES,
    });

    return {
      transactionId: transaction.id,
      reference,
      orderId: paymentResult.orderId,
      provider: paymentResult.provider,
      status: 'PENDING',
      walletAddress: org.walletAddress,
      instructions: 'Check your phone for M-Pesa prompt',
    };
  },

  /**
   * Get active payment provider info
   */
  async getProviderInfo() {
    return paymentProviderService.getAccountInfo();
  },
};

export default paymentService;
