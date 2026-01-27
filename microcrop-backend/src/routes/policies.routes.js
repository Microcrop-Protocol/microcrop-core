import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { loadOrganization } from '../middleware/organization.middleware.js';
import { authorize } from '../middleware/authorize.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { quoteSchema, purchaseSchema } from '../validators/policy.validator.js';
import { cancelPolicySchema } from '../validators/staff.validator.js';
import { policiesController } from '../controllers/policies.controller.js';

const router = Router();

router.use(authenticate, loadOrganization);

router.post('/quote', validate(quoteSchema), policiesController.quote);
router.post('/purchase', authorize('ORG_ADMIN', 'ORG_STAFF'), validate(purchaseSchema), policiesController.purchase);
router.get('/', policiesController.list);
router.get('/:policyId', policiesController.getById);
router.get('/:policyId/status', policiesController.getStatus);
router.put('/:policyId/activate', authorize('ORG_ADMIN'), policiesController.activate);
router.post('/:policyId/cancel', authorize('ORG_ADMIN'), validate(cancelPolicySchema), policiesController.cancel);
router.post('/expire-check', authorize('PLATFORM_ADMIN'), policiesController.expireCheck);

export const policiesRouter = router;
