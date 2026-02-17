import { PrivyClient } from '@privy-io/node';
import logger from '../utils/logger.js';
import { env } from './env.js';

let privyClient = null;

if (env.privyAppId && env.privyAppSecret) {
  privyClient = new PrivyClient({
    appId: env.privyAppId,
    appSecret: env.privyAppSecret,
  });
  logger.info('Privy client initialized');
} else {
  logger.warn('Privy credentials not configured - per-org wallets will not be available');
}

export { privyClient };
