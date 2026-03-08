import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { loadOrganization } from '../middleware/organization.middleware.js';
import { authorize } from '../middleware/authorize.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import {
  registerFarmerSchema,
  updateFarmerSchema,
  updateKycSchema,
  listFarmersSchema,
} from '../validators/farmer.validator.js';
import { bulkFarmerSchema, bulkPlotSchema } from '../validators/staff.validator.js';
import { farmersController } from '../controllers/farmers.controller.js';
import herdService from '../services/herd.service.js';
import { formatResponse } from '../utils/helpers.js';

const router = Router();

router.use(authenticate, loadOrganization);

router.post('/register', authorize('ORG_ADMIN', 'ORG_STAFF'), validate(registerFarmerSchema), farmersController.register);
router.get('/', validate(listFarmersSchema, 'query'), farmersController.list);
router.get('/:farmerId', farmersController.getById);
router.put('/:farmerId', validate(updateFarmerSchema), farmersController.update);
router.put('/:farmerId/kyc', authorize('ORG_ADMIN'), validate(updateKycSchema), farmersController.updateKyc);

// Farmer's herds
router.get('/:farmerId/herds', async (req, res, next) => {
  try {
    const result = await herdService.listByFarmer(req.organization.id, req.params.farmerId);
    res.status(200).json(formatResponse(result));
  } catch (error) {
    next(error);
  }
});

router.post('/bulk-import', authorize('ORG_ADMIN'), validate(bulkFarmerSchema), farmersController.bulkImport);
router.post('/bulk-import/plots', authorize('ORG_ADMIN'), validate(bulkPlotSchema), farmersController.bulkImportPlots);

export const farmersRouter = router;
