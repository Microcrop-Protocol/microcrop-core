import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { loadOrganization } from '../middleware/organization.middleware.js';
import { authorize } from '../middleware/authorize.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { inviteSchema, roleChangeSchema } from '../validators/staff.validator.js';
import { staffController } from '../controllers/staff.controller.js';

const router = Router();

router.use(authenticate, loadOrganization, authorize('ORG_ADMIN'));

router.get('/', staffController.list);
router.post('/invite', validate(inviteSchema), staffController.invite);
router.put('/:userId/role', validate(roleChangeSchema), staffController.changeRole);
router.put('/:userId/deactivate', staffController.deactivate);
router.put('/:userId/reactivate', staffController.reactivate);

export const staffRouter = router;
