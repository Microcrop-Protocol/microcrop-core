# MicroCrop Backend

B2B parametric crop insurance infrastructure backend. Enables agricultural cooperatives, NGOs, and microfinance institutions to offer white-labeled crop insurance products to smallholder farmers in Kenya.

## Overview

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           MicroCrop Architecture                                 │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│   ┌──────────────┐     ┌──────────────┐     ┌──────────────────────────────┐   │
│   │   Frontend   │     │   USSD       │     │   Partner Integrations       │   │
│   │   (Web App)  │     │   Gateway    │     │   (APIs, Webhooks)           │   │
│   └──────┬───────┘     └──────┬───────┘     └──────────────┬───────────────┘   │
│          │                    │                            │                    │
│          └────────────────────┼────────────────────────────┘                    │
│                               ▼                                                  │
│                    ┌─────────────────────┐                                      │
│                    │   MicroCrop Backend │                                      │
│                    │   (Express.js API)  │                                      │
│                    └──────────┬──────────┘                                      │
│                               │                                                  │
│          ┌────────────────────┼────────────────────┐                            │
│          │                    │                    │                            │
│          ▼                    ▼                    ▼                            │
│   ┌─────────────┐     ┌─────────────┐     ┌─────────────────────┐              │
│   │  PostgreSQL │     │    Redis    │     │   Blockchain        │              │
│   │  (Prisma)   │     │   (Bull)    │     │   (Base Sepolia)    │              │
│   └─────────────┘     └─────────────┘     └──────────┬──────────┘              │
│                                                       │                         │
│                    ┌──────────────────────────────────┼─────────────────┐       │
│                    │                                  │                 │       │
│                    ▼                                  ▼                 ▼       │
│             ┌─────────────┐                   ┌─────────────┐   ┌────────────┐ │
│             │ RiskPool    │                   │  Payout     │   │  Chainlink │ │
│             │ Factory     │                   │  Receiver   │   │  CRE       │ │
│             └─────────────┘                   └─────────────┘   └────────────┘ │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

## Features

### Multi-Tenant B2B Platform
- **Organization Management**: Onboard cooperatives, NGOs, MFIs with KYB verification
- **White-Labeling**: Custom branding, USSD short codes per organization
- **Role-Based Access**: Platform admins, Org admins, Staff, Farmers

### Insurance Operations
- **Policy Creation**: Parametric policies linked to plots and crops
- **Premium Collection**: M-Pesa payments via Pretium (primary) or Swypt (fallback)
- **Automated Payouts**: Triggered by Chainlink CRE damage assessments

### Blockchain Integration
- **Risk Pool Factory**: Deploy dedicated USDC pools per organization
- **Policy Manager**: On-chain policy records and status
- **Payout Receiver**: Receive damage reports from Chainlink CRE

### Payment Providers
- **Pretium** (Primary): Lower fees, direct M-Pesa integration
- **Swypt** (Fallback): Contract-based escrow for USDC ↔ KES

## Tech Stack

| Component | Technology |
|-----------|------------|
| Runtime | Node.js (ES Modules) |
| Framework | Express.js 5 |
| Database | PostgreSQL + Prisma ORM |
| Queue | Bull + Redis |
| Blockchain | ethers.js v6 |
| Auth | JWT (Access + Refresh tokens) |
| Validation | Joi |
| Logging | Winston |

## Project Structure

```
microcrop-backend/
├── prisma/
│   ├── schema.prisma        # Database schema
│   └── seed.js              # Seed data
├── src/
│   ├── app.js               # Express app setup
│   ├── index.js             # Entry point
│   ├── config/
│   │   ├── blockchain.js    # Wallet & provider setup
│   │   ├── database.js      # Prisma client
│   │   ├── env.js           # Environment variables
│   │   └── redis.js         # Redis client
│   ├── blockchain/
│   │   ├── listeners/       # Event listeners
│   │   │   ├── policy.listener.js
│   │   │   └── payout.listener.js
│   │   ├── readers/         # Read-only contract calls
│   │   └── writers/         # Write contract calls
│   │       ├── policy.writer.js
│   │       ├── pretium.writer.js
│   │       └── swypt.writer.js
│   ├── controllers/         # Route handlers
│   ├── middleware/
│   │   ├── auth.middleware.js
│   │   ├── organization.middleware.js
│   │   └── validate.middleware.js
│   ├── routes/              # API routes
│   ├── services/            # Business logic
│   │   ├── payment-provider.service.js
│   │   ├── pretium.service.js
│   │   ├── swypt.service.js
│   │   └── ...
│   ├── utils/
│   │   ├── constants.js
│   │   ├── errors.js
│   │   └── logger.js
│   ├── validators/          # Joi schemas
│   └── workers/
│       ├── payout.worker.js
│       └── notification.worker.js
├── abis/                    # Contract ABIs
├── tests/
├── .env
├── .env.example
└── package.json
```

## Prerequisites

- Node.js 18+
- PostgreSQL 14+
- Redis 6+
- Docker (optional, for local services)

## Installation

```bash
# Clone repository
git clone https://github.com/your-org/microcrop-backend.git
cd microcrop-backend

# Install dependencies
npm install

# Setup environment
cp .env.example .env
# Edit .env with your values

# Start PostgreSQL & Redis (Docker)
docker-compose up -d

# Run database migrations
npx prisma migrate dev

# Generate Prisma client
npx prisma generate

# (Optional) Seed database
npx prisma db seed

# Start development server
npm run dev
```

## Configuration

### Environment Variables

```bash
# Application
NODE_ENV=development
PORT=3000
BACKEND_URL=http://localhost:3000

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/microcrop

# Redis
REDIS_URL=redis://localhost:6379

# JWT Secrets
JWT_SECRET=your-jwt-secret-min-32-chars
JWT_REFRESH_SECRET=your-refresh-secret-min-32-chars

# Blockchain
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
PRIVATE_KEY=0x_your_private_key

# Contract Addresses (Base Sepolia)
CONTRACT_RISK_POOL_FACTORY_DEV=0xf68AC35ee87783437D77b7B19F824e76e95f73B9
CONTRACT_PLATFORM_TREASURY_DEV=0x6B04966167C74e577D9d750BE1055Fa4d25C270c
CONTRACT_POLICY_MANAGER_DEV=0xDb6A11f23b8e357C0505359da4B3448d8EE5291C
CONTRACT_PAYOUT_RECEIVER_DEV=0x1151621ed6A9830E36fd6b55878a775c824fabd0
CONTRACT_USDC_DEV=0x036CbD53842c5426634e7929541eC2318f3dCF7e
BACKEND_WALLET=0xC5867D3b114f10356bAAb7b77E04783cfA947c44

# Payment Providers
PRIMARY_PAYMENT_PROVIDER=pretium

# Pretium (Primary)
PRETIUM_API_URL=https://api.xwift.africa
PRETIUM_API_KEY=your_pretium_consumer_key
PRETIUM_ENABLED=true

# Swypt (Fallback)
SWYPT_API_URL=https://pool.swypt.io/api
SWYPT_API_KEY=your_swypt_api_key
SWYPT_API_SECRET=your_swypt_secret
SWYPT_PROJECT_NAME=microcrop
SWYPT_CONTRACT_ADDRESS=0x_swypt_contract
SWYPT_ENABLED=true

# Internal API (for CRE)
INTERNAL_API_KEY=your_internal_api_key

# WeatherXM (optional)
WEATHERXM_API_KEY=your_weatherxm_key
WEATHERXM_API_URL=https://pro.weatherxm.com/api/v1
```

## API Overview

### Authentication
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/register` | POST | Register new user |
| `/api/auth/login` | POST | Login, get tokens |
| `/api/auth/refresh` | POST | Refresh access token |
| `/api/auth/logout` | POST | Logout, invalidate tokens |

### Organizations
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/organizations` | GET | List organizations |
| `/api/organizations/:id` | GET | Get organization details |
| `/api/organizations/:id/deploy-pool` | POST | Deploy risk pool |

### Farmers
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/farmers` | GET | List farmers (org-scoped) |
| `/api/farmers` | POST | Register farmer |
| `/api/farmers/:id` | GET | Get farmer details |
| `/api/farmers/:id/kyc` | PUT | Update KYC status |

### Plots
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/plots` | GET | List plots (org-scoped) |
| `/api/plots` | POST | Register plot |
| `/api/plots/:id` | GET | Get plot details |

### Policies
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/policies` | GET | List policies (org-scoped) |
| `/api/policies` | POST | Create policy |
| `/api/policies/:id` | GET | Get policy details |
| `/api/policies/:id/pay` | POST | Initiate premium payment |
| `/api/policies/:id/cancel` | POST | Cancel policy |

### Payments
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/payments/quote` | POST | Get conversion quote |
| `/api/payments/initiate` | POST | Initiate M-Pesa payment |
| `/api/payments/:reference/status` | GET | Check payment status |

### Payouts
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/payouts` | GET | List payouts (org-scoped) |
| `/api/payouts/:id` | GET | Get payout details |

### Dashboards
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/dashboard/org/stats` | GET | Organization statistics |
| `/api/dashboard/org/farmers` | GET | Farmer analytics |
| `/api/dashboard/platform/stats` | GET | Platform-wide stats |
| `/api/dashboard/platform/organizations` | GET | All organizations |

### Internal (CRE)
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/internal/active-policies` | GET | Active policies for CRE |
| `/api/internal/policies/expire-check` | POST | Expire overdue policies |

### Webhooks
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/webhooks/pretium/onramp` | POST | Pretium payment callback |
| `/api/webhooks/pretium/offramp` | POST | Pretium payout callback |
| `/api/webhooks/swypt` | POST | Swypt payment callback |

### USSD
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/ussd` | POST | Africa's Talking USSD callback |

## Payment Flows

### Premium Collection (Onramp: KES → USDC)

```
1. Farmer initiates payment via app/USSD
2. Backend calls Pretium API → STK push to phone
3. Farmer enters M-Pesa PIN
4. Pretium converts KES → USDC
5. USDC sent to organization's Risk Pool
6. Backend receives webhook confirmation
7. Policy created on-chain via RiskPool.createPolicy()
8. Policy status → ACTIVE
```

### Payout (Offramp: USDC → KES)

```
1. Chainlink CRE detects damage ≥ 30%
2. CRE submits report to PayoutReceiver contract
3. Backend listener creates Payout record
4. Payout worker processes job:
   a. Transfer USDC to Pretium settlement wallet
   b. Call Pretium offramp API
   c. Farmer receives M-Pesa payment
5. Payout status → COMPLETED
```

## Database Schema

### Core Models

| Model | Description |
|-------|-------------|
| `Organization` | B2B tenant (cooperative, NGO, MFI) |
| `User` | Platform/org admins and staff |
| `Farmer` | Insured farmers (org-scoped) |
| `Plot` | Farm plots with GPS coordinates |
| `Policy` | Insurance policies |
| `Payout` | Claim payouts |
| `Transaction` | Financial transactions |

### Supporting Models

| Model | Description |
|-------|-------------|
| `DamageAssessment` | CRE damage reports |
| `PlatformFee` | Fee tracking for analytics |
| `WeatherEvent` | Historical weather data |
| `SatelliteData` | NDVI/satellite readings |
| `USSDSession` | USSD session state |

### KYB/Onboarding

| Model | Description |
|-------|-------------|
| `OrganizationApplication` | New org applications |
| `KYBVerification` | Verification status |
| `KYBDocument` | Uploaded documents |
| `OrgAdminInvitation` | Admin invitations |

## Background Workers

### Payout Worker (`payout.worker.js`)
Processes payout jobs from the Bull queue:
- Fetches offramp quote
- Transfers USDC to payment provider
- Initiates M-Pesa disbursement
- Polls for completion
- Updates payout status

### Notification Worker (`notification.worker.js`)
Sends SMS notifications via Africa's Talking:
- Payment confirmations
- Payout notifications
- Policy status updates

## Blockchain Integration

### Event Listeners

**Policy Listener** (`policy.listener.js`)
- Listens for `PolicyCreated` events from RiskPool contracts
- Syncs on-chain policy IDs to database

**Payout Listener** (`payout.listener.js`)
- Listens for `DamageReportReceived` events from PayoutReceiver
- Creates payout records when damage ≥ threshold

### Contract Writers

**Policy Writer** (`policy.writer.js`)
- `createPolicyOnChain()`: Create policy in RiskPool

**Pretium Writer** (`pretium.writer.js`)
- `transferToSettlementWallet()`: USDC transfer for offramp

**Swypt Writer** (`swypt.writer.js`)
- `withdrawToEscrow()`: USDC to Swypt escrow contract

## Scripts

```bash
# Development
npm run dev              # Start with hot reload

# Production
npm start                # Start server

# Database
npm run prisma:generate  # Generate Prisma client
npm run prisma:migrate   # Run migrations
npm run prisma:seed      # Seed database
npm run prisma:studio    # Open Prisma Studio

# Testing
npm test                 # Run tests

# Linting
npm run lint             # ESLint check
```

## Docker

```bash
# Start PostgreSQL and Redis
docker-compose up -d

# Stop services
docker-compose down

# View logs
docker-compose logs -f
```

`docker-compose.yml`:
```yaml
version: '3.8'
services:
  postgres:
    image: postgres:14
    environment:
      POSTGRES_USER: microcrop
      POSTGRES_PASSWORD: microcrop
      POSTGRES_DB: microcrop
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:6-alpine
    ports:
      - "6379:6379"

volumes:
  postgres_data:
```

## Testing

```bash
# Run all tests
npm test

# Run specific test file
npm test -- tests/auth.test.js

# Run with coverage
npm test -- --coverage
```

## Logging

Logs are written to `logs/` directory:
- `combined.log` - All logs
- `error.log` - Error logs only
- Console output in development

Log levels: `error`, `warn`, `info`, `http`, `debug`

## Error Handling

Custom error classes in `src/utils/errors.js`:

| Error | Status | Description |
|-------|--------|-------------|
| `ValidationError` | 400 | Invalid input |
| `UnauthorizedError` | 401 | Authentication failed |
| `ForbiddenError` | 403 | Permission denied |
| `NotFoundError` | 404 | Resource not found |
| `ConflictError` | 409 | Duplicate resource |
| `PaymentError` | 402 | Payment failed |
| `BlockchainError` | 500 | On-chain operation failed |

## Security

- **Authentication**: JWT with short-lived access tokens (15m) and refresh tokens (7d)
- **Password Hashing**: bcrypt with salt rounds
- **Rate Limiting**: Per-IP and per-API-key limits
- **Helmet**: Security headers
- **CORS**: Configured per environment
- **Input Validation**: Joi schemas for all inputs
- **SQL Injection**: Prevented by Prisma ORM

## Monitoring

### Health Check
```
GET /health
```
Returns:
```json
{
  "status": "ok",
  "timestamp": "2024-01-30T12:00:00.000Z"
}
```

### Metrics (Future)
- Request latency
- Error rates
- Queue depths
- Blockchain sync status

## Deployment

### Environment Setup
1. Set `NODE_ENV=production`
2. Use production database URL
3. Configure real payment provider API keys
4. Set secure JWT secrets
5. Configure CORS for frontend domain

### Process Manager
```bash
# Using PM2
pm2 start src/index.js --name microcrop-backend
pm2 save
pm2 startup
```

### Reverse Proxy (Nginx)
```nginx
server {
    listen 80;
    server_name api.microcrop.io;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## API Documentation

Full API documentation available at:
- `API_DOCUMENTATION.md` - Complete endpoint reference
- `FRONTEND_PROMPT.md` - Frontend integration guide

## Related Projects

- **microcrop-cre** - Chainlink CRE damage assessment workflow
- **microcrop-contracts** - Smart contracts (RiskPool, PolicyManager, PayoutReceiver)
- **microcrop-frontend** - Web application

## License

Proprietary - MicroCrop Protocol

## Support

For issues and feature requests, contact the development team.
