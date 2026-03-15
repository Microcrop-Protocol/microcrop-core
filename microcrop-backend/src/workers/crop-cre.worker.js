import Bull from 'bull';
import { env } from '../config/env.js';
import prisma from '../config/database.js';
import logger from '../utils/logger.js';
import { CROP_CRE_QUEUE_NAME, DAMAGE_THRESHOLD } from '../utils/constants.js';
import { fetchPlotNDVI } from '../services/sentinel-hub.service.js';
import { addPayoutJob } from './payout.worker.js';

// Weather damage scoring (ported from CRE crop/main.ts)
function calculateWeatherDamage(weather) {
  let damage = 0;

  if (weather.temperature < 5 || weather.temperature > 45) damage += 40;
  else if (weather.temperature < 10 || weather.temperature > 40) damage += 25;
  else if (weather.temperature < 15 || weather.temperature > 35) damage += 10;

  if (weather.precipitation > 10) damage += 30;
  else if (weather.precipitation > 4) damage += 15;

  if (weather.humidity > 95) damage += 15;
  else if (weather.humidity > 90) damage += 8;

  if (weather.windSpeed > 80) damage += 20;
  else if (weather.windSpeed > 60) damage += 10;

  return Math.min(damage, 100);
}

// Satellite damage scoring (ported from CRE crop/main.ts)
function calculateSatelliteDamage(ndviValue) {
  if (ndviValue >= 0.7) return 0;
  if (ndviValue >= 0.6) return 10;
  if (ndviValue >= 0.5) return 25;
  if (ndviValue >= 0.4) return 40;
  if (ndviValue >= 0.3) return 60;
  if (ndviValue >= 0.2) return 80;
  return 100;
}

// Combined damage (60% weather, 40% satellite — matching CRE config)
const WEATHER_WEIGHT = 60;
const SATELLITE_WEIGHT = 40;

function calculateCombinedDamage(weatherDamage, satelliteDamage) {
  return Math.min(
    Math.floor((WEATHER_WEIGHT * weatherDamage + SATELLITE_WEIGHT * satelliteDamage) / 100),
    100
  );
}

// Fetch weather from WeatherXM Pro API
async function fetchWeatherData(lat, lon) {
  if (!env.weatherxmApiKey) {
    return null;
  }

  try {
    // Find nearest station
    const nearRes = await fetch(
      `${env.weatherxmApiUrl}/stations/near?lat=${lat}&lon=${lon}&radius=10000`,
      {
        headers: { 'X-API-KEY': env.weatherxmApiKey },
        signal: AbortSignal.timeout(10000),
      }
    );

    if (!nearRes.ok) return null;

    const nearData = await nearRes.json();
    const stations = nearData?.stations ?? nearData;
    if (!Array.isArray(stations) || stations.length === 0) return null;

    const stationId = stations[0].id;

    // Get latest observation
    const latestRes = await fetch(
      `${env.weatherxmApiUrl}/stations/${stationId}/latest`,
      {
        headers: { 'X-API-KEY': env.weatherxmApiKey },
        signal: AbortSignal.timeout(10000),
      }
    );

    if (!latestRes.ok) return null;

    const data = await latestRes.json();
    const obs = data?.observation;
    if (!obs) return null;

    return {
      temperature: obs.temperature ?? 25,
      precipitation: obs.precipitation_rate ?? 0,
      humidity: obs.humidity ?? 50,
      windSpeed: (obs.wind_speed ?? 0) * 3.6, // m/s → km/h
    };
  } catch (error) {
    logger.warn('WeatherXM fetch failed, using satellite-only assessment', { lat, lon, error: error.message });
    return null;
  }
}

let cropCREQueue = null;

export function startCropCREWorker() {
  if (!env.creFallbackEnabled) {
    logger.info('Crop CRE fallback disabled (CRE_FALLBACK_ENABLED=false)');
    return null;
  }

  if (!env.sentinelHubClientId || !env.sentinelHubClientSecret) {
    logger.warn('Crop CRE fallback skipped: SENTINEL_HUB_CLIENT_ID/SECRET not set');
    return null;
  }

  cropCREQueue = new Bull(CROP_CRE_QUEUE_NAME, env.redisUrl, {
    defaultJobOptions: {
      removeOnComplete: 20,
      removeOnFail: false,
      attempts: 2,
      backoff: { type: 'exponential', delay: 60000 },
    },
  });

  cropCREQueue.process(async (job) => {
    logger.info('Crop CRE fallback job started', { jobId: job.id });

    const now = new Date();

    // Fetch all active crop policies with plot coordinates
    const policies = await prisma.policy.findMany({
      where: {
        status: 'ACTIVE',
        premiumPaid: true,
        productType: 'CROP',
        startDate: { lte: now },
        endDate: { gte: now },
      },
      include: {
        plot: true,
        farmer: true,
      },
    });

    if (policies.length === 0) {
      logger.info('No active crop policies to assess');
      return { policiesAssessed: 0, reportsCreated: 0 };
    }

    logger.info(`Assessing ${policies.length} active crop policies`);

    let policiesAssessed = 0;
    let reportsCreated = 0;

    for (const policy of policies) {
      if (!policy.plot?.latitude || !policy.plot?.longitude) {
        logger.warn('Policy has no plot coordinates, skipping', { policyId: policy.id });
        continue;
      }

      if (!policy.farmer?.phoneNumber) {
        logger.warn('Policy has no farmer phone number, skipping', { policyId: policy.id });
        continue;
      }

      const lat = parseFloat(policy.plot.latitude);
      const lon = parseFloat(policy.plot.longitude);

      try {
        // Check for existing assessment today
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const existingAssessment = await prisma.damageAssessment.findFirst({
          where: {
            policyId: policy.id,
            source: 'CRE',
            triggerDate: { gte: todayStart },
          },
        });

        if (existingAssessment) {
          continue; // Already assessed today
        }

        // Fetch satellite NDVI
        const ndviValue = await fetchPlotNDVI(lat, lon, 7);

        if (ndviValue < 0) {
          logger.warn('No valid NDVI data for plot, skipping', { policyId: policy.id, lat, lon });
          continue;
        }

        const satelliteDamage = calculateSatelliteDamage(ndviValue);

        // Fetch weather data (optional — falls back to satellite-only)
        const weather = await fetchWeatherData(lat, lon);
        let weatherDamage = 0;
        let combinedDamage;

        if (weather) {
          weatherDamage = calculateWeatherDamage(weather);
          combinedDamage = calculateCombinedDamage(weatherDamage, satelliteDamage);
        } else {
          // Satellite-only assessment
          combinedDamage = satelliteDamage;
        }

        policiesAssessed++;

        logger.info('Policy damage assessment', {
          policyId: policy.id,
          policyNumber: policy.policyNumber,
          ndviValue: ndviValue.toFixed(3),
          weatherDamage,
          satelliteDamage,
          combinedDamage,
        });

        if (combinedDamage < DAMAGE_THRESHOLD) {
          continue;
        }

        // Create damage assessment
        await prisma.damageAssessment.create({
          data: {
            policyId: policy.id,
            organizationId: policy.organizationId,
            weatherDamage,
            satelliteDamage,
            combinedDamage,
            damagePercent: combinedDamage,
            source: 'CRE',
            triggered: true,
            triggerDate: new Date(),
          },
        });

        // Calculate payout
        const payoutAmount = parseFloat(
          ((combinedDamage / 100) * parseFloat(policy.sumInsured)).toFixed(2)
        );

        if (payoutAmount <= 0) continue;

        // Create payout
        const payout = await prisma.payout.create({
          data: {
            organizationId: policy.organizationId,
            policyId: policy.id,
            farmerId: policy.farmerId,
            amountUSDC: payoutAmount,
            damagePercent: combinedDamage,
            status: 'PENDING',
            initiatedAt: new Date(),
          },
        });

        // Queue payout for M-Pesa offramp
        await addPayoutJob({
          payoutId: payout.id,
          policyId: policy.id,
          organizationId: policy.organizationId,
          farmerId: policy.farmerId,
          phoneNumber: policy.farmer?.phoneNumber,
          amountUSDC: payoutAmount,
        });

        reportsCreated++;

        logger.info('Crop payout created via CRE fallback', {
          policyId: policy.id,
          policyNumber: policy.policyNumber,
          combinedDamage,
          payoutAmount,
          payoutId: payout.id,
        });
      } catch (error) {
        logger.error('Error assessing crop policy', {
          policyId: policy.id,
          error: error.message,
        });
      }
    }

    const summary = { policiesAssessed, policiesTotal: policies.length, reportsCreated };
    logger.info('Crop CRE fallback completed', summary);
    return summary;
  });

  cropCREQueue.on('completed', (job, result) => {
    logger.info('Crop CRE job completed', { jobId: job.id, ...result });
  });

  cropCREQueue.on('failed', (job, err) => {
    logger.error('Crop CRE job failed', { jobId: job.id, error: err.message });
  });

  // Schedule: daily at midnight UTC (matching CRE schedule)
  cropCREQueue.add({}, {
    repeat: { cron: '0 0 * * *' },
    jobId: 'crop-cre-scheduled',
  }).catch((err) => logger.error('Failed to schedule crop CRE cron', { error: err.message }));

  logger.info('Crop CRE fallback worker started (schedule: daily at 00:00 UTC)');
  return cropCREQueue;
}

export async function triggerCropCRE() {
  if (!cropCREQueue) {
    throw new Error('Crop CRE queue not initialized');
  }
  const job = await cropCREQueue.add({}, { priority: 1 });
  logger.info('Manual crop CRE job queued', { jobId: job.id });
  return job;
}
