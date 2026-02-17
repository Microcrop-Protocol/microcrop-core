# Pool & Liquidity Management API

This document describes the API endpoints for managing risk pools and liquidity.

## Overview

MicroCrop uses a **pool-per-organization** model where each insurance company/cooperative has their own dedicated risk pool that holds USDC liquidity for paying out claims.

### Pool Types



| Type | Description | Who Can Deposit |
|------|-------------|-----------------|
| **PRIVATE** | For insurance companies | Whitelisted depositors only |
| **PUBLIC** | Open pools | Anyone |
| **MUTUAL** | For cooperatives | Members with fixed contributions |

---

## Organization Pool Endpoints

These endpoints allow organizations to manage their own risk pool.

### Get Pool Status

```http
GET /api/organizations/me/pool
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "poolAddress": "0x1234...",
    "poolValue": "100000.00",
    "totalSupply": "100000.00",
    "tokenPrice": "1.00",
    "totalPremiums": "5000.00",
    "totalPayouts": "2000.00",
    "activeExposure": "50000.00",
    "minDeposit": "100.00",
    "maxDeposit": "1000000.00",
    "targetCapital": "100000.00",
    "maxCapital": "200000.00",
    "depositsOpen": true,
    "withdrawalsOpen": true,
    "paused": false,
    "utilizationRate": 50.0
  }
}
```

### Get Pool Details (On-Chain)

```http
GET /api/organizations/me/pool/details
Authorization: Bearer <token>
```

Returns full on-chain pool configuration and summary.

### Get Investor Info

```http
GET /api/organizations/me/pool/investor/:investorAddress
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "deposited": "10000.00",
    "tokensHeld": "10000.00",
    "currentValue": "10500.00",
    "roi": 5.0
  }
}
```

### Deposit Liquidity (Add USDC)

```http
POST /api/organizations/me/pool/deposit
Authorization: Bearer <token>
Content-Type: application/json

{
  "amount": 10000,
  "minTokensOut": 0
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "txHash": "0xabc...",
    "blockNumber": 12345678,
    "tokensMinted": "10000.00",
    "tokenPrice": "1.00"
  }
}
```

### Withdraw Liquidity (Remove USDC)

```http
POST /api/organizations/me/pool/withdraw
Authorization: Bearer <token>
Content-Type: application/json

{
  "tokenAmount": 5000,
  "minUsdcOut": 0
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "txHash": "0xabc...",
    "blockNumber": 12345678,
    "usdcReceived": "5250.00"
  }
}
```

### Add Depositor to Whitelist

For private pools, only whitelisted addresses can deposit.

```http
POST /api/organizations/me/pool/depositors
Authorization: Bearer <token>
Content-Type: application/json

{
  "depositorAddress": "0x1234..."
}
```

### Remove Depositor from Whitelist

```http
DELETE /api/organizations/me/pool/depositors/:depositorAddress
Authorization: Bearer <token>
```

### Update Pool Settings

```http
PUT /api/organizations/me/pool/settings
Authorization: Bearer <token>
Content-Type: application/json

{
  "depositsOpen": true,
  "withdrawalsOpen": false
}
```

---

## Platform Admin Pool Endpoints

These endpoints are for platform administrators to manage all pools.

### List All Pools

```http
GET /api/platform/pools
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "total": 5,
    "pools": [
      {
        "address": "0x1234...",
        "name": "Kenya Crop Pool",
        "symbol": "KPOOL",
        "poolType": 1,
        "poolValue": "100000.00",
        "utilizationRate": 45.0
      }
    ]
  }
}
```

### Get Pool Counts

```http
GET /api/platform/pools/counts
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "total": 10,
    "public": 2,
    "private": 7,
    "mutual": 1
  }
}
```

### Get Pool by Address

```http
GET /api/platform/pools/address/:poolAddress
Authorization: Bearer <token>
```

### Get Pool Metadata by ID

```http
GET /api/platform/pools/id/:poolId
Authorization: Bearer <token>
```

### Deploy Pool for Organization

```http
POST /api/platform/organizations/:orgId/deploy-pool
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Kenya Crop Insurance Pool",
  "symbol": "KPOOL",
  "poolType": "PRIVATE",
  "coverageType": 4,
  "region": "Kenya",
  "minDeposit": 100,
  "maxDeposit": 1000000,
  "targetCapital": 100000,
  "maxCapital": 200000,
  "poolOwner": "0x1234..."
}
```

**Pool Type Values:**
- `PUBLIC` - Anyone can deposit
- `PRIVATE` - Whitelisted depositors only
- `MUTUAL` - Fixed member contributions

**Coverage Type Values:**
- `0` - DROUGHT
- `1` - FLOOD
- `2` - PEST
- `3` - DISEASE
- `4` - COMPREHENSIVE (default)

### Create Public Pool (Not Tied to Org)

```http
POST /api/platform/pools/public
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Africa Public Pool",
  "symbol": "AFPOOL",
  "coverageType": 4,
  "region": "Africa",
  "targetCapital": 1000000,
  "maxCapital": 5000000
}
```

---

## Platform Treasury Endpoints

### Get Treasury Stats

```http
GET /api/platform/treasury
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "balance": "500000.00",
    "totalPremiums": "100000.00",
    "totalPayouts": "25000.00",
    "accumulatedFees": "5000.00",
    "platformFeePercent": 5,
    "reserveRatio": 150,
    "requiredReserve": "50000.00",
    "availableForPayouts": "450000.00",
    "meetsReserve": true,
    "paused": false
  }
}
```

### Get Treasury Balance

```http
GET /api/platform/treasury/balance
Authorization: Bearer <token>
```

### Check Policy Premium Status

```http
GET /api/platform/treasury/premium/:policyId
Authorization: Bearer <token>
```

### Check Policy Payout Status

```http
GET /api/platform/treasury/payout/:policyId
Authorization: Bearer <token>
```

---

## Insurance Company Onboarding Flow

1. **Platform Admin Registers Organization**
   ```http
   POST /api/platform/organizations/register
   ```

2. **Platform Admin Deploys Pool**
   ```http
   POST /api/platform/organizations/:orgId/deploy-pool
   ```

3. **Insurance Company Deposits Initial Liquidity**
   ```http
   POST /api/organizations/me/pool/deposit
   ```

4. **Insurance Company Monitors Pool**
   ```http
   GET /api/organizations/me/pool
   ```

5. **Insurance Company Withdraws Profits**
   ```http
   POST /api/organizations/me/pool/withdraw
   ```

---

## Pool Lifecycle

```
┌─────────────────────────────────────────────────────────────────┐
│                      POOL LIFECYCLE                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. DEPLOY                                                       │
│     └── Platform Admin deploys pool for organization            │
│         └── Pool created with targetCapital, limits             │
│                                                                  │
│  2. FUND                                                         │
│     └── Insurance company deposits USDC                         │
│         └── Receives LP tokens proportional to deposit          │
│                                                                  │
│  3. OPERATE                                                      │
│     ├── Premiums collected from farmers → Pool                  │
│     ├── Claims assessed → Payouts from Pool                     │
│     └── LP token value increases with premiums, decreases       │
│         with payouts                                             │
│                                                                  │
│  4. WITHDRAW (optional)                                          │
│     └── Insurance company burns LP tokens                       │
│         └── Receives USDC at current token price                │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Error Responses

| Error | Description |
|-------|-------------|
| `Organization not found` | Invalid org ID |
| `Organization does not have a deployed pool` | Pool not yet deployed |
| `Organization already has a deployed pool` | Can't deploy twice |
| `Wallet not configured` | Backend wallet not set |
| `RiskPoolFactory contract not configured` | Contract not initialized |
| `DepositsNotOpen` | Pool not accepting deposits |
| `WithdrawalsNotOpen` | Pool not accepting withdrawals |
| `InsufficientLiquidity` | Not enough funds in pool |
| `BelowMinimumDeposit` | Amount below min deposit |
| `ExceedsMaximumDeposit` | Amount above max deposit |

---

## Smart Contract Addresses (Base Sepolia)

| Contract | Address |
|----------|---------|
| RiskPoolFactory | `0xf68AC35ee87783437D77b7B19F824e76e95f73B9` |
| PolicyManager | `0xDb6A11f23b8e357C0505359da4B3448d8EE5291C` |
| PlatformTreasury | `0x6B04966167C74e577D9d750BE1055Fa4d25C270c` |
| PayoutReceiver | `0x1151621ed6A9830E36fd6b55878a775c824fabd0` |
| USDC | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |
