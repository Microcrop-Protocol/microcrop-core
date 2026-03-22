import { Router } from 'express';
import crypto from 'crypto';
import prisma from '../config/database.js';
import { env } from '../config/env.js';
import logger from '../utils/logger.js';
import { invitationController } from '../controllers/invitation.controller.js';
import { checkPendingPayouts } from '../workers/payout.worker.js';
import forageTriggerService from '../services/forage-trigger.service.js';
import { addForageTriggerJob } from '../workers/forage-trigger.worker.js';

const router = Router();

// Internal API key authentication middleware
function authenticateInternal(req, res, next) {
  const apiKey = req.headers['x-api-key'];

  if (!env.internalApiKey || !apiKey) {
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Invalid API key' },
    });
  }

  const keyBuffer = Buffer.from(apiKey);
  const expectedBuffer = Buffer.from(env.internalApiKey);

  if (keyBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(keyBuffer, expectedBuffer)) {
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Invalid API key' },
    });
  }

  next();
}

router.use(authenticateInternal);

/**
 * GET /api/internal/active-policies
 *
 * Returns all active policies with their plot coordinates and crop type.
 * Called by the Chainlink CRE workflow to determine which policies to assess.
 */
router.get('/active-policies', async (_req, res, next) => {
  try {
    const now = new Date();

    const policies = await prisma.policy.findMany({
      where: {
        status: 'ACTIVE',
        premiumPaid: true,
        startDate: { lte: now },
        endDate: { gte: now },
      },
      select: {
        id: true,
        policyId: true,
        policyNumber: true,
        productType: true,
        sumInsured: true,
        livestockPeril: true,
        season: true,
        insuranceUnitId: true,
        plot: {
          select: {
            latitude: true,
            longitude: true,
            cropType: true,
            boundary: true,
          },
        },
        herd: {
          select: {
            livestockType: true,
            headCount: true,
            tluCount: true,
          },
        },
        insuranceUnit: {
          select: {
            county: true,
            unitCode: true,
          },
        },
        farmer: {
          select: {
            walletAddress: true,
          },
        },
      },
    });

    const result = policies.map((p) => {
      if (p.productType === 'LIVESTOCK' && p.herd) {
        return {
          policyId: p.id,
          onChainPolicyId: p.policyId || p.policyNumber,
          productType: 'LIVESTOCK',
          season: p.season,
          insuranceUnitId: p.insuranceUnitId,
          county: p.insuranceUnit?.county || null,
          unitCode: p.insuranceUnit?.unitCode || null,
          livestockType: p.herd.livestockType,
          headCount: p.herd.headCount,
          tluCount: parseFloat(p.herd.tluCount),
          sumInsured: parseFloat(p.sumInsured),
          farmerWallet: p.farmer?.walletAddress || null,
        };
      }
      return {
        policyId: p.id,
        onChainPolicyId: p.policyId || p.policyNumber,
        productType: 'CROP',
        latitude: p.plot ? parseFloat(p.plot.latitude) : null,
        longitude: p.plot ? parseFloat(p.plot.longitude) : null,
        boundary: p.plot?.boundary || null,
        cropType: p.plot?.cropType || null,
        sumInsured: parseFloat(p.sumInsured),
        farmerWallet: p.farmer?.walletAddress || null,
      };
    });

    logger.info(`Internal API: returning ${result.length} active policies`);

    res.json({ success: true, policies: result });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/internal/invitations/cleanup
 *
 * Cleans up expired invitations. Called by cron job.
 */
router.post('/invitations/cleanup', invitationController.cleanupExpired);

/**
 * POST /api/internal/policies/expire-check
 *
 * Expires overdue policies. Called by cron job.
 */
router.post('/policies/expire-check', async (_req, res, next) => {
  try {
    const now = new Date();

    const result = await prisma.policy.updateMany({
      where: {
        status: 'ACTIVE',
        endDate: { lt: now },
      },
      data: {
        status: 'EXPIRED',
      },
    });

    logger.info(`Internal API: expired ${result.count} overdue policies`);

    res.json({ success: true, data: { expiredCount: result.count } });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/internal/payouts/check-pending
 *
 * Finalizes payouts stuck in PROCESSING status. Called by cron job.
 */
router.post('/payouts/check-pending', async (_req, res, next) => {
  try {
    await checkPendingPayouts();
    logger.info('Internal API: pending payouts check completed');
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/internal/forage-trigger
 *
 * Evaluates NDVI data against strike levels and triggers mass payouts.
 * Called by CRE when new NDVI data is available.
 */
router.post('/forage-trigger', async (req, res, next) => {
  try {
    const { insuranceUnitId, season, year, ndviValue, cumulativeNDVI, source } = req.body;

    if (!insuranceUnitId || !season || !year || (ndviValue === undefined && cumulativeNDVI === undefined)) {
      return res.status(400).json({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'Missing required fields: insuranceUnitId, season, year, and either ndviValue or cumulativeNDVI' },
      });
    }

    const result = await forageTriggerService.evaluateTrigger({
      insuranceUnitId,
      ndviValue,
      season,
      year,
      cumulativeNDVI,
      source,
    });

    // If triggered, queue the mass payout processing
    if (result.triggered) {
      try {
        await addForageTriggerJob(result.alertId);
      } catch (queueErr) {
        logger.error('Failed to queue forage trigger job', { alertId: result.alertId, error: queueErr.message });
      }
    }

    logger.info('Internal API: forage trigger evaluation', {
      insuranceUnitId,
      season,
      year,
      triggered: result.triggered,
    });

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/internal/insurance-units
 *
 * Returns all active insurance units for CRE to monitor NDVI.
 */
router.get('/insurance-units', async (_req, res, next) => {
  try {
    const units = await prisma.insuranceUnit.findMany({
      where: { isActive: true },
      select: {
        id: true,
        county: true,
        unitCode: true,
        ndviBaselineLRLD: true,
        ndviBaselineSRSD: true,
        strikeLevelLRLD: true,
        strikeLevelSRSD: true,
      },
    });

    res.json({ success: true, units });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/internal/satellite-data
 *
 * Upsert satellite NDVI data for a plot.
 * Called by CRE when new satellite imagery is processed.
 */
router.post('/satellite-data', async (req, res, next) => {
  try {
    const { plotId, ndvi, ndviMin, ndviMax, ndviStdDev, captureDate, cloudCover, source } = req.body;

    if (!plotId || ndvi === undefined || !captureDate) {
      return res.status(400).json({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'plotId, ndvi, and captureDate are required' },
      });
    }

    const result = await prisma.satelliteData.upsert({
      where: {
        plotId_captureDate_source: {
          plotId,
          captureDate: new Date(captureDate),
          source: source || 'SENTINEL2',
        },
      },
      update: { ndvi, ndviMin, ndviMax, ndviStdDev, cloudCover },
      create: {
        plotId,
        ndvi,
        ndviMin,
        ndviMax,
        ndviStdDev,
        captureDate: new Date(captureDate),
        cloudCover,
        source: source || 'SENTINEL2',
      },
    });

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

export const internalRouter = router;
