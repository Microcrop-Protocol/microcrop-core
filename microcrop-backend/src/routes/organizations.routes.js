import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { loadOrganization } from '../middleware/organization.middleware.js';
import prisma from '../config/database.js';
import { formatResponse } from '../utils/helpers.js';
import organizationService from '../services/organization.service.js';

const router = Router();

router.use(authenticate, loadOrganization);

router.get('/me', async (req, res, next) => {
  try {
    res.status(200).json(formatResponse(req.organization));
  } catch (error) {
    next(error);
  }
});

router.get('/me/stats', async (req, res, next) => {
  try {
    const [farmerCount, policyCount, feeAggregate] = await Promise.all([
      prisma.farmer.count({ where: { organizationId: req.organization.id } }),
      prisma.policy.count({ where: { organizationId: req.organization.id } }),
      prisma.policy.aggregate({
        where: { organizationId: req.organization.id },
        _sum: { platformFee: true },
      }),
    ]);

    const stats = {
      totalFarmers: farmerCount,
      totalPolicies: policyCount,
      totalFees: feeAggregate._sum.platformFee || 0,
    };

    res.status(200).json(formatResponse(stats));
  } catch (error) {
    next(error);
  }
});

router.put('/me/settings', async (req, res, next) => {
  try {
    const { brandColor, webhookUrl, contactPhone } = req.body;
    const updated = await prisma.organization.update({
      where: { id: req.organization.id },
      data: {
        ...(brandColor !== undefined && { brandColor }),
        ...(webhookUrl !== undefined && { webhookUrl }),
        ...(contactPhone !== undefined && { contactPhone }),
      },
    });
    res.status(200).json(formatResponse(updated));
  } catch (error) {
    next(error);
  }
});

router.get('/me/pool', async (req, res, next) => {
  try {
    const result = await organizationService.getPoolStatus(req.organization.id);
    res.status(200).json(formatResponse(result));
  } catch (error) {
    next(error);
  }
});

export const organizationRouter = router;
