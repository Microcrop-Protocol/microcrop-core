import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { loadOrganization } from '../middleware/organization.middleware.js';
import { authorize } from '../middleware/authorize.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { createHerdSchema, updateHerdSchema, listHerdsSchema } from '../validators/herd.validator.js';
import { herdsController } from '../controllers/herds.controller.js';

const router = Router();

router.use(authenticate, loadOrganization);

router.post('/', authorize('ORG_ADMIN', 'ORG_STAFF'), validate(createHerdSchema), herdsController.create);
router.get('/', validate(listHerdsSchema, 'query'), herdsController.list);
router.get('/:herdId', herdsController.getById);
router.put('/:herdId', authorize('ORG_ADMIN', 'ORG_STAFF'), validate(updateHerdSchema), herdsController.update);

export const herdsRouter = router;
