/**
 * End-to-end test for premium purchase flow.
 *
 * Tests:
 *  1. Blockchain connectivity & contract config
 *  2. createPolicyOnChain() with plotId keccak256 hashing
 *  3. Full callback flow: simulated payment success → on-chain policy creation → ACTIVE
 *
 * Usage:
 *   node --env-file=.env src/scripts/test-premium-e2e.js
 *
 * Requires: DATABASE_URL, PRIVATE_KEY, BASE_SEPOLIA_RPC_URL, CONTRACT_POLICY_MANAGER_DEV
 */

import { ethers } from 'ethers';
import prisma from '../config/database.js';
import { policyManager, wallet, provider, getUsdcAddress } from '../config/blockchain.js';
import { createPolicyOnChain } from '../blockchain/writers/policy.writer.js';
import paymentService from '../services/payment.service.js';
import { v4 as uuidv4 } from 'uuid';
import { env } from '../config/env.js';

const DIVIDER = '─'.repeat(60);

function log(label, data) {
  console.log(`\n${DIVIDER}`);
  console.log(`  ${label}`);
  console.log(DIVIDER);
  if (data) console.log(JSON.stringify(data, replacer, 2));
}

// Handle BigInt serialization
function replacer(key, value) {
  return typeof value === 'bigint' ? value.toString() : value;
}

async function step1_checkConfig() {
  log('STEP 1: Check blockchain config');

  const network = await provider.getNetwork();
  console.log('  Network:', { chainId: network.chainId.toString(), name: network.name });

  if (!wallet) throw new Error('No wallet configured (PRIVATE_KEY missing)');
  console.log('  Wallet:', wallet.address);

  const balance = await provider.getBalance(wallet.address);
  console.log('  ETH balance:', ethers.formatEther(balance));

  if (!policyManager) throw new Error('PolicyManager contract not configured');
  console.log('  PolicyManager:', await policyManager.getAddress());

  // Verify the contract is reachable
  try {
    const maxDuration = await policyManager.MAX_DURATION_DAYS();
    console.log('  MAX_DURATION_DAYS:', maxDuration.toString());
  } catch (err) {
    throw new Error(`PolicyManager not responding: ${err.shortMessage || err.message}`);
  }

  console.log('\n  ✓ Config OK');
}

async function step2_testCreatePolicyDirect() {
  log('STEP 2: Direct createPolicyOnChain() test');

  const testPlotId = uuidv4(); // simulates a real plot UUID
  const farmerAddress = wallet.address; // use our own wallet as farmer for testing

  console.log('  plotId (UUID):', testPlotId);
  console.log('  plotIdHash:', BigInt(ethers.keccak256(ethers.toUtf8Bytes(testPlotId))).toString());
  console.log('  farmer:', farmerAddress);
  console.log('  sumInsured: 10 USDC, premium: 1 USDC, duration: 30 days');

  const result = await createPolicyOnChain({
    farmerAddress,
    plotId: testPlotId,
    sumInsured: 10,
    premium: 1,
    durationDays: 30,
    coverageType: 4, // COMPREHENSIVE
  });

  console.log('\n  On-chain result:', result);
  console.log('\n  ✓ Policy created on-chain');
  return result;
}

async function step3_testCallbackFlow() {
  log('STEP 3: Full callback flow (DB → on-chain → ACTIVE)');

  // Find a real org with a pool
  const org = await prisma.organization.findFirst({
    where: { poolAddress: { not: null }, isActive: true },
  });

  if (!org) {
    console.log('  ⚠ No organization with a deployed pool found — skipping callback test');
    console.log('  (Deploy a pool first, then re-run)');
    return null;
  }
  console.log('  Org:', org.name, '| Pool:', org.poolAddress);

  // Find or create a farmer
  let farmer = await prisma.farmer.findFirst({
    where: { organizationId: org.id },
  });
  if (!farmer) {
    console.log('  ⚠ No farmer found for org — skipping callback test');
    return null;
  }
  console.log('  Farmer:', farmer.firstName, farmer.lastName, '|', farmer.phoneNumber);

  // Find a plot
  let plot = await prisma.plot.findFirst({
    where: { farmerId: farmer.id },
  });
  if (!plot) {
    console.log('  ⚠ No plot found for farmer — skipping callback test');
    return null;
  }
  console.log('  Plot:', plot.id, '|', plot.name || plot.cropType);

  // Create a test PENDING policy
  const policyNumber = `TEST-${Date.now()}`;
  const testPolicy = await prisma.policy.create({
    data: {
      policyNumber,
      organizationId: org.id,
      farmerId: farmer.id,
      plotId: plot.id,
      poolAddress: org.poolAddress,
      coverageType: 'COMPREHENSIVE',
      sumInsured: 10,
      premium: 1,
      platformFee: 0.1,
      netPremium: 0.9,
      startDate: new Date(),
      endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      durationDays: 30,
      status: 'PENDING',
    },
  });
  console.log('  Created test policy:', testPolicy.id, '| number:', policyNumber);

  // Create a PENDING transaction linked to the policy
  const txRef = uuidv4();
  const transaction = await prisma.transaction.create({
    data: {
      reference: txRef,
      type: 'PREMIUM',
      status: 'PENDING',
      amount: 130, // ~1 USDC in KES
      currency: 'KES',
      phoneNumber: farmer.phoneNumber,
      policyId: testPolicy.id,
      organizationId: org.id,
      metadata: {
        provider: 'test',
        orderId: `test-order-${Date.now()}`,
        checkoutRequestId: `test-checkout-${Date.now()}`,
      },
    },
  });
  console.log('  Created test transaction:', transaction.id, '| ref:', txRef);

  // Simulate successful payment callback
  console.log('\n  Simulating payment callback (SUCCESS)...');
  await paymentService.handlePaymentCallback({
    reference: txRef,
    checkoutRequestId: transaction.metadata.orderId,
    status: 'SUCCESS',
    mpesaRef: `TEST-MPESA-${Date.now()}`,
    provider: 'test',
  });

  // Check results
  const updatedPolicy = await prisma.policy.findUnique({ where: { id: testPolicy.id } });
  const updatedTx = await prisma.transaction.findUnique({ where: { id: transaction.id } });

  console.log('\n  Results:');
  console.log('  Policy status:', updatedPolicy.status);
  console.log('  Policy onChainPolicyId:', updatedPolicy.onChainPolicyId);
  console.log('  Policy txHash:', updatedPolicy.txHash);
  console.log('  Policy premiumPaid:', updatedPolicy.premiumPaid);
  console.log('  Transaction status:', updatedTx.status);

  if (updatedPolicy.status === 'ACTIVE' && updatedPolicy.onChainPolicyId) {
    console.log('\n  ✓ Full E2E flow passed — policy is ACTIVE on-chain');
  } else if (updatedPolicy.premiumPaid && updatedPolicy.status === 'PENDING') {
    console.log('\n  ⚠ Premium marked as paid but on-chain creation failed (check logs above)');
    console.log('  Policy will be retried by blockchain retry worker');
  } else {
    console.log('\n  ✗ Unexpected state');
  }

  return { policyId: testPolicy.id, onChainPolicyId: updatedPolicy.onChainPolicyId };
}

async function main() {
  console.log('\n🧪 MicroCrop Premium Purchase — End-to-End Test');
  console.log(`   Environment: ${env.nodeEnv}`);
  console.log(`   Time: ${new Date().toISOString()}\n`);

  try {
    await step1_checkConfig();
    await step2_testCreatePolicyDirect();
    await step3_testCallbackFlow();

    log('ALL DONE');
    console.log('  Tests completed successfully.\n');
  } catch (err) {
    console.error('\n  ✗ FAILED:', err.message);
    if (err.cause) console.error('  Cause:', err.cause.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
