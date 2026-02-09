import axios from 'axios';
import { env } from '../config/env.js';
import logger from '../utils/logger.js';

const smsService = {
  async send(phoneNumber, message) {
    if (!env.atUsername || !env.atApiKey) {
      logger.warn('Africa\'s Talking not configured - SMS skipped');
      return { status: 'skipped', reason: 'AT not configured' };
    }

    if (!phoneNumber || typeof phoneNumber !== 'string' || !/^\+?\d{10,15}$/.test(phoneNumber)) {
      logger.warn('SMS skipped - invalid phone number format', { phoneNumber });
      return { status: 'failed', reason: 'invalid phone number' };
    }

    try {
      const params = new URLSearchParams();
      params.append('username', env.atUsername);
      params.append('to', phoneNumber);
      params.append('message', message);

      await axios.post(
        'https://api.africastalking.com/version1/messaging',
        params.toString(),
        {
          timeout: 10000,
          headers: {
            apiKey: env.atApiKey,
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
          },
        }
      );

      logger.info('SMS sent', { phoneNumber });
      return { status: 'sent' };
    } catch (error) {
      logger.error('Failed to send SMS', { phoneNumber, error: error.message });
      return { status: 'failed' };
    }
  },
};

export default smsService;
