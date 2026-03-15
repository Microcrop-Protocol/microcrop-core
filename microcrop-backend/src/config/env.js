import 'dotenv/config';

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name, defaultValue = '') {
  return process.env[name] || defaultValue;
}

const isDev = optional('NODE_ENV', 'development') === 'development';

export const env = {
  nodeEnv: optional('NODE_ENV', 'development'),
  isDev,
  isProd: optional('NODE_ENV') === 'production',
  port: parseInt(optional('PORT', '3000'), 10),
  backendUrl: optional('BACKEND_URL', 'http://localhost:3000'),

  // Database
  databaseUrl: required('DATABASE_URL'),

  // Redis
  redisUrl: optional('REDIS_URL', 'redis://localhost:6379'),

  // JWT
  jwtSecret: required('JWT_SECRET'),
  jwtRefreshSecret: required('JWT_REFRESH_SECRET'),

  // Blockchain
  baseRpcUrl: optional('BASE_RPC_URL', 'https://mainnet.base.org'),
  baseChainId: parseInt(optional('BASE_CHAIN_ID', '8453'), 10),
  privateKey: optional('PRIVATE_KEY', ''),

  // Contracts
  contractRiskPoolFactory: optional('CONTRACT_RISK_POOL_FACTORY', ''),
  contractPlatformTreasury: optional('CONTRACT_PLATFORM_TREASURY', ''),
  contractPolicyManager: optional('CONTRACT_POLICY_MANAGER', ''),
  contractPayoutReceiver: optional('CONTRACT_PAYOUT_RECEIVER', ''),

  // Dev contracts (Base Sepolia)
  baseSepoliaRpcUrl: optional('BASE_SEPOLIA_RPC_URL', ''),
  contractRiskPoolFactoryDev: optional('CONTRACT_RISK_POOL_FACTORY_DEV', ''),
  contractPlatformTreasuryDev: optional('CONTRACT_PLATFORM_TREASURY_DEV', ''),
  contractPolicyManagerDev: optional('CONTRACT_POLICY_MANAGER_DEV', ''),
  contractPayoutReceiverDev: optional('CONTRACT_PAYOUT_RECEIVER_DEV', ''),
  contractUsdcDev: optional('CONTRACT_USDC_DEV', ''),

  // Backend wallet (for on-chain operations)
  backendWallet: optional('BACKEND_WALLET', ''),

  // Privy (per-org server wallets)
  privyAppId: optional('PRIVY_APP_ID', ''),
  privyAppSecret: optional('PRIVY_APP_SECRET', ''),
  privyAuthKey: optional('PRIVY_AUTH_KEY', ''),

  // Pretium (Primary payment provider)
  pretiumApiUrl: optional('PRETIUM_API_URL', 'https://api.pretium.africa'),
  pretiumApiKey: optional('PRETIUM_API_KEY', ''),
  pretiumEnabled: optional('PRETIUM_ENABLED', 'true') === 'true',

  // Swypt (Fallback payment provider)
  swyptApiUrl: optional('SWYPT_API_URL', 'https://pool.swypt.io/api'),
  swyptApiKey: optional('SWYPT_API_KEY', ''),
  swyptApiSecret: optional('SWYPT_API_SECRET', ''),
  swyptProjectName: optional('SWYPT_PROJECT_NAME', 'microcrop'),
  swyptContractAddress: optional('SWYPT_CONTRACT_ADDRESS', ''),
  swyptEnabled: optional('SWYPT_ENABLED', 'true') === 'true',

  // Payment provider preference (pretium or swypt)
  primaryPaymentProvider: optional('PRIMARY_PAYMENT_PROVIDER', 'pretium'),

  // Africa's Talking
  atUsername: optional('AT_USERNAME', ''),
  atApiKey: optional('AT_API_KEY', ''),

  // Webhook signature verification
  webhookSecret: optional('WEBHOOK_SECRET', ''),

  // Allowed CORS origins (comma-separated)
  allowedOrigins: optional('ALLOWED_ORIGINS', ''),

  // Internal API (CRE workflow)
  internalApiKey: optional('INTERNAL_API_KEY', ''),

  // Email (Resend)
  resendApiKey: optional('RESEND_API_KEY', ''),
  emailFrom: optional('EMAIL_FROM', 'noreply@microcrop.app'),

  // Frontend
  frontendUrl: optional('FRONTEND_URL', 'https://network.microcrop.app'),

  // Optional APIs
  weatherxmApiKey: optional('WEATHERXM_API_KEY', ''),
  weatherxmApiUrl: optional('WEATHERXM_API_URL', 'https://pro.weatherxm.com/api/v1'),
  planetApiKey: optional('PLANET_API_KEY', ''),
  planetApiUrl: optional('PLANET_API_URL', 'https://api.planet.com/data/v1'),

  // Sentinel Hub (for backend CRE fallback)
  sentinelHubClientId: optional('SENTINEL_HUB_CLIENT_ID', ''),
  sentinelHubClientSecret: optional('SENTINEL_HUB_CLIENT_SECRET', ''),
  sentinelHubApiUrl: optional('SENTINEL_HUB_API_URL', 'https://services.sentinel-hub.com/api/v1'),

  // Backend CRE fallback toggle
  creFallbackEnabled: optional('CRE_FALLBACK_ENABLED', 'false') === 'true',
};

export default env;
