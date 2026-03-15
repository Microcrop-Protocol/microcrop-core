import { Router } from 'express';
import Joi from 'joi';
import { authenticate } from '../middleware/auth.middleware.js';
import { loadOrganization } from '../middleware/organization.middleware.js';
import { authorize } from '../middleware/authorize.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { batchRetrySchema } from '../validators/staff.validator.js';
import { payoutsController } from '../controllers/payouts.controller.js';
import manualAssessmentService from '../services/manual-assessment.service.js';
import prisma from '../config/database.js';
import { formatResponse, formatPaginatedResponse, paginate } from '../utils/helpers.js';

const router = Router();

router.use(authenticate, loadOrganization);

router.get('/', async (req, res, next) => {
  try {
    const { page, limit, status, farmerId } = req.query;
    const { skip, take, page: currentPage, limit: currentLimit } = paginate(page, limit);

    const where = { organizationId: req.organization.id };
    if (status) where.status = status;
    if (farmerId) where.farmerId = farmerId;

    const [payouts, total] = await Promise.all([
      prisma.payout.findMany({
        where,
        skip,
        take,
        orderBy: { initiatedAt: 'desc' },
        include: {
          policy: {
            select: {
              policyNumber: true,
              farmer: {
                select: {
                  firstName: true,
                  lastName: true,
                },
              },
            },
          },
        },
      }),
      prisma.payout.count({ where }),
    ]);

    res.status(200).json(formatPaginatedResponse(payouts, total, currentPage, currentLimit));
  } catch (error) {
    next(error);
  }
});

router.get('/reconciliation', payoutsController.getReconciliation);
router.post('/batch-retry', authorize('ORG_ADMIN'), validate(batchRetrySchema), payoutsController.batchRetry);

router.get('/:payoutId', async (req, res, next) => {
  try {
    const payout = await prisma.payout.findFirst({
      where: {
        id: req.params.payoutId,
        organizationId: req.organization.id,
      },
      include: {
        policy: {
          include: {
            farmer: true,
          },
        },
      },
    });

    if (!payout) {
      return res.status(404).json({ success: false, error: { message: 'Payout not found' } });
    }

    res.status(200).json(formatResponse(payout));
  } catch (error) {
    next(error);
  }
});

router.post('/:payoutId/retry', authorize('ORG_ADMIN'), payoutsController.retry);

// ============================================
// MANUAL DAMAGE ASSESSMENT
// ============================================
const manualAssessmentSchema = Joi.object({
  policyId: Joi.string().uuid().required(),
  damagePercent: Joi.number().min(1).max(100).required(),
  reason: Joi.string().max(500).optional(),
});

const bulkAssessmentSchema = Joi.object({
  policyIds: Joi.array().items(Joi.string().uuid()).min(1).max(50).required(),
  damagePercent: Joi.number().min(1).max(100).required(),
  reason: Joi.string().max(500).optional(),
});

router.post(
  '/manual-assessment',
  authorize('ORG_ADMIN'),
  validate(manualAssessmentSchema),
  async (req, res, next) => {
    try {
      const result = await manualAssessmentService.createAssessment({
        policyId: req.body.policyId,
        organizationId: req.organization.id,
        damagePercent: req.body.damagePercent,
        reason: req.body.reason,
      });
      res.status(201).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  '/manual-assessment/bulk',
  authorize('ORG_ADMIN'),
  validate(bulkAssessmentSchema),
  async (req, res, next) => {
    try {
      const result = await manualAssessmentService.createBulkAssessment({
        policyIds: req.body.policyIds,
        organizationId: req.organization.id,
        damagePercent: req.body.damagePercent,
        reason: req.body.reason,
      });
      res.status(201).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }
);

export const payoutsRouter = router;
