import { Router } from 'express';
import prisma from '../config/database.js';
import { env } from '../config/env.js';
import logger from '../utils/logger.js';
import { invitationController } from '../controllers/invitation.controller.js';

const router = Router();

// Internal API key authentication middleware
function authenticateInternal(req, res, next) {
  const apiKey = req.headers['x-api-key'];

  if (!env.internalApiKey || !apiKey || apiKey !== env.internalApiKey) {
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
        plot: {
          select: {
            latitude: true,
            longitude: true,
            cropType: true,
          },
        },
      },
    });

    const result = policies.map((p) => ({
      policyId: p.id,
      onChainPolicyId: p.policyId || p.policyNumber,
      plotLatitude: parseFloat(p.plot.latitude),
      plotLongitude: parseFloat(p.plot.longitude),
      cropType: p.plot.cropType,
    }));

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

export const internalRouter = router;
