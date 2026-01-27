import { Router } from 'express';
import { ussdLimiter } from '../middleware/rateLimit.middleware.js';
import { ussdController } from '../controllers/ussd.controller.js';

const router = Router();

router.post('/', ussdLimiter, ussdController.handleUssd);

export const ussdRouter = router;
