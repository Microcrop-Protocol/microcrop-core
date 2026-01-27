import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { loadOrganization } from '../middleware/organization.middleware.js';
import { paymentLimiter } from '../middleware/rateLimit.middleware.js';
import { paymentsController } from '../controllers/payments.controller.js';

const router = Router();

router.post('/quote', authenticate, loadOrganization, paymentsController.getQuote);
router.post('/initiate', authenticate, loadOrganization, paymentLimiter, paymentsController.initiate);
router.get('/status/:reference', authenticate, loadOrganization, paymentsController.checkStatus);
router.post('/callback', paymentsController.callback);

export const paymentsRouter = router;
