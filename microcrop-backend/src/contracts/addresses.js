import { env } from '../config/env.js';

export const contractAddresses = {
  mainnet: {
    riskPoolFactory: env.contractRiskPoolFactory,
    platformTreasury: env.contractPlatformTreasury,
    policyManager: env.contractPolicyManager,
    payoutReceiver: env.contractPayoutReceiver,
  },
  testnet: {
    riskPoolFactory: env.contractRiskPoolFactoryDev,
    platformTreasury: env.contractPlatformTreasuryDev,
    policyManager: env.contractPolicyManager,
    payoutReceiver: env.contractPayoutReceiver,
  },
};

export function getAddresses() {
  const network = env.nodeEnv === 'production' ? 'mainnet' : 'testnet';
  return contractAddresses[network];
}
