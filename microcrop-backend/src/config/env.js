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
  contractPolicyNFT: optional('CONTRACT_POLICY_NFT', ''),
  contractUsdc: optional('CONTRACT_USDC', ''),

  // Dev contracts (Base Sepolia)
  baseSepoliaRpcUrl: optional('BASE_SEPOLIA_RPC_URL', ''),
  contractRiskPoolFactoryDev: optional('CONTRACT_RISK_POOL_FACTORY_DEV', ''),
  contractPlatformTreasuryDev: optional('CONTRACT_PLATFORM_TREASURY_DEV', ''),
  contractPolicyManagerDev: optional('CONTRACT_POLICY_MANAGER_DEV', ''),
  contractPayoutReceiverDev: optional('CONTRACT_PAYOUT_RECEIVER_DEV', ''),
  contractPolicyNFTDev: optional('CONTRACT_POLICY_NFT_DEV', ''),
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
  weatherxmApiUrl: optional('WEATHERXM_API_URL', 'https://api.weatherxm.com/v1'),
  planetApiKey: optional('PLANET_API_KEY', ''),
  planetApiUrl: optional('PLANET_API_URL', 'https://api.planet.com/data/v1'),

  // Sentinel Hub (backend satellite service)
  sentinelClientId: optional('SENTINEL_CLIENT_ID', ''),
  sentinelClientSecret: optional('SENTINEL_CLIENT_SECRET', ''),
  sentinelApiUrl: optional('SENTINEL_API_URL', 'https://sh.dataspace.copernicus.eu/api/v1'),
  sentinelOAuthUrl: optional('SENTINEL_OAUTH_URL', 'https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token'),

  // Satellite monitoring
  satelliteMonitoringEnabled: optional('SATELLITE_MONITORING_ENABLED', 'true') === 'true',
  satelliteMonitoringCron: optional('SATELLITE_MONITORING_CRON', '0 3 */5 * *'),
  ndviLookbackDays: parseInt(optional('NDVI_LOOKBACK_DAYS', '90'), 10),
  ndviBaselineYears: parseInt(optional('NDVI_BASELINE_YEARS', '3'), 10),
};

export default env;
