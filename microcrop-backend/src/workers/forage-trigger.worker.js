import Bull from 'bull';
import { env } from '../config/env.js';
import logger from '../utils/logger.js';
import { FORAGE_TRIGGER_QUEUE_NAME } from '../utils/constants.js';
import forageTriggerService from '../services/forage-trigger.service.js';

let forageTriggerQueue = null;

export function startForageTriggerWorker() {
  forageTriggerQueue = new Bull(FORAGE_TRIGGER_QUEUE_NAME, env.redisUrl, {
    defaultJobOptions: {
      removeOnComplete: 50,
      removeOnFail: false,
      attempts: 3,
      backoff: { type: 'exponential', delay: 30000 },
    },
  });

  forageTriggerQueue.process(async (job) => {
    const { alertId } = job.data;
    logger.info('Processing forage trigger job', { alertId });

    const result = await forageTriggerService.processForageAlert(alertId);
    return result;
  });

  forageTriggerQueue.on('completed', (job, result) => {
    logger.info('Forage trigger job completed', {
      jobId: job.id,
      alertId: job.data.alertId,
      policiesAffected: result?.policiesAffected,
    });
  });

  forageTriggerQueue.on('failed', (job, err) => {
    logger.error('Forage trigger job failed', {
      jobId: job.id,
      alertId: job.data.alertId,
      error: err.message,
      attemptsMade: job.attemptsMade,
    });
  });

  forageTriggerQueue.on('stalled', (job) => {
    logger.warn('Forage trigger job stalled', { jobId: job.id });
  });

  logger.info('Forage trigger worker started');
  return forageTriggerQueue;
}

export async function addForageTriggerJob(alertId) {
  if (!forageTriggerQueue) {
    throw new Error('Forage trigger queue not initialized');
  }

  const job = await forageTriggerQueue.add({ alertId }, { priority: 1 });
  logger.info('Forage trigger job queued', { jobId: job.id, alertId });
  return job;
}
