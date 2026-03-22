import Bull from 'bull';
import { env } from '../config/env.js';
import logger from '../utils/logger.js';
import { SATELLITE_QUEUE_NAME } from '../utils/constants.js';
import satelliteMonitoringService from '../services/satellite-monitoring.service.js';

let satelliteQueue = null;

export function startSatelliteWorker() {
  if (!env.satelliteMonitoringEnabled) {
    logger.info('Satellite monitoring disabled — skipping worker start');
    return null;
  }

  satelliteQueue = new Bull(SATELLITE_QUEUE_NAME, env.redisUrl, {
    defaultJobOptions: {
      removeOnComplete: 50,
      removeOnFail: false,
      attempts: 3,
      backoff: { type: 'exponential', delay: 60000 },
    },
  });

  // --- Job processors ---

  satelliteQueue.process('monitor-plot', 5, async (job) => {
    const { plotId, organizationId } = job.data;
    logger.info('Processing satellite monitor-plot job', { plotId, organizationId });

    const result = await satelliteMonitoringService.monitorPlot(plotId, organizationId);
    return result;
  });

  satelliteQueue.process('monitor-batch', 1, async (job) => {
    logger.info('Processing satellite monitor-batch job', { jobId: job.id });

    const result = await satelliteMonitoringService.monitorAllActivePlots();
    return result;
  });

  satelliteQueue.process('compute-baselines', 1, async (job) => {
    logger.info('Processing satellite compute-baselines job', { jobId: job.id });

    const result = await satelliteMonitoringService.computeAllBaselines();
    return result;
  });

  // --- Repeatable jobs ---

  satelliteQueue.add(
    'monitor-batch',
    {},
    {
      repeat: { cron: env.satelliteMonitoringCron || '0 3 */5 * *' },
      jobId: 'satellite-monitor-batch',
    }
  );

  satelliteQueue.add(
    'compute-baselines',
    {},
    {
      repeat: { cron: '0 2 1 * *' },
      jobId: 'satellite-compute-baselines',
    }
  );

  // --- Event handlers ---

  satelliteQueue.on('completed', (job, result) => {
    logger.info('Satellite job completed', {
      jobId: job.id,
      name: job.name,
      plotId: job.data?.plotId,
      result,
    });
  });

  satelliteQueue.on('failed', (job, err) => {
    logger.error('Satellite job failed', {
      jobId: job.id,
      name: job.name,
      plotId: job.data?.plotId,
      error: err.message,
      attemptsMade: job.attemptsMade,
    });
  });

  satelliteQueue.on('stalled', (job) => {
    logger.warn('Satellite job stalled', {
      jobId: job.id,
      name: job.name,
    });
  });

  logger.info('Satellite monitoring worker started', {
    cron: env.satelliteMonitoringCron || '0 3 */5 * *',
  });

  return satelliteQueue;
}

export async function addSatelliteMonitorJob(plotId, organizationId) {
  if (!satelliteQueue) {
    throw new Error('Satellite queue not initialized');
  }

  const job = await satelliteQueue.add(
    'monitor-plot',
    { plotId, organizationId },
    { priority: 2 }
  );

  logger.info('Satellite monitor job queued', { jobId: job.id, plotId, organizationId });
  return job;
}

export function getSatelliteQueue() {
  return satelliteQueue;
}
