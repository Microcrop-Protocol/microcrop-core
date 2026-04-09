import logger from '../utils/logger.js';
import redis from '../config/redis.js';
import { provider, wallet } from '../config/blockchain.js';
import { env } from '../config/env.js';

const NONCE_REDIS_PREFIX = 'nonce:platform:';
const PENDING_TX_KEY = 'nonce:pending_tx';
const STUCK_TX_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Mutex-based nonce manager for the backend wallet.
 * Ensures only one blockchain transaction is in-flight at a time,
 * preventing nonce collisions from concurrent requests.
 * Persists nonce state in Redis for crash recovery.
 */
class NonceManager {
  constructor() {
    this._queue = [];
    this._processing = false;
    this._currentNonce = null;
  }

  /**
   * Get the Redis key for the current chain's nonce.
   */
  _redisKey() {
    return `${NONCE_REDIS_PREFIX}${env.baseChainId}`;
  }

  /**
   * Get the next nonce, checking Redis cache first then the network.
   * After resolving, caches the nonce in Redis.
   */
  async _getNextNonce() {
    if (!wallet) return null;

    try {
      // Check Redis for cached nonce first
      const cached = await redis.get(this._redisKey());
      if (cached !== null) {
        const cachedNonce = parseInt(cached, 10);
        // Verify against network to catch external txs
        const networkNonce = await provider.getTransactionCount(wallet.address, 'pending');

        if (networkNonce > cachedNonce) {
          // Network is ahead (external tx sent), use network nonce
          logger.info('Nonce manager: network nonce ahead of cached, syncing', {
            cached: cachedNonce,
            network: networkNonce,
          });
          await redis.set(this._redisKey(), networkNonce);
          return networkNonce;
        }

        return cachedNonce;
      }

      // No cached nonce, fetch from network
      const nonce = await provider.getTransactionCount(wallet.address, 'pending');
      await redis.set(this._redisKey(), nonce);
      logger.info('Nonce manager: initialized nonce from network', { nonce });
      return nonce;
    } catch (error) {
      logger.warn('Nonce manager: Redis/network nonce lookup failed, falling back to network only', {
        error: error.message,
      });
      // Fall back to network-only if Redis is down
      return provider.getTransactionCount(wallet.address, 'pending');
    }
  }

  /**
   * Increment the cached nonce in Redis after a successful tx send.
   */
  async _incrementNonce() {
    try {
      await redis.incr(this._redisKey());
    } catch (error) {
      logger.warn('Nonce manager: failed to increment Redis nonce', { error: error.message });
    }
  }

  /**
   * Record a pending transaction for stuck-tx detection.
   */
  async _recordPendingTx(txHash) {
    try {
      await redis.hset(PENDING_TX_KEY, txHash, Date.now().toString());
    } catch (error) {
      logger.warn('Nonce manager: failed to record pending tx', { error: error.message });
    }
  }

  /**
   * Clear a pending transaction after it confirms.
   */
  async _clearPendingTx(txHash) {
    try {
      await redis.hdel(PENDING_TX_KEY, txHash);
    } catch (error) {
      logger.warn('Nonce manager: failed to clear pending tx', { error: error.message });
    }
  }

  /**
   * Check for stuck transactions (pending > 5 minutes).
   */
  async checkStuckTransactions() {
    try {
      const pending = await redis.hgetall(PENDING_TX_KEY);
      const now = Date.now();

      for (const [txHash, timestamp] of Object.entries(pending)) {
        const elapsed = now - parseInt(timestamp, 10);
        if (elapsed > STUCK_TX_THRESHOLD_MS) {
          logger.error('CRITICAL: Stuck transaction detected — pending > 5 minutes', {
            txHash,
            elapsedMinutes: Math.round(elapsed / 60000 * 10) / 10,
          });
        }
      }
    } catch (error) {
      logger.warn('Nonce manager: stuck tx check failed', { error: error.message });
    }
  }

  /**
   * Execute a function that sends a blockchain transaction.
   * Queues concurrent calls so only one runs at a time.
   * @param {Function} fn - async function that sends a tx and returns a result
   * @returns {Promise} - resolves with fn's return value
   */
  async serialize(fn) {
    return new Promise((resolve, reject) => {
      this._queue.push({ fn, resolve, reject });
      this._processNext();
    });
  }

  async _processNext() {
    if (this._processing || this._queue.length === 0) return;
    this._processing = true;

    const { fn, resolve, reject } = this._queue.shift();

    try {
      const result = await fn();
      resolve(result);
    } catch (error) {
      reject(error);
    } finally {
      this._processing = false;
      this._processNext();
    }
  }
}

const nonceManager = new NonceManager();

export default nonceManager;
