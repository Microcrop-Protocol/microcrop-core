import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { env } from './config/env.js';
import logger, { stream } from './utils/logger.js';
import { errorHandler } from './middleware/error.middleware.js';
import { apiLimiter } from './middleware/rateLimit.middleware.js';
import prisma from './config/database.js';
import redis from './config/redis.js';
import { provider } from './config/blockchain.js';

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
import { applicationRouter } from './routes/application.routes.js';
import { invitationRouter } from './routes/invitation.routes.js';

const app = express();

// Trust proxy (required behind load balancer for correct IP + rate limiting)
app.set('trust proxy', 1);

// BigInt JSON serialization
BigInt.prototype.toJSON = function () {
  return this.toString();
};

// CORS — restrict to allowed origins in production
const corsOptions = {};
if (env.allowedOrigins) {
  corsOptions.origin = env.allowedOrigins.split(',').map((o) => o.trim());
  corsOptions.credentials = true;
} else if (env.isProd) {
  // Deny all cross-origin requests if ALLOWED_ORIGINS is not configured in production
  corsOptions.origin = false;
  logger.error('ALLOWED_ORIGINS not set in production — CORS will deny all cross-origin requests');
}
app.use(cors(corsOptions));

// Security headers
app.use(
  helmet({
    contentSecurityPolicy: { directives: { defaultSrc: ["'self'"] } },
    hsts: { maxAge: 63072000, includeSubDomains: true, preload: true },
    frameguard: { action: 'deny' },
  })
);

app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Request correlation ID
app.use((req, _res, next) => {
  req.id = req.headers['x-request-id'] || uuidv4();
  next();
});

app.use(morgan('combined', { stream }));
app.use(apiLimiter);

// Static file serving for uploads (in production, use S3/GCS)
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// Liveness probe — is the process alive?
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Readiness probe — can the service handle requests?
app.get('/health/ready', async (_req, res) => {
  const checks = { database: 'unknown', redis: 'unknown', rpc: 'unknown' };

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = 'healthy';
  } catch {
    checks.database = 'unhealthy';
  }

  try {
    await redis.ping();
    checks.redis = 'healthy';
  } catch {
    checks.redis = 'unhealthy';
  }

  try {
    if (provider) {
      await provider.getBlockNumber();
      checks.rpc = 'healthy';
    } else {
      checks.rpc = 'not_configured';
    }
  } catch {
    checks.rpc = 'unhealthy';
  }

  const healthy = checks.database === 'healthy' && checks.redis === 'healthy';
  res.status(healthy ? 200 : 503).json({ ready: healthy, checks, timestamp: new Date().toISOString() });
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
app.use('/api/applications', applicationRouter);
app.use('/api/invitations', invitationRouter);

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
