import Bull from 'bull';
import { env } from '../config/env.js';
import prisma from '../config/database.js';
import logger from '../utils/logger.js';
import { LIVESTOCK_CRE_QUEUE_NAME } from '../utils/constants.js';
import { fetchAreaNDVI } from '../services/sentinel-hub.service.js';
import forageTriggerService from '../services/forage-trigger.service.js';
import { addForageTriggerJob } from './forage-trigger.worker.js';

// KLIP County bounding boxes [minLon, minLat, maxLon, maxLat]
const COUNTY_BBOXES = {
  TURKANA:    [34.0, 1.5, 36.5, 5.5],
  MARSABIT:   [36.5, 1.5, 39.5, 4.5],
  WAJIR:      [38.5, 0.0, 41.0, 3.0],
  MANDERA:    [39.5, 2.5, 42.0, 4.5],
  GARISSA:    [38.0, -2.0, 41.5, 1.5],
  ISIOLO:     [37.0, 0.0, 39.5, 2.0],
  SAMBURU:    [36.0, 0.5, 38.0, 2.5],
  TANA_RIVER: [38.5, -3.0, 40.5, -0.5],
  BARINGO:    [35.5, 0.0, 36.5, 1.5],
  LAIKIPIA:   [36.0, -0.5, 37.5, 0.5],
};

function getCurrentSeason() {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  if (month >= 3 && month <= 9) {
    return { season: 'LRLD', year };
  }
  if (month <= 2) {
    return { season: 'SRSD', year: year - 1 };
  }
  return { season: 'SRSD', year };
}

let livestockCREQueue = null;

export function startLivestockCREWorker() {
  if (!env.creFallbackEnabled) {
    logger.info('Livestock CRE fallback disabled (CRE_FALLBACK_ENABLED=false)');
    return null;
  }

  if (!env.sentinelHubClientId || !env.sentinelHubClientSecret) {
    logger.warn('Livestock CRE fallback skipped: SENTINEL_HUB_CLIENT_ID/SECRET not set');
    return null;
  }

  livestockCREQueue = new Bull(LIVESTOCK_CRE_QUEUE_NAME, env.redisUrl, {
    defaultJobOptions: {
      removeOnComplete: 20,
      removeOnFail: false,
      attempts: 2,
      backoff: { type: 'exponential', delay: 60000 },
    },
  });

  livestockCREQueue.process(async (job) => {
    logger.info('Livestock CRE fallback job started', { jobId: job.id });

    const { season, year } = getCurrentSeason();
    logger.info('Current IBLI season', { season, year });

    // Fetch active insurance units
    const units = await prisma.insuranceUnit.findMany({
      where: { isActive: true },
    });

    if (units.length === 0) {
      logger.info('No active insurance units to monitor');
      return { unitsProcessed: 0, alertsTriggered: 0 };
    }

    let unitsProcessed = 0;
    let alertsTriggered = 0;

    for (const unit of units) {
      const bbox = COUNTY_BBOXES[unit.unitCode];
      if (!bbox) {
        logger.warn('No bounding box for unit, skipping', { unitCode: unit.unitCode });
        continue;
      }

      try {
        const ndviValue = await fetchAreaNDVI(bbox, 16);

        if (ndviValue < 0) {
          logger.warn('No valid NDVI data for county', { county: unit.county, unitCode: unit.unitCode });
          continue;
        }

        logger.info('Area NDVI fetched', {
          county: unit.county,
          unitCode: unit.unitCode,
          ndviValue: ndviValue.toFixed(3),
        });

        // Evaluate trigger via existing service
        const result = await forageTriggerService.evaluateTrigger({
          insuranceUnitId: unit.id,
          ndviValue,
          season,
          year,
          source: 'SENTINEL2',
        });

        unitsProcessed++;

        if (result.triggered) {
          alertsTriggered++;
          logger.warn('Forage alert triggered by CRE fallback', {
            county: unit.county,
            ndviValue: result.ndviValue,
            strikeLevel: result.strikeLevel,
            deficitPercent: result.deficitPercent,
            alertId: result.alertId,
          });

          try {
            await addForageTriggerJob(result.alertId);
          } catch (queueErr) {
            logger.error('Failed to queue forage trigger job', { alertId: result.alertId, error: queueErr.message });
          }
        }
      } catch (error) {
        logger.error('Error processing insurance unit', {
          unitCode: unit.unitCode,
          county: unit.county,
          error: error.message,
        });
      }
    }

    const summary = { unitsProcessed, unitsTotal: units.length, alertsTriggered, season, year };
    logger.info('Livestock CRE fallback completed', summary);
    return summary;
  });

  livestockCREQueue.on('completed', (job, result) => {
    logger.info('Livestock CRE job completed', { jobId: job.id, ...result });
  });

  livestockCREQueue.on('failed', (job, err) => {
    logger.error('Livestock CRE job failed', { jobId: job.id, error: err.message });
  });

  // Schedule: 1st and 17th of each month at 06:00 UTC (matching CRE schedule)
  livestockCREQueue.add({}, {
    repeat: { cron: '0 6 1,17 * *' },
    jobId: 'livestock-cre-scheduled',
  }).catch((err) => logger.error('Failed to schedule livestock CRE cron', { error: err.message }));

  logger.info('Livestock CRE fallback worker started (schedule: 1st & 17th at 06:00 UTC)');
  return livestockCREQueue;
}

export async function triggerLivestockCRE() {
  if (!livestockCREQueue) {
    throw new Error('Livestock CRE queue not initialized');
  }
  const job = await livestockCREQueue.add({}, { priority: 1 });
  logger.info('Manual livestock CRE job queued', { jobId: job.id });
  return job;
}
