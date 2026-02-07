import Bull from 'bull';
import { env } from '../config/env.js';
import smsService from '../services/sms.service.js';
import logger from '../utils/logger.js';
import { NOTIFICATION_QUEUE_NAME } from '../utils/constants.js';

let notificationQueue = null;

export function startNotificationWorker() {
  notificationQueue = new Bull(NOTIFICATION_QUEUE_NAME, env.redisUrl);

  notificationQueue.process(async (job) => {
    const { type, phoneNumber, message } = job.data;

    logger.info('Processing notification job', { type, phoneNumber });

    const result = await smsService.send(phoneNumber, message);

    logger.info('Notification sent', { type, phoneNumber, result });
  });

  notificationQueue.on('failed', (job, err) => {
    logger.error('Notification job failed', {
      jobId: job.id,
      type: job.data.type,
      error: err.message,
      attemptsMade: job.attemptsMade,
    });
  });

  notificationQueue.on('completed', (job) => {
    logger.info('Notification job completed', {
      jobId: job.id,
      type: job.data.type,
    });
  });

  logger.info('Notification worker started');
}

export function getNotificationQueue() {
  return notificationQueue;
}

export async function addNotificationJob(data) {
  if (!notificationQueue) {
    return;
  }

  await notificationQueue.add(data, {
    attempts: 2,
    backoff: {
      type: 'fixed',
      delay: 30000,
    },
  });

  logger.info('Notification job added to queue', { type: data.type });
}
