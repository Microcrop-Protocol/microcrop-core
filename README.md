# MicroCrop

**Parametric Crop Insurance Infrastructure for Africa**

MicroCrop is a B2B platform that enables agricultural cooperatives, NGOs, microfinance institutions, and insurance companies to offer white-labeled parametric crop insurance products to smallholder farmers. Built on Base L2 with Chainlink oracles for automated damage assessment and M-Pesa integration for seamless payments.

---

## The Problem

Smallholder farmers in Africa face significant climate risks but lack access to affordable crop insurance:
- **70%** of Africa's food is produced by smallholder farmers
- **Less than 3%** have access to crop insurance
- Traditional insurance is too expensive and slow to process claims
- Manual damage assessment is costly and prone to fraud

## The Solution

MicroCrop provides infrastructure for **parametric insurance** - policies that automatically pay out based on objective weather and satellite data, not manual claims:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│   🌾 Farmer                    🏢 Partner Org                 🌐 MicroCrop   │
│   (via M-Pesa/USSD)           (Cooperative/NGO/MFI)          (Platform)     │
│                                                                             │
│   ┌─────────────┐             ┌─────────────────┐          ┌─────────────┐ │
│   │ Pay Premium │────────────▶│ Branded Portal  │─────────▶│  Backend    │ │
│   │ via M-Pesa  │             │ White-labeled   │          │  API        │ │
│   └─────────────┘             └─────────────────┘          └──────┬──────┘ │
│                                                                    │        │
│                                                                    ▼        │
│   ┌─────────────┐             ┌─────────────────┐          ┌─────────────┐ │
│   │  Receive    │◀────────────│   Risk Pool     │◀─────────│  Chainlink  │ │
│   │  Payout     │   M-Pesa    │   (USDC)        │  Damage  │  CRE        │ │
│   └─────────────┘             └─────────────────┘  Report  └─────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Key Features

### For Partner Organizations
- **White-Label Solution**: Custom branding, dedicated USSD short codes
- **Dedicated Risk Pools**: Separate USDC liquidity pools per organization
- **Dashboard Analytics**: Real-time metrics on policies, payouts, farmers
- **API Integration**: Embed insurance into existing apps and services

### For Farmers
- **No Smartphone Required**: Full USSD support for feature phones
- **M-Pesa Payments**: Pay premiums and receive payouts via mobile money
- **Automatic Payouts**: No claim forms - damage triggers instant payment
- **Affordable Coverage**: Starting from KES 500 (~$4) per season

### Technical Highlights
- **Blockchain**: Base L2 for low-cost, fast transactions
- **Oracles**: Chainlink CRE for tamper-proof damage assessment
- **Data Sources**: WeatherXM + Sentinel Hub satellite imagery
- **Payments**: Pretium/Swypt for fiat on/off-ramp

---

## Repository Structure

```
microcrop-core/
├── README.md                    # This file
├── microcrop-backend/           # Node.js API server
│   ├── src/
│   │   ├── blockchain/          # Contract interactions
│   │   ├── controllers/         # Route handlers
│   │   ├── services/            # Business logic
│   │   └── workers/             # Background jobs
│   ├── prisma/                  # Database schema
│   └── README.md                # Backend documentation
├── microcrop-cre/               # Chainlink Runtime Environment
│   └── my-project/
│       ├── crop/                # Damage assessment workflow
│       │   ├── main.ts          # Workflow logic
│       │   └── README.md        # CRE documentation
│       └── secrets.yaml         # Secret mappings
└── instructions/                # Architecture & design docs
    ├── ARCHITECTURE_V2.md
    ├── API_SPEC_V2.md
    ├── DATABASE_V2.md
    └── DEVELOPMENT_GUIDE.md
```

---

## Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL 14+
- Redis 6+
- Bun runtime (for CRE)
- CRE CLI (`npm install -g @chainlink/cre-cli`)

### 1. Clone Repository

```bash
git clone https://github.com/your-org/microcrop-core.git
cd microcrop-core
```

### 2. Setup Backend

```bash
cd microcrop-backend

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your values

# Start database
docker-compose up -d

# Run migrations
npx prisma migrate dev

# Start server
npm run dev
```

### 3. Setup CRE (Chainlink)

```bash
cd microcrop-cre/my-project/crop

# Install dependencies
bun install

# Configure secrets in ../.env

# Run simulation
cd ..
cre workflow simulate ./crop --target=staging-settings
```

---

## Architecture

### System Components

| Component | Description | Technology |
|-----------|-------------|------------|
| **Backend API** | REST API for all operations | Node.js, Express, Prisma |
| **CRE Workflow** | Automated damage assessment | Chainlink CRE, TypeScript |
| **Risk Pools** | Per-organization USDC pools | Solidity, Base L2 |
| **Payment Bridge** | M-Pesa ↔ USDC conversion | Pretium, Swypt |

### Smart Contracts (Base Sepolia)

| Contract | Address | Purpose |
|----------|---------|---------|
| RiskPoolFactory | `0xf68AC35ee87783437D77b7B19F824e76e95f73B9` | Deploy org pools |
| PolicyManager | `0xDb6A11f23b8e357C0505359da4B3448d8EE5291C` | Policy registry |
| PayoutReceiver | `0x1151621ed6A9830E36fd6b55878a775c824fabd0` | CRE damage reports |
| PlatformTreasury | `0x6B04966167C74e577D9d750BE1055Fa4d25C270c` | Fee collection |
| USDC | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` | Payment token |

### Data Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         PREMIUM COLLECTION                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Farmer ──▶ M-Pesa ──▶ Pretium API ──▶ USDC ──▶ Risk Pool              │
│                              │                                           │
│                              ▼                                           │
│                    Backend creates policy on-chain                       │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                         DAMAGE ASSESSMENT                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  WeatherXM ───┐                                                          │
│               ├──▶ Chainlink CRE ──▶ PayoutReceiver ──▶ Backend         │
│  Sentinel ────┘     (DON nodes)       (on-chain)        (listener)      │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                           PAYOUT                                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Backend ──▶ USDC Transfer ──▶ Pretium ──▶ M-Pesa ──▶ Farmer            │
│  (worker)    (to settlement)    (offramp)                                │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Damage Assessment

The Chainlink CRE workflow runs daily and combines two data sources:

### Weather Data (60% weight)
- **Source**: WeatherXM Pro API
- **Metrics**: Temperature, precipitation, humidity, wind
- **Triggers**: Extreme heat/cold, flooding, drought conditions

### Satellite Data (40% weight)
- **Source**: Copernicus Sentinel Hub
- **Metric**: NDVI (Normalized Difference Vegetation Index)
- **Triggers**: Vegetation stress, crop health decline

### Payout Calculation
```
Combined Damage = (0.6 × Weather Damage) + (0.4 × Satellite Damage)

If Combined Damage ≥ 30%:
    Payout = Sum Insured × (Damage % / 100)
```

---

## Payment Integration

### Supported Providers

| Provider | Type | Use Case |
|----------|------|----------|
| **Pretium** (Primary) | API | Lower fees, direct M-Pesa |
| **Swypt** (Fallback) | Contract | Escrow-based, backup |

### Flow Summary

**Onramp (Premium Payment)**
```
KES (M-Pesa) → Pretium → USDC → Risk Pool
```

**Offramp (Payout)**
```
Risk Pool → USDC → Pretium Settlement → KES (M-Pesa)
```

---

## Environment Setup

### Backend `.env`

```bash
# Core
NODE_ENV=development
DATABASE_URL=postgresql://user:pass@localhost:5432/microcrop
REDIS_URL=redis://localhost:6379

# Blockchain
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
PRIVATE_KEY=0x...
BACKEND_WALLET=0x...

# Payments
PRETIUM_API_URL=https://api.xwift.africa
PRETIUM_API_KEY=your_consumer_key
SWYPT_API_URL=https://pool.swypt.io/api
SWYPT_API_KEY=your_key

# CRE Integration
INTERNAL_API_KEY=your_internal_key
```

### CRE `.env`

```bash
CRE_ETH_PRIVATE_KEY=your_key
SENTINEL_CLIENT_ID_ALL=your_id
SENTINEL_CLIENT_SECRET_ALL=your_secret
WEATHERXM_API_KEY_ALL=your_key
BACKEND_API_KEY_ALL=your_internal_key
```

---

## Development

### Running Locally

```bash
# Terminal 1: Backend
cd microcrop-backend
npm run dev

# Terminal 2: Database UI
cd microcrop-backend
npx prisma studio

# Terminal 3: CRE Simulation
cd microcrop-cre/my-project
cre workflow simulate ./crop --target=staging-settings
```

### Testing

```bash
# Backend tests
cd microcrop-backend
npm test

# CRE simulation
cd microcrop-cre/my-project
cre workflow simulate ./crop --target=staging-settings
```

---

## Deployment

### Backend
1. Set `NODE_ENV=production`
2. Configure production database
3. Set real API keys (Pretium, Swypt)
4. Deploy to cloud (Railway, Render, AWS)
5. Setup reverse proxy (Nginx)

### CRE Workflow
1. Request DON access at https://cre.chain.link/request-access
2. Deploy workflow: `cre workflow deploy ./crop --target=production-settings`
3. Configure PayoutReceiver with Keystone Forwarder and Workflow ID

### Smart Contracts
Contracts are already deployed on Base Sepolia. For mainnet:
1. Deploy via Foundry/Hardhat
2. Update contract addresses in backend `.env`
3. Grant roles to backend wallet

---

## Documentation

| Document | Description |
|----------|-------------|
| [Backend README](./microcrop-backend/README.md) | API server documentation |
| [CRE README](./microcrop-cre/my-project/crop/README.md) | Chainlink workflow docs |
| [API Documentation](./microcrop-backend/API_DOCUMENTATION.md) | Full API reference |
| [Architecture](./instructions/ARCHITECTURE_V2.md) | System design |
| [Database Schema](./instructions/DATABASE_V2.md) | Data models |

---

## Roadmap

### Phase 1: MVP (Current)
- [x] Backend API
- [x] Pretium/Swypt payment integration
- [x] Chainlink CRE workflow
- [x] Base Sepolia deployment
- [ ] DON deployment (awaiting access)

### Phase 2: Launch
- [ ] Base Mainnet deployment
- [ ] Production CRE workflow
- [ ] Partner onboarding portal
- [ ] USSD integration

### Phase 3: Scale
- [ ] Additional crops and regions
- [ ] Multi-country support
- [ ] Advanced analytics
- [ ] Mobile app

---

## Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

---

## License

Proprietary - MicroCrop Protocol

---

## Contact

- **Website**: https://microcrop.io
- **Email**: dev@microcrop.io
- **Twitter**: @MicroCropHQ

---

<p align="center">
  <b>Protecting Africa's Farmers, One Policy at a Time</b>
</p>
