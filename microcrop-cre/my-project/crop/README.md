# MicroCrop CRE Workflow

Automated crop damage assessment workflow powered by [Chainlink Runtime Environment (CRE)](https://docs.chain.link/cre). This workflow monitors insured farmland using weather and satellite data, automatically triggering payouts when crop damage is detected.

## Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        MicroCrop CRE Workflow                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌─────────────┐     ┌──────────────┐     ┌─────────────────────────────┐  │
│   │   Cron      │────▶│   Fetch      │────▶│   Fetch Data Sources        │  │
│   │  (Daily)    │     │   Policies   │     │                             │  │
│   └─────────────┘     └──────────────┘     │  ┌─────────┐  ┌──────────┐  │  │
│                              │              │  │WeatherXM│  │ Sentinel │  │  │
│                              ▼              │  │   API   │  │   Hub    │  │  │
│                       ┌──────────────┐     │  └────┬────┘  └────┬─────┘  │  │
│                       │  For Each    │     │       │            │        │  │
│                       │   Policy     │◀────│───────┴────────────┘        │  │
│                       └──────┬───────┘     └─────────────────────────────┘  │
│                              │                                               │
│                              ▼                                               │
│                       ┌──────────────┐                                       │
│                       │  Calculate   │                                       │
│                       │   Damage     │                                       │
│                       │   Score      │                                       │
│                       └──────┬───────┘                                       │
│                              │                                               │
│                              ▼                                               │
│                       ┌──────────────┐     ┌─────────────────────────────┐  │
│                       │  Damage ≥    │ YES │   Submit Report On-Chain    │  │
│                       │  Threshold?  │────▶│   (PayoutReceiver)          │  │
│                       └──────────────┘     └─────────────────────────────┘  │
│                                                          │                   │
└──────────────────────────────────────────────────────────│───────────────────┘
                                                           ▼
                                              ┌─────────────────────────┐
                                              │   Backend Listener      │
                                              │   Creates Payout Job    │
                                              │   → M-Pesa to Farmer    │
                                              └─────────────────────────┘
```

## Features

- **Daily Automated Assessment**: Cron-triggered workflow runs every day at midnight
- **Multi-Source Data**: Combines weather (WeatherXM) and satellite (Sentinel Hub) data
- **Weighted Damage Scoring**: 60% weather + 40% satellite NDVI analysis
- **Threshold-Based Payouts**: Only triggers when damage ≥ 30%
- **DON Consensus**: Multiple nodes must agree on damage assessment
- **On-Chain Reporting**: Cryptographically signed reports to PayoutReceiver contract

## Project Structure

```
microcrop-cre/my-project/
├── .env                    # Secrets (private keys, API keys)
├── project.yaml            # RPC endpoints configuration
├── secrets.yaml            # Secret name mappings
└── crop/
    ├── main.ts             # Workflow logic
    ├── workflow.yaml       # Workflow deployment settings
    ├── config.staging.json # Staging environment config
    ├── config.production.json # Production config
    ├── contracts/
    │   └── abi.ts          # PayoutReceiver ABI
    ├── package.json
    └── tsconfig.json
```

## Prerequisites

- [Bun](https://bun.sh/) runtime
- [CRE CLI](https://docs.chain.link/cre/getting-started/overview) installed
- Access to Chainlink DON (request at https://cre.chain.link/request-access)
- Running MicroCrop backend server

## Installation

```bash
cd microcrop-cre/my-project/crop
bun install
```

## Configuration

### Environment Variables (`.env`)

```bash
# Ethereum private key for signing transactions
CRE_ETH_PRIVATE_KEY=your_private_key_here

# Default deployment target
CRE_TARGET=staging-settings

# Sentinel Hub (Copernicus) - Satellite imagery
SENTINEL_CLIENT_ID_ALL=your_sentinel_client_id
SENTINEL_CLIENT_SECRET_ALL=your_sentinel_client_secret

# WeatherXM - Weather data
WEATHERXM_API_KEY_ALL=your_weatherxm_api_key

# MicroCrop Backend - Active policies API
BACKEND_API_KEY_ALL=your_backend_internal_api_key

# Planet Labs (optional alternative to Sentinel)
PLANET_API_KEY_ALL=your_planet_api_key
```

### Workflow Config (`config.staging.json`)

```json
{
  "schedule": "0 0 * * *",           // Daily at midnight UTC
  "backendApiUrl": "http://localhost:3000",
  "weatherXmApiUrl": "https://pro.weatherxm.com/api/v1",
  "satelliteProvider": "sentinel",    // or "planet"
  "planetApiUrl": "https://api.planet.com/data/v1",
  "sentinelApiUrl": "https://sh.dataspace.copernicus.eu/api/v1",
  "payoutReceiverAddress": "0x1151621ed6A9830E36fd6b55878a775c824fabd0",
  "chainSelectorName": "ethereum-testnet-sepolia-base-1",
  "gasLimit": "500000",
  "damageThreshold": 30,              // Minimum damage % for payout
  "weatherWeight": 0.6,               // 60% weight for weather
  "satelliteWeight": 0.4              // 40% weight for satellite
}
```

## Damage Calculation

### Weather Damage Scoring

| Condition | Damage Points |
|-----------|---------------|
| Temperature < 5°C or > 45°C | +40 |
| Temperature < 10°C or > 40°C | +25 |
| Temperature < 15°C or > 35°C | +10 |
| Precipitation > 100mm/day | +30 |
| Precipitation > 50mm/day | +15 |
| Humidity > 95% | +15 |
| Humidity > 90% | +8 |
| Wind > 80 km/h | +20 |
| Wind > 60 km/h | +10 |

### Satellite Damage Scoring (NDVI)

| NDVI Value | Damage % | Vegetation Health |
|------------|----------|-------------------|
| ≥ 0.7 | 0% | Healthy |
| 0.6 - 0.7 | 10% | Good |
| 0.5 - 0.6 | 25% | Moderate stress |
| 0.4 - 0.5 | 40% | Stressed |
| 0.3 - 0.4 | 60% | Severe stress |
| 0.2 - 0.3 | 80% | Critical |
| < 0.2 | 100% | Dead/Barren |

### Combined Score

```
combinedDamage = (weatherWeight × weatherDamage) + (satelliteWeight × satelliteDamage)
```

Default: `0.6 × weather + 0.4 × satellite`

## Usage

### Local Simulation

Test the workflow locally without deploying to the DON:

```bash
# Make sure backend is running first
cd microcrop-backend && npm run dev

# Run simulation
cd microcrop-cre/my-project
cre workflow simulate ./crop --target=staging-settings
```

Expected output:
```
Workflow compiled
[SIMULATION] Simulator Initialized
[SIMULATION] Running trigger trigger=cron-trigger@1.0.0
[USER LOG] MicroCrop damage assessment workflow triggered.
[USER LOG] Found 5 active policies to assess.
[USER LOG] Policy abc123: weather=25%, satellite=30%, combined=27%
[USER LOG] Policy def456: weather=45%, satellite=50%, combined=47%
[USER LOG] Policy def456: damage 47% >= threshold 30%, submitting report.
...
Workflow Simulation Result: "Assessed 5 policies. Submitted 1 damage reports."
```

### Deploy to DON

After receiving Chainlink DON access:

```bash
# Deploy to staging
cre workflow deploy ./crop --target=staging-settings

# Deploy to production
cre workflow deploy ./crop --target=production-settings
```

The deployment output will provide:
- **Workflow Address**: Address of the deployed workflow
- **Workflow ID**: Unique identifier (bytes10)
- **Keystone Forwarder**: DON's forwarder contract address

### Configure PayoutReceiver Contract

After deployment, configure the PayoutReceiver contract with the CRE values:

```bash
# Set Keystone Forwarder
cast send 0x1151621ed6A9830E36fd6b55878a775c824fabd0 \
  "setKeystoneForwarder(address)" <FORWARDER_ADDRESS> \
  --private-key <ADMIN_KEY> \
  --rpc-url https://sepolia.base.org

# Set Workflow Config
cast send 0x1151621ed6A9830E36fd6b55878a775c824fabd0 \
  "setWorkflowConfig(address,uint256)" <WORKFLOW_ADDRESS> <WORKFLOW_ID> \
  --private-key <ADMIN_KEY> \
  --rpc-url https://sepolia.base.org
```

## Data Sources

### WeatherXM

[WeatherXM](https://weatherxm.com/) provides hyperlocal weather data from a decentralized network of weather stations.

- **API**: `https://pro.weatherxm.com/api/v1`
- **Data**: Temperature, precipitation, humidity, wind speed
- **Coverage**: Global (station-dependent)

### Sentinel Hub (Copernicus)

[Copernicus Sentinel Hub](https://dataspace.copernicus.eu/) provides free satellite imagery from the EU's Earth observation program.

- **API**: `https://sh.dataspace.copernicus.eu/api/v1`
- **Satellite**: Sentinel-2 (10m resolution)
- **Data**: NDVI (Normalized Difference Vegetation Index)
- **Update Frequency**: Every 5 days
- **Coverage**: Global

### Planet Labs (Alternative)

[Planet Labs](https://www.planet.com/) provides commercial high-resolution satellite imagery.

- **API**: `https://api.planet.com/data/v1`
- **Resolution**: 3-5m (PlanetScope)
- **Update Frequency**: Daily
- **Coverage**: Global

## Smart Contract Integration

### PayoutReceiver Contract

The workflow submits damage reports to the `PayoutReceiver` contract at:
- **Base Sepolia**: `0x1151621ed6A9830E36fd6b55878a775c824fabd0`

### Report Structure

```solidity
struct DamageReport {
    uint256 policyId;
    uint256 damagePercentage;    // 0-100
    uint256 weatherDamage;       // 0-100
    uint256 satelliteDamage;     // 0-100
    uint256 payoutAmount;        // Calculated payout in USDC
    uint256 assessedAt;          // Timestamp
}
```

### Events Emitted

```solidity
event DamageReportReceived(
    uint256 indexed policyId,
    uint256 damagePercentage,
    uint256 payoutAmount,
    address indexed farmer
);
```

## Troubleshooting

### Simulation Fails: "connection refused"

The backend server isn't running. Start it first:

```bash
cd microcrop-backend && npm run dev
```

### "No active policies found"

The database has no active policies to assess. Create test policies with:
- `status: 'ACTIVE'`
- `premiumPaid: true`
- Valid `startDate` and `endDate`
- Plot with `latitude` and `longitude`

### Sentinel Hub Authentication Failed

Check your OAuth credentials:

1. Go to https://dataspace.copernicus.eu/
2. Dashboard → User Settings → OAuth Clients
3. Verify client ID and secret in `.env`

### Deployment Blocked: "early access"

CRE deployment requires approval. Submit request at:
https://cre.chain.link/request-access

## API Reference

### Backend Internal API

**GET** `/api/internal/active-policies`

Returns active policies for damage assessment.

**Headers:**
```
x-api-key: <INTERNAL_API_KEY>
```

**Response:**
```json
{
  "success": true,
  "policies": [
    {
      "policyId": "uuid",
      "onChainPolicyId": "123",
      "plotLatitude": -1.2921,
      "plotLongitude": 36.8219,
      "cropType": "maize",
      "sumInsured": 5000,
      "farmerWallet": "0x..."
    }
  ]
}
```

## Development

### Updating the Workflow

1. Edit `main.ts`
2. Test with simulation: `cre workflow simulate ./crop --target=staging-settings`
3. Deploy: `cre workflow deploy ./crop --target=staging-settings`

### Adding New Data Sources

1. Create fetch function in `main.ts`
2. Add consensus aggregation
3. Update damage calculation logic
4. Add secrets to `secrets.yaml` and `.env`

### Changing Damage Thresholds

Edit `config.staging.json` or `config.production.json`:

```json
{
  "damageThreshold": 25,     // Lower threshold = more payouts
  "weatherWeight": 0.5,      // Equal weights
  "satelliteWeight": 0.5
}
```

## Security Considerations

- Private keys in `.env` are never committed to version control
- Secrets are encrypted when uploaded to the DON
- API keys use separate read-only credentials where possible
- Contract interactions are signed by the DON (not individual nodes)

## License

Proprietary - MicroCrop

## Resources

- [Chainlink CRE Documentation](https://docs.chain.link/cre)
- [CRE SDK Reference](https://docs.chain.link/cre/reference/sdk/core-ts)
- [WeatherXM API Docs](https://docs.weatherxm.com/)
- [Sentinel Hub API Docs](https://docs.sentinel-hub.com/)
- [MicroCrop Backend API](../../../microcrop-backend/API.md)
