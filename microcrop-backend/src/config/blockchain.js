import { ethers } from 'ethers';
import logger from '../utils/logger.js';
import { env } from './env.js';

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const abisDir = join(__dirname, '..', 'contracts', 'abis');

function loadABI(filename) {
  try {
    return JSON.parse(readFileSync(join(abisDir, filename), 'utf-8'));
  } catch {
    logger.warn(`ABI file not found: ${filename}`);
    return [];
  }
}

// Provider
const rpcUrl = env.isDev && env.baseSepoliaRpcUrl
  ? env.baseSepoliaRpcUrl
  : env.baseRpcUrl;

export const provider = new ethers.JsonRpcProvider(rpcUrl);

// Wallet (only if private key is configured and valid)
let _wallet = null;
if (env.privateKey && /^0x[0-9a-fA-F]{64}$/.test(env.privateKey)) {
  try {
    _wallet = new ethers.Wallet(env.privateKey, provider);
  } catch {
    logger.warn('Invalid PRIVATE_KEY - blockchain write operations will fail');
  }
}
export const wallet = _wallet;

if (!wallet) {
  logger.warn('No PRIVATE_KEY configured - blockchain write operations will fail');
}

// ABIs
const RiskPoolFactoryABI = loadABI('RiskPoolFactory.json');
const RiskPoolABI = loadABI('RiskPool.json');
const PolicyManagerABI = loadABI('PolicyManager.json');
const PlatformTreasuryABI = loadABI('PlatformTreasury.json');
const PayoutReceiverABI = loadABI('PayoutReceiver.json');

// Contract instances
function createContract(address, abi, signerOrProvider) {
  if (!address || address === '0x0000000000000000000000000000000000000000') {
    return null;
  }
  return new ethers.Contract(address, abi, signerOrProvider || provider);
}

const factoryAddr = env.isDev ? env.contractRiskPoolFactoryDev : env.contractRiskPoolFactory;
const treasuryAddr = env.isDev ? env.contractPlatformTreasuryDev : env.contractPlatformTreasury;

export const riskPoolFactory = createContract(factoryAddr, RiskPoolFactoryABI, wallet);
export const platformTreasury = createContract(treasuryAddr, PlatformTreasuryABI, provider);
export const policyManager = createContract(env.contractPolicyManager, PolicyManagerABI, wallet);
export const payoutReceiver = createContract(env.contractPayoutReceiver, PayoutReceiverABI, provider);

export function getRiskPoolContract(address) {
  return new ethers.Contract(address, RiskPoolABI, wallet || provider);
}

export { ethers };
