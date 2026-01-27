import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import { stream } from './utils/logger.js';
import { errorHandler } from './middleware/error.middleware.js';
import { apiLimiter } from './middleware/rateLimit.middleware.js';

// Route imports
import { authRouter } from './routes/auth.routes.js';
import { platformRouter } from './routes/platform.routes.js';
import { organizationRouter } from './routes/organizations.routes.js';
import { farmersRouter } from './routes/farmers.routes.js';
import { plotsRouter } from './routes/plots.routes.js';
import { policiesRouter } from './routes/policies.routes.js';
import { paymentsRouter } from './routes/payments.routes.js';
import { payoutsRouter } from './routes/payouts.routes.js';
import { ussdRouter } from './routes/ussd.routes.js';
import { internalRouter } from './routes/internal.routes.js';
import { staffRouter } from './routes/staff.routes.js';
import { dashboardPlatformRouter } from './routes/dashboard.platform.routes.js';
import { dashboardOrgRouter } from './routes/dashboard.org.routes.js';
import { exportRouter } from './routes/export.routes.js';

const app = express();

// BigInt JSON serialization
BigInt.prototype.toJSON = function () {
  return this.toString();
};

// Global middleware
app.use(helmet());
app.use(cors());
app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('combined', { stream }));
app.use(apiLimiter);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/auth', authRouter);
app.use('/api/platform', platformRouter);
app.use('/api/organizations', organizationRouter);
app.use('/api/farmers', farmersRouter);
app.use('/api/plots', plotsRouter);
app.use('/api/policies', policiesRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/payouts', payoutsRouter);
app.use('/api/ussd', ussdRouter);
app.use('/api/internal', internalRouter);
app.use('/api/staff', staffRouter);
app.use('/api/dashboard/platform', dashboardPlatformRouter);
app.use('/api/dashboard/org', dashboardOrgRouter);
app.use('/api/export', exportRouter);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: 'Endpoint not found' },
  });
});

// Error handler (must be last)
app.use(errorHandler);

export default app;
