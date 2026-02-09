import logger from '../utils/logger.js';

/**
 * Mutex-based nonce manager for the backend wallet.
 * Ensures only one blockchain transaction is in-flight at a time,
 * preventing nonce collisions from concurrent requests.
 */
class NonceManager {
  constructor() {
    this._queue = [];
    this._processing = false;
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
