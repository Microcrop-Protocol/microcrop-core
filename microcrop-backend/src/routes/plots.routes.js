import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { loadOrganization } from '../middleware/organization.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { createPlotSchema, listPlotsSchema } from '../validators/policy.validator.js';
import farmerService from '../services/farmer.service.js';
import { formatResponse, formatPaginatedResponse } from '../utils/helpers.js';

const router = Router();

router.use(authenticate, loadOrganization);

router.post('/', validate(createPlotSchema), async (req, res, next) => {
  try {
    const result = await farmerService.createPlot(req.organization.id, req.body);
    res.status(201).json(formatResponse(result));
  } catch (error) {
    next(error);
  }
});

router.get('/', validate(listPlotsSchema, 'query'), async (req, res, next) => {
  try {
    const result = await farmerService.listPlots(req.organization.id, req.query);
    res.status(200).json(formatPaginatedResponse(result.data, result.total, result.page, result.limit));
  } catch (error) {
    next(error);
  }
});

router.get('/:plotId', async (req, res, next) => {
  try {
    const result = await farmerService.getPlot(req.organization.id, req.params.plotId);
    res.status(200).json(formatResponse(result));
  } catch (error) {
    next(error);
  }
});

export const plotsRouter = router;
