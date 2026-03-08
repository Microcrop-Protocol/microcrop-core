import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { authorize } from '../middleware/authorize.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { createInsuranceUnitSchema, updateInsuranceUnitSchema, listInsuranceUnitsSchema } from '../validators/insurance-unit.validator.js';
import { insuranceUnitsController } from '../controllers/insurance-units.controller.js';

const router = Router();

// Platform admin only
router.use(authenticate, authorize('PLATFORM_ADMIN'));

router.get('/', validate(listInsuranceUnitsSchema, 'query'), insuranceUnitsController.list);
router.post('/', validate(createInsuranceUnitSchema), insuranceUnitsController.create);
router.get('/:id', insuranceUnitsController.getById);
router.patch('/:id', validate(updateInsuranceUnitSchema), insuranceUnitsController.update);

export const insuranceUnitsRouter = router;
