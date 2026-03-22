import prisma from '../config/database.js';
import { env } from '../config/env.js';
import logger from '../utils/logger.js';
import satelliteService from './satellite.service.js';
import { addNotificationJob } from '../workers/notification.worker.js';
import { NDVI_THRESHOLDS } from '../utils/constants.js';

// ---------------------------------------------------------------------------
// Helper: getDayOfYear
// ---------------------------------------------------------------------------
function getDayOfYear(date) {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date - start;
  const oneDay = 1000 * 60 * 60 * 24;
  return Math.floor(diff / oneDay);
}

// ---------------------------------------------------------------------------
// monitorAllActivePlots — Queue individual monitor jobs for every insured plot
// ---------------------------------------------------------------------------
async function monitorAllActivePlots() {
  // Lazy import to avoid circular dependency (worker imports service, service imports worker)
  const { addSatelliteMonitorJob } = await import('../workers/satellite.worker.js');

  const plots = await prisma.plot.findMany({
    where: {
      policies: { some: { status: 'ACTIVE', premiumPaid: true } },
    },
    include: {
      organization: { select: { id: true } },
    },
  });

  logger.info('Satellite batch monitor: queuing plots', { count: plots.length });

  for (const plot of plots) {
    try {
      await addSatelliteMonitorJob(plot.id, plot.organizationId);
    } catch (error) {
      logger.error('Failed to queue satellite monitor job for plot', {
        plotId: plot.id,
        error: error.message,
      });
    }
  }

  return { plotsQueued: plots.length };
}

// ---------------------------------------------------------------------------
// monitorPlot — Fetch NDVI, store reading, classify health, detect anomalies
// ---------------------------------------------------------------------------
async function monitorPlot(plotId, organizationId) {
  const plot = await prisma.plot.findUnique({
    where: { id: plotId },
    include: {
      policies: {
        where: { status: 'ACTIVE', premiumPaid: true },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  });

  if (!plot) {
    logger.warn('Satellite monitor: plot not found', { plotId });
    return null;
  }

  // Calculate date range: last N days (env.ndviLookbackDays, default 7)
  const toDate = new Date();
  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - (env.ndviLookbackDays || 7));

  const fromDateStr = fromDate.toISOString().split('T')[0];
  const toDateStr = toDate.toISOString().split('T')[0];

  // Fetch NDVI from Sentinel Hub
  const ndviData = await satelliteService.fetchNDVI(plot, fromDateStr, toDateStr);

  if (!ndviData) {
    logger.debug('No NDVI data returned for plot', { plotId, fromDate: fromDateStr, toDate: toDateStr });
    return { plotId, ndvi: null, health: 'UNKNOWN', anomaly: false };
  }

  const ndvi = ndviData.mean;
  const captureDate = ndviData.date || toDateStr;

  // Store the reading
  try {
    await satelliteService.storeNDVIReading(plotId, organizationId, ndviData, captureDate);
  } catch (error) {
    logger.error('Failed to store NDVI reading', { plotId, error: error.message });
    // Continue processing even if storage fails
  }

  // Get baseline and classify health
  const dayOfYear = getDayOfYear(new Date(captureDate));
  const baseline = await satelliteService.getBaseline(plotId, dayOfYear);
  const health = satelliteService.classifyHealth(ndvi, baseline);

  if (health.isAnomaly) {
    logger.warn('Satellite anomaly detected', {
      plotId,
      ndvi,
      status: health.status,
      deviation: health.deviation,
      baselineMean: baseline?.baselineMean,
    });

    // Create DamageAssessment if NDVI is below POOR threshold
    if (ndvi < NDVI_THRESHOLDS.POOR && plot.policies.length > 0) {
      const activePolicy = plot.policies[0];
      const satelliteDamage = satelliteService.calculateSatelliteDamage(ndvi);
      const deviationPercent = baseline
        ? parseFloat((((baseline.baselineMean - ndvi) / baseline.baselineMean) * 100).toFixed(2))
        : null;

      try {
        await prisma.damageAssessment.create({
          data: {
            policyId: activePolicy.id,
            organizationId,
            satelliteDamage,
            ndviDamage: deviationPercent,
            damagePercent: Math.round(satelliteDamage),
            source: 'CRE',
            triggered: true,
            triggerDate: new Date(),
          },
        });

        logger.info('Created satellite damage assessment', {
          policyId: activePolicy.id,
          plotId,
          ndvi,
          satelliteDamage,
          deviationPercent,
        });
      } catch (error) {
        logger.error('Failed to create damage assessment', {
          plotId,
          policyId: activePolicy.id,
          error: error.message,
        });
      }

      // Notify about severe anomaly via SMS (fire-and-forget)
      try {
        await addNotificationJob({
          type: 'SATELLITE_ANOMALY',
          phoneNumber: null, // Will be handled by notification service if needed
          message: `Alert: Satellite monitoring detected severe vegetation stress on plot ${plot.name}. NDVI: ${ndvi.toFixed(3)}, Status: ${health.status}`,
        });
      } catch {
        // Notification is best-effort
      }
    }
  }

  return { plotId, ndvi, health: health.status, anomaly: health.isAnomaly };
}

// ---------------------------------------------------------------------------
// computeAllBaselines — Recompute baselines for all plots with satellite data
// ---------------------------------------------------------------------------
async function computeAllBaselines() {
  // Find all distinct plot IDs that have satellite data
  const plotIds = await prisma.satelliteData.findMany({
    where: { ndvi: { not: null } },
    select: { plotId: true },
    distinct: ['plotId'],
  });

  const dayOfYear = getDayOfYear(new Date());
  let processed = 0;

  logger.info('Computing baselines for plots with satellite data', {
    plotCount: plotIds.length,
    dayOfYear,
  });

  for (const { plotId } of plotIds) {
    try {
      await satelliteService.computeBaseline(plotId, dayOfYear);
      processed++;
    } catch (error) {
      logger.error('Failed to compute baseline for plot', {
        plotId,
        error: error.message,
      });
    }
  }

  logger.info('Baseline computation complete', { plotsProcessed: processed, total: plotIds.length });

  return { plotsProcessed: processed };
}

// ---------------------------------------------------------------------------
// detectAnomaly — Statistical anomaly detection for a single plot/reading
// ---------------------------------------------------------------------------
async function detectAnomaly(plotId, currentNdvi, captureDate) {
  const dayOfYear = getDayOfYear(new Date(captureDate));
  const baseline = await satelliteService.getBaseline(plotId, dayOfYear);

  if (!baseline || baseline.baselineStdDev === 0) {
    return {
      isAnomaly: false,
      deviationSigma: 0,
      expectedRange: null,
      severity: null,
    };
  }

  const { baselineMean, baselineStdDev } = baseline;

  const isAnomaly = currentNdvi < baselineMean - 2 * baselineStdDev;
  const deviationSigma = parseFloat(
    ((baselineMean - currentNdvi) / baselineStdDev).toFixed(2)
  );

  const low = parseFloat((baselineMean - 2 * baselineStdDev).toFixed(3));
  const high = parseFloat((baselineMean + 2 * baselineStdDev).toFixed(3));

  let severity = null;
  if (deviationSigma > 3) {
    severity = 'SEVERE';
  } else if (deviationSigma > 2) {
    severity = 'MODERATE';
  }

  return {
    isAnomaly,
    deviationSigma,
    expectedRange: { low, high },
    severity,
  };
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------
const satelliteMonitoringService = {
  monitorAllActivePlots,
  monitorPlot,
  computeAllBaselines,
  detectAnomaly,
};

export default satelliteMonitoringService;
