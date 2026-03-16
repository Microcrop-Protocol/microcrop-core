import { env } from '../config/env.js';

export const contractAddresses = {
  mainnet: {
    riskPoolFactory: env.contractRiskPoolFactory,
    platformTreasury: env.contractPlatformTreasury,
    policyManager: env.contractPolicyManager,
    payoutReceiver: env.contractPayoutReceiver,
    policyNFT: env.contractPolicyNFT,
  },
  testnet: {
    riskPoolFactory: env.contractRiskPoolFactoryDev,
    platformTreasury: env.contractPlatformTreasuryDev,
    policyManager: env.contractPolicyManagerDev,
    payoutReceiver: env.contractPayoutReceiverDev,
    policyNFT: env.contractPolicyNFTDev,
  },
};

export function getAddresses() {
  const network = env.nodeEnv === 'production' ? 'mainnet' : 'testnet';
  return contractAddresses[network];
}
