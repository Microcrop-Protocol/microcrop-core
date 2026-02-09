import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { loadOrganization } from '../middleware/organization.middleware.js';
import { paymentLimiter, webhookLimiter } from '../middleware/rateLimit.middleware.js';
import { verifyWebhookSignature } from '../middleware/webhook.middleware.js';
import { paymentsController } from '../controllers/payments.controller.js';

const router = Router();

router.post('/quote', authenticate, loadOrganization, paymentsController.getQuote);
router.post('/initiate', authenticate, loadOrganization, paymentLimiter, paymentsController.initiate);
router.get('/status/:reference', authenticate, loadOrganization, paymentsController.checkStatus);
router.post('/callback', webhookLimiter, verifyWebhookSignature, paymentsController.callback);

export const paymentsRouter = router;
