# MicroCrop Protocol: Technical Whitepaper

**Decentralized Parametric Agricultural Insurance Infrastructure for Africa**

Version 1.0 | March 2026

---

## Table of Contents

1. [Abstract](#1-abstract)
2. [Introduction](#2-introduction)
3. [Protocol Architecture](#3-protocol-architecture)
4. [Oracle and Data Pipeline](#4-oracle-and-data-pipeline)
5. [Risk Model](#5-risk-model)
6. [Tokenomics](#6-tokenomics)
7. [Data Archival (Autonomys Auto Drive)](#7-data-archival-autonomys-auto-drive)
8. [Security](#8-security)
9. [Competitive Analysis](#9-competitive-analysis)
10. [Use Cases](#10-use-cases)
11. [Roadmap](#11-roadmap)
12. [Team](#12-team)
13. [References](#13-references)

---

## 1. Abstract

MicroCrop is a decentralized parametric agricultural insurance protocol built on Base L2 that enables cooperatives, NGOs, microfinance institutions, and insurance companies to offer automated crop and livestock insurance to smallholder farmers across Africa. The protocol combines Chainlink Compute Runtime Environment (CRE) oracles with WeatherXM ground-truth weather stations and Copernicus CDSE Sentinel-2 satellite imagery to create a dual-index damage assessment system that automatically triggers USDC payouts when environmental conditions breach predefined thresholds. Farmers interact entirely through USSD menus on basic feature phones and pay premiums via M-Pesa mobile money, requiring no smartphone, internet connection, or cryptocurrency knowledge. Six UUPS-upgradeable smart contracts on Base manage policy lifecycle, treasury operations, risk pool liquidity, and on-chain damage verification with a 14-point validation pipeline. The protocol supports both per-plot crop insurance with weather and NDVI-based triggers and Index-Based Livestock Insurance (IBLI) covering 10 counties in Kenya's Kenya Livestock Insurance Program (KLIP). Risk pools operate as ERC20 LP token vaults with NAV-based pricing and anti-inflation attack protection, enabling institutional and retail capital providers to earn yield from insurance premiums while underwriting climate risk. MicroCrop closes the $5.4 billion crop insurance protection gap in sub-Saharan Africa by reducing distribution costs, eliminating manual claims processing, and providing transparent, tamper-proof insurance infrastructure accessible to the 80% of African smallholder farmers who currently lack any form of crop coverage.

---

## 2. Introduction

### 2.1 Climate Risk and African Agriculture

Sub-Saharan Africa is ground zero for climate vulnerability in agriculture. The continent's 33 million smallholder farms produce approximately 70% of the region's food supply, yet these farms operate almost entirely without financial protection against climate shocks. Rising temperatures, erratic rainfall patterns, prolonged droughts, and increasingly frequent flood events threaten the livelihoods of over 250 million people who depend directly on rain-fed agriculture.

The World Bank estimates that climate change will push an additional 132 million people into extreme poverty by 2030, with African smallholders bearing a disproportionate share of this burden. A single severe drought can wipe out an entire season's income, triggering cascading effects: children withdrawn from school, productive assets sold at distressed prices, and long-term household poverty traps from which recovery takes years.

For pastoralist communities in Kenya's arid and semi-arid lands (ASALs) -- Turkana, Marsabit, Wajir, Mandera, Garissa, Isiolo, Samburu, Tana River, Baringo, and Laikipia counties -- the situation is even more acute. Livestock losses during drought can exceed 50% of a household's total wealth, and the slow-onset nature of forage degradation means that by the time intervention arrives, irreversible asset depletion has already occurred.

### 2.2 The Crop Insurance Gap

Despite the clear need, less than 3% of African smallholder farmers have access to any form of crop insurance. The World Bank and Munich Re estimate the agricultural insurance protection gap in sub-Saharan Africa at approximately $5.4 billion annually -- the difference between actual economic losses from weather events and insured losses.

This gap persists for structural reasons:

- **High distribution costs**: Traditional insurance requires agent networks, paper documentation, and physical office presence in rural areas. These costs can exceed 40% of premium revenue.
- **Expensive loss assessment**: Sending adjusters to individual farms to verify damage claims is prohibitively costly for small policies. A $20 premium cannot support a $200 field visit.
- **Adverse selection and moral hazard**: Without objective verification, claims-based systems suffer from systematic overreporting, driving up premiums for honest participants.
- **Payment infrastructure**: Rural farmers lack bank accounts. Cash-based premium collection and payout delivery are logistically complex and expensive.
- **Trust deficit**: Farmers who have experienced delayed or denied claims from traditional insurers are reluctant to pay premiums again.

### 2.3 Why Parametric Insurance Is the Solution

Parametric (index-based) insurance resolves these structural barriers by replacing subjective damage claims with objective, measurable triggers:

1. **Automatic triggers**: Payouts are determined by independently verifiable environmental indices (weather data, satellite vegetation indices), not by manual claims or field visits.
2. **Instant settlement**: When a trigger fires, payment is immediate. There is no claims adjustment period.
3. **Low distribution cost**: No agent network needed for claims. USSD-based enrollment reduces distribution to a phone call.
4. **Transparent pricing**: Farmers know in advance exactly what conditions trigger a payout and exactly how much they will receive.
5. **Scalable**: The same satellite and weather data that covers one farm covers thousands of farms in the same region at near-zero marginal cost.

The primary weakness of parametric insurance is basis risk -- the possibility that the index does not perfectly correlate with an individual farmer's actual loss. MicroCrop addresses this through a dual-index approach (weather plus satellite) and per-plot precision, as detailed in Section 5.4.

### 2.4 Why Blockchain Enables It

Blockchain infrastructure addresses the remaining trust and infrastructure gaps that prevent parametric insurance from scaling:

- **Transparent, immutable policy records**: Every policy, premium payment, and payout is recorded on-chain, creating an auditable trail that builds trust with farmers, regulators, and reinsurers.
- **Programmable payouts**: Smart contracts enforce payout rules deterministically. If the damage index exceeds the threshold, payment executes. There is no discretionary denial.
- **Decentralized oracle verification**: Chainlink CRE ensures that damage assessments are computed by multiple independent DON nodes reaching consensus, not by a single potentially biased party.
- **Stablecoin settlement**: USDC eliminates currency volatility risk and enables instant cross-border settlement. M-Pesa on/off-ramps bridge between on-chain USDC and the mobile money that farmers actually use.
- **Composable risk pools**: Tokenized LP positions in ERC20 risk pools enable institutional investors, reinsurers, and DeFi protocols to provide underwriting capital efficiently.
- **Soulbound proof of coverage**: PolicyNFTs provide farmers with verifiable, on-chain proof of insurance that can be presented to lenders, input suppliers, or government programs.

---

## 3. Protocol Architecture

### 3.1 Smart Contracts

MicroCrop deploys six UUPS-upgradeable smart contracts on Base (Coinbase L2), chosen for its low transaction costs (~$0.001 per tx), EVM compatibility, and Coinbase's regulatory alignment in African markets.

All contracts use OpenZeppelin's AccessControlUpgradeable for role-based permissions and ReentrancyGuardUpgradeable for reentrancy protection. Proxy contracts follow the ERC1967 standard.

```
+---------------------------------------------------------------+
|                     CONTRACT ARCHITECTURE                      |
+---------------------------------------------------------------+
|                                                                |
|  +------------------+         +-------------------+            |
|  |  RiskPoolFactory |-------->|    RiskPool(s)    |            |
|  |  (Registry)      |  deploy |    (ERC20 LP)     |            |
|  +------------------+         +-------------------+            |
|         |                        |           |                 |
|         | grants roles           | premium   | payout          |
|         v                        v           v                 |
|  +------------------+     +-------------------+                |
|  | PolicyManager    |<--->|    Treasury        |                |
|  | (Lifecycle)      |     |    (USDC Vault)    |                |
|  +------------------+     +-------------------+                |
|         |                        ^                             |
|         | mint                   | damage report               |
|         v                        |                             |
|  +------------------+     +-------------------+                |
|  |  PolicyNFT       |     | PayoutReceiver    |                |
|  |  (ERC721)        |     | (Oracle Bridge)   |                |
|  +------------------+     +-------------------+                |
|                                  ^                             |
|                                  |                             |
|                          Chainlink CRE DON                     |
|                          (Keystone Forwarder)                  |
+---------------------------------------------------------------+
```

#### 3.1.1 Treasury.sol

The Treasury contract serves as the central USDC vault for the entire protocol. All premium payments flow through Treasury before distribution to risk pools, and all payouts flow from risk pools through Treasury to the backend wallet for M-Pesa disbursement.

**Key Parameters:**

| Parameter | Value | Description |
|---|---|---|
| `platformFeePercent` | 10% (default) | Configurable 0-20% via `setPlatformFee()` |
| `MIN_RESERVE_PERCENT` | 20% | Minimum reserve that must remain in Treasury |
| `TARGET_RESERVE_PERCENT` | Configurable | Target reserve for optimal solvency |

**Roles:**

| Role | Permissions |
|---|---|
| `ADMIN_ROLE` | Set platform fee, set backend wallet, set factory, emergency withdraw |
| `BACKEND_ROLE` | Receive premiums, distribute to pools, request payouts |
| `PAYOUT_ROLE` | Request payouts from Treasury |
| `UPGRADER_ROLE` | Upgrade contract implementation |
| `DEFAULT_ADMIN_ROLE` | Grant and revoke all roles |

**Core Functions:**

- `receivePremium(policyId, amount)`: Accepts USDC premium, deducts platform fee, records net amount. Reverts on duplicate premium via `premiumReceived` mapping.
- `distributePremiumToPool(pool, policyId, grossPremium, distributor)`: Forwards net premium to the designated RiskPool for internal split (LP/builder/protocol/distributor).
- `requestPayout(policyId, amount)`: Transfers USDC from Treasury to backend wallet for M-Pesa disbursement. Enforces reserve requirements. Reverts on duplicate payout via `payoutProcessed` mapping.
- `withdrawFees(recipient)`: Withdraws accumulated platform fees. Admin only.
- `emergencyWithdraw(recipient, amount)`: Circuit breaker for critical situations. Admin only.

**Events emitted:** `PremiumReceived`, `PayoutSent`, `PlatformFeeUpdated`, `FeesWithdrawn`, `EmergencyWithdrawal`, `BackendWalletUpdated`.

#### 3.1.2 PolicyManager.sol

PolicyManager manages the complete lifecycle of insurance policies, enforcing business rules at the contract level.

**Policy States:**

```
PENDING -----> ACTIVE -----> EXPIRED
                 |
                 +----------> CLAIMED
                 |
                 +----------> CANCELLED
```

**Enforced Limits:**

| Constraint | Value |
|---|---|
| Minimum sum insured | $100 USDC (100e6) |
| Maximum sum insured | $1,000,000 USDC (1e12) |
| Minimum duration | 30 days |
| Maximum duration | 365 days |
| Max active policies per farmer | 5 |
| Max claims per farmer per year | 3 |

**Coverage Types (enum):**

```
enum CoverageType { DROUGHT, FLOOD, BOTH, EXCESS_RAIN, COMPREHENSIVE }
```

**Core Functions:**

- `createPolicy(farmer, plotId, sumInsured, premium, durationDays, coverageType)`: Creates a PENDING policy. Validates all limits. Backend role only.
- `activatePolicy(policyId, distributor, distributorName, region, poolAddress)`: Transitions PENDING to ACTIVE. Mints PolicyNFT. Records pool assignment for exposure tracking. Backend role only.
- `expirePolicy(policyId)`: Transitions ACTIVE to EXPIRED when `block.timestamp > endDate`. Backend role only.
- `markAsClaimed(policyId)`: Transitions ACTIVE to CLAIMED after payout. Oracle role only.
- `cancelPolicy(policyId)`: Transitions PENDING to CANCELLED. Admin or backend role.
- `incrementClaimCount(farmer)`: Increments annual claim counter for the farmer. Oracle role only.
- `canFarmerClaim(farmer)`: View function checking if farmer has remaining claim capacity.

**Errors:** `TooManyActivePolicies`, `TooManyClaimsThisYear`, `SumInsuredTooLow`, `SumInsuredTooHigh`, `InvalidDuration`, `PolicyDoesNotExist`, `InvalidPolicyStatus`, `PolicyExpired`, `InvalidPool`.

#### 3.1.3 PayoutReceiver.sol

PayoutReceiver serves as the bridge between the Chainlink CRE oracle and the on-chain insurance system. It receives damage reports from the DON, validates them through a multi-point verification pipeline, and initiates payouts through Treasury.

**On-Chain Damage Verification:**

The contract performs the following validations on every incoming damage report:

1. Caller is the registered Keystone Forwarder address
2. Workflow address matches configured `workflowAddress`
3. Workflow ID matches configured `workflowId`
4. Policy exists in PolicyManager
5. Policy is in ACTIVE status
6. Policy has not expired (`block.timestamp <= endDate`)
7. Policy has not already been paid out (`policyPaid` mapping)
8. Farmer has not exceeded annual claim limit (3/year)
9. Damage percentage >= `MIN_DAMAGE_THRESHOLD` (3000 basis points = 30%)
10. Damage percentage <= `MAX_DAMAGE_PERCENTAGE` (10000 basis points = 100%)
11. Report age <= `MAX_REPORT_AGE` (1 hour / 3600 seconds)
12. Weighted damage verification: `|(WEATHER_WEIGHT * weatherDamage + SATELLITE_WEIGHT * satelliteDamage) / 100 - damagePercentage| <= tolerance`
13. Payout calculation verification: `payoutAmount == sumInsured * damagePercentage / 10000`
14. Contract is not paused

**Damage Formula (on-chain):**

```
weightedDamage = (WEATHER_WEIGHT * weatherDamage + SATELLITE_WEIGHT * satelliteDamage) / 100

Where:
  WEATHER_WEIGHT  = 60
  SATELLITE_WEIGHT = 40

payoutAmount = sumInsured * damagePercentage / 10000
```

**DamageReport Struct:**

```solidity
struct DamageReport {
    uint256 policyId;
    uint256 damagePercentage;    // basis points (3000 = 30%)
    uint256 weatherDamage;       // 0-100
    uint256 satelliteDamage;     // 0-100
    uint256 payoutAmount;        // USDC with 6 decimals
    uint256 assessedAt;          // unix timestamp
}
```

**Oracle Source Switching:**

The `setKeystoneForwarder(address)` function allows the admin to switch between Chainlink CRE (production) and the self-hosted backend worker (fallback) as the authorized report submitter. This enables graceful degradation if the DON is unavailable.

#### 3.1.4 PolicyNFT.sol

PolicyNFT is an ERC721 token that serves as verifiable proof of insurance coverage. Each token represents a single insurance policy and carries the full policy details on-chain.

**Key Mechanics:**

- **Soulbound while active**: Transfer is blocked while `isActive == true`. The `_update()` hook reverts transfers for active policies.
- **Transferable after claim/expiry**: Once a policy reaches CLAIMED or EXPIRED status, the NFT becomes freely transferable (e.g., as a collectible or proof of historical coverage).
- **Token ID = Policy ID**: One-to-one mapping between on-chain policy IDs and NFT token IDs.
- **On-chain SVG art**: `tokenURI()` generates a base64-encoded SVG containing policy details (coverage type, sum insured, premium, dates, region, distributor name) directly on-chain. No external metadata server required.

**Certificate Struct:**

```solidity
struct Certificate {
    uint256 policyId;
    address farmer;
    address distributor;
    string  distributorName;
    uint256 sumInsured;
    uint256 premium;
    uint256 startDate;
    uint256 endDate;
    CoverageType coverageType;
    string  region;
    uint256 plotId;
    bool    isActive;
}
```

**Roles:** `ADMIN_ROLE` (set base URI, admin functions), `MINTER_ROLE` (granted to PolicyManager for minting on policy activation).

#### 3.1.5 RiskPool.sol

RiskPool is an ERC20 LP token vault that holds the underwriting capital for insurance policies. Each organization deploys its own RiskPool instance via the factory, creating isolated liquidity pools with configurable access controls.

**NAV-Based Pricing:**

The token price is calculated using a virtual share mechanism that prevents first-depositor inflation attacks:

```
tokenPrice = (usdcBalance + VIRTUAL_ASSETS) * PRECISION / (totalSupply + VIRTUAL_SHARES)

Where:
  VIRTUAL_ASSETS = 1e8     (100 USDC equivalent with 6 decimals)
  VIRTUAL_SHARES = 1e8     (100 token units with 18 decimals)
  PRECISION      = 1e18
```

This ensures that even when the pool is empty, the first depositor receives tokens at a fair price, and an attacker cannot manipulate the price by front-running with dust deposits.

**Premium Distribution:**

When a premium is collected, it is split among four recipients:

| Recipient | Share | Basis Points |
|---|---|---|
| Liquidity Providers | 70% | 7000 |
| Builder (protocol developer) | 12% | 1200 |
| Protocol Treasury | 10% | 1000 |
| Distributor (partner org) | 8% | 800 |
| **Total** | **100%** | **10000** |

The LP share increases the pool's USDC balance, which increases the token price, creating yield for liquidity providers.

**Withdrawal Mechanics:**

- **1-day lock period**: `MIN_LOCK_PERIOD` prevents flash loan attacks. Depositors cannot withdraw within 1 day of their last deposit.
- **Available liquidity**: `getAvailableLiquidity() = usdcBalance - (activeExposure * 120% / 100)`. A 120% exposure reservation ensures that all active policies can be paid out in full even under correlated loss scenarios.
- **Slippage protection**: `withdraw(tokenAmount, minUsdcOut)` includes a minimum output parameter.

**Pool Types:**

| Type | Min Deposit | Max Deposit | Access |
|---|---|---|---|
| PUBLIC | $100 USDC | Unlimited | Open to any address |
| PRIVATE | $250,000 USDC | Unlimited | Restricted to whitelisted depositors |
| MUTUAL | Equal contributions | Equal contributions | Cooperative members only |

**Additional Functions:**

- `canAcceptPolicy(sumInsured)`: Checks if pool has sufficient available liquidity to underwrite a new policy.
- `collectPremium(policyId, grossPremium, distributor)`: Called by Treasury to distribute premium internally.
- `reserveForPolicy(sumInsured)`: Increases `activeExposure` when a new policy is activated.
- `releaseExposure(amount)`: Decreases `activeExposure` when a policy expires, is cancelled, or is claimed.
- `getInvestorInfo(address)`: Returns deposited capital, tokens held, current value, and ROI.
- `getPoolSummary()`: Returns pool value, supply, token price, total premiums, total payouts, and active exposure.

#### 3.1.6 RiskPoolFactory.sol

RiskPoolFactory deploys new RiskPool instances as ERC1967 proxy contracts and maintains a registry of all deployed pools.

**Core Functions:**

- `createPublicPool(params)`: Deploys a PUBLIC pool with $100 minimum deposit.
- `createPrivatePool(params)`: Deploys a PRIVATE pool with $250,000 minimum deposit.
- `createMutualPool(params)`: Deploys a MUTUAL pool with equal contribution requirements.
- `allPools(index)`: Array of all deployed pool addresses.
- `isValidPool(address)`: Returns whether an address is a factory-deployed pool.

**Automatic Role Grants:** On pool creation, the factory automatically grants `TREASURY_ROLE` to the Treasury contract and `POLICY_MANAGER_ROLE` to the PolicyManager contract, ensuring they can interact with the new pool without manual configuration.

**Roles:** `ADMIN_ROLE`, `ORGANIZATION_ROLE` (partner organizations can deploy pools), `UPGRADER_ROLE`.

**Limits:** `MIN_TARGET_CAPITAL` (minimum pool capitalization target), `MAX_POOL_CAPITAL` (maximum pool size cap).

---

### 3.2 Backend Architecture

The off-chain backend orchestrates the protocol's interaction with mobile money networks, SMS gateways, and satellite data APIs. It is implemented as an Express.js application with the following technology stack:

```
+---------------------------------------------------------------+
|                      BACKEND ARCHITECTURE                      |
+---------------------------------------------------------------+
|                                                                |
|  +-----------+     +-----------+     +-------------------+     |
|  | Express.js|---->| Prisma ORM|---->| PostgreSQL        |     |
|  | REST API  |     | (Schema)  |     | (Primary Store)   |     |
|  +-----------+     +-----------+     +-------------------+     |
|       |                                                        |
|       v                                                        |
|  +-----------+     +-----------+     +-------------------+     |
|  | Bull Queue|---->|  Redis    |---->| Worker Processes  |     |
|  | (5 queues)|     | (Sessions)|     | (5 workers)       |     |
|  +-----------+     +-----------+     +-------------------+     |
|       |                                                        |
|       v                                                        |
|  +-----------+     +-----------+     +-------------------+     |
|  | ethers.js |---->| Nonce Mgr |---->| Base L2 RPC       |     |
|  | (Wallet)  |     | (Mutex)   |     | (Contracts)       |     |
|  +-----------+     +-----------+     +-------------------+     |
|                                                                |
+---------------------------------------------------------------+
```

**Bull Queue Workers:**

| Queue | Name | Function |
|---|---|---|
| Payout Worker | `payout-processing` | Processes M-Pesa disbursements to farmers |
| Notification Worker | `notifications` | Sends SMS via Africa's Talking |
| Blockchain Retry Worker | `blockchain-retry` | Retries failed on-chain transactions (5 attempts, exponential backoff starting at 30s) |
| Forage Trigger Worker | `forage-trigger` | Evaluates IBLI NDVI readings against strike levels |
| Satellite Worker | `satellite-monitoring` | Periodic NDVI monitoring for active crop policies |

All queues are configured with `removeOnFail: false` (dead letter queue retention), `removeOnComplete: 50` (keep last 50 completed jobs for debugging), and stalled event logging for operational visibility.

**Nonce Manager:**

A mutex-based serializer (`src/blockchain/nonce-manager.js`) ensures that only one blockchain transaction is in-flight at a time from the backend wallet. This prevents nonce collisions that would cause transaction failures when multiple Bull workers attempt concurrent contract calls.

```
serialize(fn) -> Promise
  |
  +-> queue.push(fn)
  +-> processNext()
       |
       +-> if (processing) return
       +-> processing = true
       +-> result = await fn()
       +-> processing = false
       +-> processNext()
```

**Per-Organization Wallets (Privy):**

Each partner organization receives a dedicated server-managed wallet via the Privy SDK. These wallets are used for risk pool deposits and withdrawals, with gas sponsorship (`sponsor: true`) eliminating the need for organizations to hold ETH.

- `createOrgWallet()`: Creates a Privy-managed wallet, stores `privyWalletId` and `walletAddress` in the Organization record.
- `sendOrgTransaction(orgWalletId, calldata)`: Encodes and sends a transaction via Privy's signing infrastructure.
- `getWalletBalances(walletAddress)`: Reads USDC and ETH balances from chain.

---

### 3.3 Payment Integration

MicroCrop uses a dual-provider payment architecture for M-Pesa integration, enabling both premium collection (fiat to crypto on-ramp) and payout disbursement (crypto to fiat off-ramp).

```
PREMIUM FLOW:
  Farmer -> M-Pesa STK Push -> Pretium/Swypt -> USDC -> Treasury -> RiskPool

PAYOUT FLOW:
  RiskPool -> Treasury -> Backend Wallet -> Pretium/Swypt -> M-Pesa -> Farmer
```

**Providers:**

| Provider | Role | Timeout |
|---|---|---|
| Pretium | Primary on/off-ramp | 15 seconds |
| Swypt | Fallback on/off-ramp | 15 seconds |

**Payment Flow (Premium Collection):**

1. Farmer initiates insurance purchase via USSD menu or partner portal.
2. Backend calls `paymentProviderService.initiateOnramp(phone, amount, poolAddress, usdcAddress, reference)`.
3. Pretium (or Swypt fallback) sends an M-Pesa STK push to the farmer's phone.
4. Farmer confirms payment on their phone by entering M-Pesa PIN.
5. Provider converts KES to USDC and sends it to the designated pool address.
6. Provider sends webhook callback to `POST /api/payments/callback`.
7. Backend `handlePaymentCallback()` verifies the callback, creates on-chain policy, and activates it.
8. SMS confirmation sent to farmer via Africa's Talking.

**Payment Flow (Payout Disbursement):**

1. Damage assessment triggers payout creation in the database.
2. Payout worker picks up the job from the Bull queue.
3. Backend calls Treasury `requestPayout(policyId, amount)` to move USDC to backend wallet.
4. Backend initiates off-ramp via Pretium/Swypt, converting USDC to KES.
5. Provider sends M-Pesa payment to farmer's phone number.
6. SMS notification sent confirming payout amount and M-Pesa reference.

---

### 3.4 USSD Interface

The USSD interface enables farmers to interact with the protocol using any mobile phone, including basic feature phones without internet connectivity. The session state machine is implemented in Redis with a 10-minute TTL per session.

**Session Architecture:**

- **State machine**: Each USSD session tracks its current state and accumulated data in a Redis key (`ussd:{sessionId}`).
- **Session locking**: Redis `SET NX` with 5-second TTL on `ussd:lock:{sessionId}` prevents concurrent request corruption when network retries cause duplicate deliveries.
- **Fail-safe**: If Redis is unavailable, the service returns a graceful "Service temporarily unavailable" message rather than corrupting state.

**Menu Tree:**

```
MAIN MENU
  |
  +-> 1. Register
  |      +-> Enter full name
  |      +-> Enter national ID
  |      +-> Select county
  |      +-> SMS confirmation
  |
  +-> 2. Buy Insurance
  |      +-> KYC verification check
  |      +-> Pool validation (org has deployed pool)
  |      +-> Select plot (with crop factor display)
  |      +-> Enter sum insured
  |      +-> Select duration
  |      +-> Premium calculation display
  |      +-> Confirm purchase
  |      +-> M-Pesa STK push
  |
  +-> 3. Check Policy
  |      +-> Display active policies
  |      +-> Coverage details, dates, status
  |
  +-> 4. My Account
  |      +-> View profile
  |      +-> View payment history
  |
  +-> 5. Pay Pending
         +-> List unpaid PENDING policies
         +-> Select policy
         +-> Re-trigger M-Pesa STK push
```

**SMS Notifications:**

SMS messages are sent via Africa's Talking (raw axios, no SDK) for the following events:

- Successful farmer registration
- Policy creation and activation
- Payment failure (with retry instructions)
- Payout disbursement confirmation
- Policy expiration reminders

---

## 4. Oracle and Data Pipeline

### 4.1 Crop Damage Assessment

The crop damage assessment pipeline combines ground-truth weather data from WeatherXM Pro API stations with Copernicus CDSE Sentinel-2 satellite imagery to produce a composite damage index for each insured plot.

**Data Sources:**

| Source | Data | Resolution | Frequency |
|---|---|---|---|
| WeatherXM Pro API | Temperature, precipitation rate, humidity, wind speed | Station-level (nearest within 10km) | Real-time (latest observation) |
| Copernicus CDSE Sentinel-2 L2A | NDVI (B08-B04)/(B08+B04) | 10m/pixel | 5-day revisit, 7-day aggregation window |

**Weather Damage Scoring:**

The weather damage score is additive, computed from four stress factors, capped at 100%:

```
weatherDamage = min(tempStress + precipStress + humidityStress + windStress, 100)
```

| Factor | Condition | Score |
|---|---|---|
| Temperature | < 5C or > 45C | +40 |
| Temperature | < 10C or > 40C | +25 |
| Temperature | < 15C or > 35C | +10 |
| Temperature | 15-35C (optimal) | +0 |
| Precipitation rate | > 10 mm/h (torrential) | +30 |
| Precipitation rate | > 4 mm/h (heavy) | +15 |
| Precipitation rate | <= 4 mm/h | +0 |
| Humidity | > 95% | +15 |
| Humidity | > 90% | +8 |
| Humidity | <= 90% | +0 |
| Wind speed | > 80 km/h | +20 |
| Wind speed | > 60 km/h | +10 |
| Wind speed | <= 60 km/h | +0 |

**Satellite Damage Scoring (NDVI Step Function):**

The NDVI-based satellite damage score uses a discrete step function calibrated to tropical agriculture:

| NDVI Range | Damage Score | Interpretation |
|---|---|---|
| >= 0.70 | 0% | Healthy vegetation |
| 0.60 - 0.69 | 10% | Mild stress |
| 0.50 - 0.59 | 25% | Moderate stress |
| 0.40 - 0.49 | 40% | Significant stress |
| 0.30 - 0.39 | 60% | Severe stress |
| 0.20 - 0.29 | 80% | Critical stress |
| < 0.20 | 100% | Vegetation loss |

**NDVI Evalscript (Sentinel-2 L2A):**

The following evalscript is executed on the Copernicus CDSE processing engine. Cloud, shadow, water, and snow pixels are masked using the Scene Classification Layer (SCL):

```javascript
//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B04", "B08", "SCL", "dataMask"] }],
    output: [
      { id: "ndvi", bands: 1, sampleType: "FLOAT32" },
      { id: "dataMask", bands: 1 }
    ]
  };
}
function evaluatePixel(sample) {
  var scl = sample.SCL;
  // Mask: cloud shadow (3), water (6), cloud medium (8), cloud high (9), snow (11)
  if (sample.dataMask === 0 || scl === 3 || scl === 6 || scl === 8 || scl === 9 || scl === 11) {
    return { ndvi: [NaN], dataMask: [0] };
  }
  var ndvi = (sample.B08 - sample.B04) / (sample.B08 + sample.B04);
  return { ndvi: [ndvi], dataMask: [1] };
}
```

**Combined Damage Index:**

The final damage index is a weighted combination of weather and satellite scores, using integer math that matches the on-chain Solidity calculation:

```
combinedDamage = floor((60 * weatherDamage + 40 * satelliteDamage) / 100)
```

The 60/40 weighting reflects the protocol's design principle that real-time ground-truth weather data (from WeatherXM stations) is a stronger indicator of acute crop stress than satellite NDVI, which is a lagging indicator of vegetation health. However, NDVI provides critical corroboration and catches scenarios (e.g., pest damage, disease) that weather alone would miss.

**Payout Threshold:**

A combined damage score of >= 30% is required to trigger a payout. Scores below this threshold are recorded but do not result in payment.

**Cron Schedule:**

The crop damage assessment CRE workflow runs on a daily cron schedule at midnight UTC (`0 0 * * *`).

---

### 4.2 Livestock / IBLI Assessment

MicroCrop implements Index-Based Livestock Insurance (IBLI) for 10 KLIP (Kenya Livestock Insurance Program) counties. Unlike crop insurance, which operates at the per-plot level, IBLI operates at the county level using area-averaged vegetation indices as a proxy for forage availability.

**Methodology:**

1. Sentinel-2 NDVI imagery is fetched for each county's bounding box using the Statistical API.
2. Area-averaged NDVI is computed at 0.01-degree resolution (~1.1 km at equator) over a 16-day lookback window, matching the MODIS MOD13Q1 composite period used in the original IBLI research.
3. Cloud masking uses the same SCL-based evalscript as crop assessment.
4. Cumulative NDVI for the season is tracked per insurance unit by averaging all readings received during the season.
5. When cumulative NDVI falls below the county's strike level for the current season, a forage deficit alert is triggered.

**Season Detection:**

| Season | Code | Months | Description |
|---|---|---|---|
| Long Rains / Long Dry | LRLD | March - September | Primary growing season |
| Short Rains / Short Dry | SRSD | October - February | Secondary growing season |

Note: For SRSD, readings in January-February are attributed to the previous calendar year's SRSD season.

**County Strike Levels and Baselines:**

| County | Unit Code | LRLD Baseline | LRLD Strike | SRSD Baseline | SRSD Strike | LRLD Rate (KES/TLU) | SRSD Rate (KES/TLU) |
|---|---|---|---|---|---|---|---|
| Turkana | TURKANA | 0.220 | 0.150 | 0.180 | 0.120 | 750 | 850 |
| Marsabit | MARSABIT | 0.250 | 0.170 | 0.200 | 0.135 | 700 | 800 |
| Wajir | WAJIR | 0.210 | 0.140 | 0.170 | 0.115 | 780 | 870 |
| Mandera | MANDERA | 0.200 | 0.135 | 0.160 | 0.110 | 800 | 900 |
| Garissa | GARISSA | 0.230 | 0.155 | 0.185 | 0.125 | 720 | 810 |
| Isiolo | ISIOLO | 0.260 | 0.175 | 0.210 | 0.140 | 680 | 770 |
| Samburu | SAMBURU | 0.270 | 0.180 | 0.220 | 0.145 | 650 | 740 |
| Tana River | TANA_RIVER | 0.240 | 0.160 | 0.195 | 0.130 | 700 | 790 |
| Baringo | BARINGO | 0.300 | 0.200 | 0.250 | 0.165 | 600 | 680 |
| Laikipia | LAIKIPIA | 0.320 | 0.215 | 0.270 | 0.180 | 550 | 630 |

**Forage Trigger Evaluation:**

```
if (cumulativeNDVI < strikeLevel):
    deficitPercent = ((strikeLevel - cumulativeNDVI) / strikeLevel) * 100
    payoutAmount = min(deficitPercent, 100) / 100 * sumInsured
```

**County Bounding Boxes:**

Each county is defined by a geographic bounding box used for Sentinel Hub Statistical API queries:

```
TURKANA:    [34.0, 1.5, 36.5, 5.5]
MARSABIT:   [36.5, 1.5, 39.5, 4.5]
WAJIR:      [38.5, 0.0, 41.0, 3.0]
MANDERA:    [39.5, 2.5, 42.0, 4.5]
GARISSA:    [38.0, -2.0, 41.5, 1.5]
ISIOLO:     [37.0, 0.0, 39.5, 2.0]
SAMBURU:    [36.0, 0.5, 38.0, 2.5]
TANA_RIVER: [38.5, -3.0, 40.5, -0.5]
BARINGO:    [35.5, 0.0, 36.5, 1.5]
LAIKIPIA:   [36.0, -0.5, 37.5, 0.5]
```

**Livestock CRE Cron Schedule:**

The livestock NDVI monitoring workflow runs bi-monthly on the 1st and 17th of each month at 06:00 UTC (`0 6 1,17 * *`), matching the 16-day MODIS composite cycle.

---

### 4.3 Oracle Architecture

MicroCrop uses a two-tier oracle architecture with Chainlink CRE as the primary oracle and a self-hosted backend worker as a fallback.

**Primary: Chainlink CRE (Compute Runtime Environment)**

The protocol deploys two CRE workflows to the Chainlink DON:

| Workflow | Schedule | Function |
|---|---|---|
| `crop-production` | Daily at 00:00 UTC | Per-plot weather + NDVI damage assessment |
| `livestock-production` | 1st and 17th at 06:00 UTC | County-level NDVI forage monitoring |

**CRE Execution Model:**

```
+---------------------------------------------------------------+
|                     CHAINLINK CRE DON                          |
+---------------------------------------------------------------+
|                                                                |
|  Node 1  ----+                                                 |
|  Node 2  ----+---> Consensus (median aggregation)              |
|  Node 3  ----+         |                                       |
|  ...     ----+         v                                       |
|  Node N  ----+    DON-Signed Report                            |
|                        |                                       |
|                        v                                       |
|                 Keystone Forwarder                              |
|                        |                                       |
|                        v                                       |
|              PayoutReceiver.receiveDamageReport()               |
|                                                                |
+---------------------------------------------------------------+
```

Each DON node independently:

1. Fetches active policies from the MicroCrop backend API.
2. Queries WeatherXM Pro API for the nearest station's latest observation.
3. Queries Copernicus CDSE Statistical API for 7-day NDVI aggregation.
4. Computes weather damage score and satellite damage score locally.
5. The DON reaches consensus via **median aggregation** on numerical fields (`temperature`, `precipitation`, `humidity`, `windSpeed`, `ndviValue`) and **identical consensus** on policy lists and trigger results.
6. The consensus result is encoded as a DON-signed report using `runtime.report(prepareReportRequest(callData))`.
7. The report is written to the PayoutReceiver contract via the Keystone Forwarder using `evmClient.writeReport()`.

**Satellite Provider Flexibility:**

The crop CRE workflow supports two satellite data providers via the `satelliteProvider` configuration:

| Provider | Data Type | Cloud Filter | Resolution |
|---|---|---|---|
| Sentinel-2 L2A | `sentinel-2-l2a` | Yes (maxCloudCoverage: 30%) | 10m |
| PlanetScope SuperDove | `planetscope` | No | 3m |

Both providers are accessed through the same Sentinel Hub Statistical API endpoint, differing only in data type, evalscript (band names), and cloud filter availability.

**Fallback: Self-Hosted Backend Worker**

When the CRE DON is unavailable (e.g., during testnet phase or DON maintenance), the backend satellite worker (`satellite.worker.js`) and forage trigger worker (`forage-trigger.worker.js`) perform the same data fetching and computation locally, submitting damage reports through the backend wallet (which holds `BACKEND_ROLE` on PayoutReceiver after switching the Keystone Forwarder address via `setKeystoneForwarder()`).

---

## 5. Risk Model

### 5.1 Premium Calculation

**Crop Insurance:**

Premiums for crop insurance are calculated using a multiplicative model:

```
premium = sumInsured * BASE_PREMIUM_RATE * cropFactor * durationFactor
```

Where `BASE_PREMIUM_RATE = 8%` (0.08).

**Crop Factors:**

Crop factors reflect the relative risk profile of each crop type based on vulnerability to weather events, disease susceptibility, and historical loss data:

| Crop | Factor | Interpretation |
|---|---|---|
| Cassava | 0.75 | Drought-resistant root crop, lowest risk |
| Millet | 0.80 | Hardy cereal, low water requirements |
| Sweet Potato | 0.80 | Resilient tuber crop |
| Sorghum | 0.85 | Drought-tolerant grain |
| Beans | 0.90 | Moderate risk legume |
| Barley | 0.95 | Moderate risk cereal |
| Maize | 1.00 | Baseline reference crop |
| Wheat | 1.00 | Baseline risk |
| Banana | 1.10 | Wind-vulnerable, higher risk |
| Potatoes | 1.10 | Disease-susceptible |
| Rice | 1.20 | Water-dependent, flood risk |
| Vegetables | 1.30 | High-value, weather-sensitive |
| Tea | 1.30 | Temperature and rainfall sensitive |
| Coffee | 1.40 | Highest risk: frost, drought, disease vulnerability |

**Duration Factors:**

Duration factors adjust the premium for the coverage period length. Shorter periods carry lower risk per unit time, while longer periods approach full annual risk:

| Duration (days) | Factor |
|---|---|
| 30 | 0.30 |
| 60 | 0.50 |
| 90 | 0.65 |
| 120 | 0.80 |
| 150 | 0.90 |
| 180 | 1.00 |
| 210 | 1.10 |
| 240 | 1.20 |
| 270 | 1.40 |
| 300 | 1.60 |
| 330 | 1.70 |
| 365 | 1.80 |

For intermediate durations, the factor for the next higher threshold is used (e.g., 45 days uses the 60-day factor of 0.50).

**Example Calculation:**

A maize farmer insuring $500 for 90 days:

```
premium = $500 * 0.08 * 1.00 * 0.65 = $26.00
```

**Livestock Insurance:**

IBLI premiums are calculated per Tropical Livestock Unit (TLU) per season, using county-specific and season-specific rates:

```
premium = TLU_count * premium_rate_per_TLU
```

**TLU Conversion Factors (FAO Standard):**

| Livestock Type | TLU Factor |
|---|---|
| Cattle | 1.0 |
| Camel | 1.4 |
| Goat | 0.1 |
| Sheep | 0.1 |
| Poultry | 0.01 |

**Livestock Region Factors:**

For livestock insurance products outside the KLIP program, additional region-based risk factors apply:

| County | Factor |
|---|---|
| Turkana | 1.40 |
| Marsabit | 1.35 |
| Wajir, Mandera | 1.30 |
| Garissa | 1.25 |
| Isiolo, Samburu | 1.20 |
| Tana River | 1.15 |
| Baringo | 1.10 |
| Laikipia | 1.05 |
| Other | 1.00 |

---

### 5.2 Damage Verification

Every damage assessment undergoes post-hoc satellite verification through the damage verification service, which cross-references on-chain claims against independent satellite evidence.

**Verification Report Structure:**

The verification report compares three layers of evidence:

1. **On-chain claim**: The damage percentage submitted by the CRE oracle and recorded in the DamageReport.
2. **Satellite evidence**: Independent NDVI measurement fetched within a +/- 15-day window around the assessment date.
3. **Historical baseline**: Multi-year NDVI baseline for the same plot and time of year, with anomaly detection.

**Consistency Scoring:**

| Category | Gap (percentage points) | Interpretation |
|---|---|---|
| CONSISTENT | <= 15pp | Claim aligns with satellite evidence |
| SUSPICIOUS | 16-35pp | Material divergence, manual review recommended |
| INCONSISTENT | > 35pp | High likelihood of overestimation |

**Confidence Score Formula:**

```
if (gap <= 15):  confidence = 1 - (gap / 100)     // High confidence claim is valid
if (gap <= 35):  confidence = gap / 100            // Moderate confidence of mismatch
if (gap > 35):   confidence = min(gap / 100, 1.0)  // High confidence of overestimation
```

**Anomaly Detection:**

Baseline anomaly detection uses a Z-score approach:

```
deviation = (observedNDVI - baselineMean) / baselineStdDev
isAnomaly = observedNDVI < baselineMean - (2 * baselineStdDev)
```

A minimum standard deviation floor of 0.05 prevents spurious anomaly flags in regions with very stable NDVI.

---

### 5.3 Fraud Detection

The fraud detection system operates as a post-hoc verification layer that flags suspicious claims for manual review without blocking payouts (which remain automatic and parametric).

**NDVI Mismatch Scoring:**

The core fraud signal measures how much a claimed damage exceeds what satellite data supports:

```
expectedDamage = calculateSatelliteDamage(observedNDVI)
mismatch = (claimedDamage - expectedDamage) / 100

if mismatch <= 0:
    score = 0  // Claim matches or underestimates satellite damage

if mismatch > 0:
    score = mismatch

// Baseline health boost: if plant is healthier than historical average
if observedNDVI > baselineMean:
    healthBoost = min((observedNDVI - baselineMean) / baselineStdDev * 0.1, 0.2)
    score += healthBoost

score = clamp(score, 0, 1)
```

**Severity Tiers:**

| Score Range | Severity | Action |
|---|---|---|
| 0.70 - 0.80 | MEDIUM | Flag created, no immediate action |
| 0.80 - 0.90 | HIGH | Flag created, review recommended |
| 0.90 - 1.00 | CRITICAL | Flag created, urgent investigation required |

**Fraud Flag Types:**

| Type | Detection Method | Description |
|---|---|---|
| `NDVI_MISMATCH` | Satellite NDVI vs. claimed damage | Claimed damage significantly exceeds satellite-observed vegetation stress |
| `BOUNDARY_OVERLAP` | Geometric intersection analysis | Two plots have overlapping boundaries (potential double-insurance) |

**Boundary Overlap Detection:**

The `checkBoundaryOverlaps()` function scans all plots within an organization for geographic overlaps. Overlapping plots may indicate attempts to insure the same land area twice under different plot registrations.

**Resolution Workflow:**

Fraud flags follow a lifecycle: `OPEN` -> `INVESTIGATING` -> `CONFIRMED` / `DISMISSED`, with resolution notes and auditor identity tracked in the database.

---

### 5.4 Basis Risk Mitigation

Basis risk -- the mismatch between index-triggered payouts and actual farmer losses -- is the primary limitation of parametric insurance. MicroCrop employs multiple strategies to minimize this risk:

**1. Dual Data Source (Weather + Satellite):**

Using both weather data and satellite NDVI reduces basis risk compared to single-index approaches. Weather data captures acute events (storms, temperature extremes) that affect crops immediately, while NDVI captures the cumulative vegetative response over time. A storm may cause immediate damage that weather data captures but NDVI does not yet reflect; conversely, disease or pest damage may depress NDVI without any weather anomaly.

**2. Ground-Truth Weather Stations (WeatherXM):**

Unlike satellite-only approaches that rely on modeled weather data or reanalysis datasets, MicroCrop uses WeatherXM Pro API data from physical weather stations deployed in the field. These stations provide actual measured conditions at the farm level, not gridded estimates. The nearest station within 10km is used for each insured plot.

**3. Per-Plot Precision (500m):**

Each insured plot is monitored individually using a 500m bounding box (`delta = 0.005 degrees`) centered on the plot's GPS coordinates. This provides approximately 1km x 1km NDVI measurement areas, far more precise than the 25km+ grid cells used by many traditional index insurance programs.

**4. GeoJSON Polygon Boundaries:**

For plots with registered boundary polygons (rather than just center-point coordinates), the Sentinel Hub query uses the exact polygon geometry, eliminating the approximation inherent in bounding box approaches.

**5. Historical Baseline Comparison:**

NDVI readings are compared against historical baselines for the same plot and time of year, with outlier filtering. This accounts for seasonal variation and regional differences in vegetation type, preventing false positives in naturally low-NDVI regions.

**6. Cloud Masking:**

The SCL-based cloud masking in the evalscript eliminates five categories of invalid pixels (cloud shadow, water, medium probability cloud, high probability cloud, snow/ice), ensuring NDVI calculations use only clear-sky observations.

---

## 6. Tokenomics

### 6.1 RiskPool LP Tokens (ERC20)

Each RiskPool instance is an ERC20 token that represents a fractional claim on the pool's USDC assets. Token holders are liquidity providers (LPs) who earn yield from insurance premiums and bear the risk of payout obligations.

**NAV-Based Pricing Mechanism:**

```
tokenPrice = (usdcBalance + VIRTUAL_ASSETS) * PRECISION / (totalSupply + VIRTUAL_SHARES)
```

| Constant | Value | Purpose |
|---|---|---|
| `VIRTUAL_ASSETS` | 1e8 (100 USDC) | Prevents price manipulation when pool is empty |
| `VIRTUAL_SHARES` | 1e8 (100 tokens) | Prevents inflation attack by first depositor |
| `PRECISION` | 1e18 | Price precision (18 decimal places) |
| `BPS_DENOMINATOR` | 10000 | Basis point denominator for fee calculations |

**Anti-Inflation Attack Protection:**

The virtual share mechanism ensures that:

- When `totalSupply = 0` and `usdcBalance = 0`, the initial token price is `(0 + 1e8) * 1e18 / (0 + 1e8) = 1e18` (1:1 ratio).
- An attacker who deposits 1 wei of USDC and then donates a large amount directly to the pool contract cannot extract disproportionate value, because the virtual shares maintain a floor on the share count.

**Deposit Mechanics:**

```
tokensToMint = usdcAmount * (totalSupply + VIRTUAL_SHARES) / (usdcBalance + VIRTUAL_ASSETS)
```

The `deposit(usdcAmount, minTokensOut)` function includes slippage protection. The `minTokensOut` parameter reverts the transaction if price moved unfavorably between the user's preview and execution.

**Withdrawal Mechanics:**

```
usdcToReturn = tokenAmount * (usdcBalance + VIRTUAL_ASSETS) / (totalSupply + VIRTUAL_SHARES)
```

Constraints:

- **Lock period**: 1 day after deposit before withdrawal is permitted.
- **Available liquidity**: Withdrawals are limited to `usdcBalance - (activeExposure * 120 / 100)`. This ensures that the pool always retains enough capital to cover all active policies at 120% of their sum insured.

**Investor ROI Calculation:**

The `getInvestorInfo(address)` function returns:

```
deposited    = total USDC deposited by this address (basis tracking)
tokensHeld   = LP token balance
currentValue = tokensHeld * tokenPrice / PRECISION
roi          = (currentValue - deposited) * 10000 / deposited  // basis points
```

**Transfer Mechanics:**

LP tokens are freely transferable ERC20 tokens. On transfer, the contract updates the deposit basis tracking for both sender and receiver proportionally, ensuring accurate ROI calculation for all holders.

---

### 6.2 PolicyNFT (ERC721)

**Soulbound Mechanism:**

PolicyNFTs cannot be transferred while the associated policy is active (`isActive = true`). This prevents farmers from selling active coverage, which would create scenarios where the NFT holder differs from the M-Pesa recipient configured for payouts. Once a policy is claimed or expires, the NFT becomes transferable.

**On-Chain SVG Generation:**

The `tokenURI()` function generates a complete SVG image encoded as a base64 data URI. No external metadata server or IPFS gateway is required. The SVG includes:

- Policy ID and coverage type
- Sum insured and premium paid
- Start and end dates
- Region and distributor name
- Visual status indicator (active/expired/claimed)

**Use Cases:**

- **Proof of coverage**: Farmers can present their PolicyNFT to lenders, input suppliers, or government programs as verifiable evidence of insurance.
- **Credit access**: Insured farmers represent lower risk to lenders, potentially unlocking better loan terms.
- **Historical record**: Expired/claimed NFTs serve as an on-chain record of the farmer's insurance history.
- **Secondary market**: After expiry, NFTs could have collectible or social signaling value in agricultural communities.

---

### 6.3 Revenue Model

**Premium Flow:**

```
Farmer (M-Pesa KES)
  |
  v
Pretium/Swypt (KES -> USDC conversion)
  |
  v
Treasury.receivePremium()
  |-- Platform fee (10%) -> Treasury.accumulatedFees
  |
  v
Treasury.distributePremiumToPool()
  |
  v
RiskPool.collectPremium()
  |-- LP share (70%) ---------> Pool USDC balance (increases token price)
  |-- Builder share (12%) ----> Builder address
  |-- Protocol share (10%) ---> Protocol address
  |-- Distributor share (8%) -> Partner organization address
```

**Payout Flow:**

```
PayoutReceiver.receiveDamageReport() (from CRE DON)
  |
  v
Treasury.requestPayout()
  |
  v
USDC transferred to backend wallet
  |
  v
Backend initiates off-ramp via Pretium/Swypt
  |
  v
Farmer receives M-Pesa payment (KES)
```

**Reserve Mechanics:**

Two reserve mechanisms operate in parallel:

1. **Treasury Reserve (20% minimum)**: The Treasury contract enforces a minimum reserve ratio. `requestPayout()` will revert if it would push the reserve below the minimum threshold. This ensures the protocol always has USDC available for payout obligations.

2. **Pool Exposure Reserve (120%)**: Each RiskPool reserves 120% of its `activeExposure` (total sum insured of all active policies). This over-reservation provides a buffer against correlated loss events where multiple policies trigger simultaneously.

---

### 6.4 Pool Types

**Public Pools:**

- Open to any Ethereum address.
- $100 USDC minimum deposit.
- LP tokens are freely tradeable on secondary markets.
- Suitable for retail investors and DeFi composability.

**Private Pools:**

- Restricted to whitelisted depositors via `addDepositor()`.
- $250,000 USDC minimum deposit.
- Designed for institutional investors, reinsurers, and insurance companies.
- Higher minimum ensures serious capital commitment.

**Mutual Pools:**

- Members of a cooperative or community group.
- Equal contribution requirements ensure fairness.
- Self-insurance model where the community pools resources.
- Pool owner (cooperative leadership) manages membership.

---

## 7. Data Archival (Autonomys Auto Drive)

MicroCrop integrates with Autonomys Auto Drive for permanent, immutable archival of protocol data that requires long-term verifiability.

### 7.1 What Is Stored

| Data Type | Purpose | Frequency |
|---|---|---|
| Damage assessments | Verifiable record of oracle-reported damage | Per assessment |
| Payout records | Immutable proof of payment execution | Per payout |
| NDVI readings | Historical vegetation index time series | Per monitoring cycle |
| Policy snapshots | Point-in-time policy state for audit | On state transitions |
| Fraud flags | Record of flagged anomalies and resolutions | On creation/resolution |

### 7.2 What Is NOT Stored

| Data Type | Reason |
|---|---|
| Personally Identifiable Information (PII) | Privacy compliance. Farmer names, phone numbers, and national IDs remain in the off-chain database only. |
| Credentials and API keys | Security. All authentication material is ephemeral. |
| Mutable state | Autonomys is append-only. Current balances and active session data belong in PostgreSQL/Redis. |

### 7.3 Content Addressing and Retrieval

All archived data is content-addressed using CIDs (Content Identifiers), ensuring that:

- Data integrity is cryptographically verifiable.
- Identical data always produces the same CID.
- Archives are permanently available via the Autonomys public gateway.
- No central party can modify or delete archived records.

### 7.4 Encryption

Sensitive archival data (e.g., damage assessment details linked to specific policies) is encrypted with AES-256-GCM before upload. Encryption keys are managed by the platform and shared with authorized auditors as needed. Public data (e.g., aggregate NDVI statistics) is stored unencrypted for maximum transparency.

---

## 8. Security

### 8.1 Smart Contract Security

**UUPS Upgradeable Proxy Pattern:**

All six contracts use the UUPS (Universal Upgradeable Proxy Standard) pattern with ERC1967 proxy storage slots. Upgrades require the `UPGRADER_ROLE` and go through `upgradeToAndCall()`, which validates the new implementation via `proxiableUUID()`.

**Role-Based Access Control:**

Five distinct roles enforce the principle of least privilege:

| Role | Contracts | Granted To |
|---|---|---|
| `DEFAULT_ADMIN_ROLE` | All | Deployment multisig |
| `ADMIN_ROLE` | All | Platform admin multisig |
| `BACKEND_ROLE` | Treasury, PolicyManager | Backend server wallet |
| `PAYOUT_ROLE` | Treasury | PayoutReceiver contract |
| `UPGRADER_ROLE` | All | Deployment multisig |
| `ORACLE_ROLE` | PolicyManager | PayoutReceiver contract |
| `MINTER_ROLE` | PolicyNFT | PolicyManager contract |
| `TREASURY_ROLE` | RiskPool | Treasury contract |
| `POLICY_MANAGER_ROLE` | RiskPool | PolicyManager contract |
| `DEPOSITOR_ROLE` | RiskPool | Whitelisted LPs (private/mutual pools) |
| `ORGANIZATION_ROLE` | RiskPoolFactory | Partner organizations |

**14-Point PayoutReceiver Validation:**

Every damage report submitted on-chain undergoes the full validation pipeline described in Section 3.1.3. Any single check failure reverts the entire transaction, ensuring no invalid payouts can be executed.

**Reentrancy Protection:**

All contracts that perform external calls use OpenZeppelin's `ReentrancyGuardUpgradeable` with the `nonReentrant` modifier on state-changing functions.

**Pausability:**

Treasury and PayoutReceiver implement `PausableUpgradeable`, allowing the admin to halt all operations in case of a discovered vulnerability. The `pause()` and `unpause()` functions are restricted to `ADMIN_ROLE`.

### 8.2 Backend Security

**Nonce Manager (Mutex Serialization):**

The nonce manager ensures transaction ordering by allowing only one in-flight blockchain transaction at a time. This prevents nonce collisions, stuck transactions, and out-of-order execution that can occur when multiple Bull queue workers attempt concurrent contract calls.

**Redis Rate Limiting:**

API rate limiting uses a Redis `INCR` + `EXPIRE` pattern. If Redis is unavailable, the rate limiter fails open (allows requests) rather than blocking all traffic, ensuring service availability.

**Webhook Rate Limiting:**

The payment callback endpoint (`/api/payments/callback`) has a dedicated rate limiter of 60 requests per minute, preventing abuse of the webhook interface.

**CORS Enforcement:**

In production, cross-origin requests are denied if `ALLOWED_ORIGINS` is not configured. This prevents accidental exposure of the API to unauthorized web clients.

**Database Connection Pooling:**

PostgreSQL connections are pooled with a limit of 20 connections and a 30-second pool timeout, preventing connection exhaustion under load.

**API Timeouts:**

| Service | Timeout |
|---|---|
| Pretium/Swypt | 15 seconds |
| Africa's Talking SMS | 10 seconds |
| Base RPC | 30 seconds |
| Transaction confirmation | 120 seconds |
| Sentinel Hub API | 15 seconds |

**Gas Estimation:**

All contract write operations perform `estimateGas()` before submission, catching reverts before they consume gas.

**Blockchain Retry Worker:**

Failed on-chain transactions are automatically retried up to 5 times with exponential backoff starting at 30 seconds. Failed jobs are retained in the dead letter queue for manual investigation.

---

## 9. Competitive Analysis

| Feature | MicroCrop | IBISA | Etherisc | Nexus Mutual | Traditional Insurance |
|---|---|---|---|---|---|
| **Data Sources** | WeatherXM + Sentinel-2 (dual index) | Satellite only | Varies by product | N/A (discretionary) | Manual field assessment |
| **Payout Speed** | < 24 hours (automatic) | Days to weeks | Days | Weeks (governance vote) | 30-90 days |
| **Trust Model** | Chainlink CRE DON consensus | Centralized oracle | Chainlink price feeds | Token holder governance | Insurance company discretion |
| **Coverage Types** | Crop + Livestock (IBLI) | Crop only | Flight delay, crop | Smart contract cover | Crop, livestock, property |
| **Access Method** | USSD (any phone) | Web/mobile app | Web app | Web app | Agent/branch office |
| **Payment Rails** | M-Pesa (mobile money) | Bank transfer | Crypto only | Crypto only | Bank/cash |
| **Blockchain** | Base L2 ($0.001/tx) | None (centralized) | Ethereum L1 | Ethereum L1 | None |
| **Fraud Detection** | NDVI mismatch + boundary overlap | None | N/A | Claims assessors | Manual investigation |
| **Target Market** | African smallholders | Developing markets | Global | DeFi users | Urban/commercial farms |
| **Risk Pool Model** | Per-org isolated pools (ERC20 LP) | Mutual pools (off-chain) | Staking pools | Capital pool (NXM) | Reinsurance treaties |
| **Per-Plot Precision** | 500m (GPS-based) | ~25km grid | N/A | N/A | Farm-level (manual) |
| **Basis Risk Mitigation** | Dual index + ground stations | Single index satellite | N/A | N/A | Low (indemnity) |
| **Regulatory Alignment** | IRA Kenya sandbox-ready | Limited | EU regulatory engagement | UK FCA excluded | Fully licensed |

**Key Differentiators:**

1. **USSD-first design**: MicroCrop is the only blockchain-based insurance protocol that works on basic feature phones without internet. This is not an add-on; it is the primary user interface.

2. **Dual-index oracle**: The combination of ground-truth WeatherXM stations and Sentinel-2 satellite imagery, weighted at 60/40 and validated by Chainlink DON consensus, provides the most robust parametric trigger available in the market.

3. **M-Pesa native**: End-to-end integration with M-Pesa for both premium collection and payout disbursement means farmers never interact with cryptocurrency directly.

4. **Per-organization risk pools**: Unlike global pool models, each partner organization operates its own isolated risk pool, preventing cross-contamination of risk across geographies and enabling tailored pool structures (public, private, mutual).

---

## 10. Use Cases

### 10.1 Kenyan Maize Farmer (Crop Insurance)

**Persona:** Grace, a smallholder farmer in Nakuru County growing 2 acres of maize.

**Flow:**

1. Grace dials the USSD short code `*384*1#` on her Nokia feature phone.
2. She selects "Register" and enters her name, national ID, and county.
3. She receives an SMS confirming her registration.
4. Next session, she selects "Buy Insurance", chooses her maize plot, enters $200 sum insured for 120 days.
5. The system calculates her premium: `$200 * 0.08 * 1.00 * 0.80 = $12.80`.
6. She confirms, and an M-Pesa STK push appears on her phone. She enters her PIN.
7. Her policy is created on-chain, and she receives an SMS with her policy number.
8. Six weeks later, a severe drought hits. WeatherXM stations record temperatures above 40C for 5 consecutive days. Sentinel-2 shows NDVI dropping from 0.65 to 0.35.
9. The Chainlink CRE workflow computes: `weather=55%, satellite=60%, combined=floor((60*55 + 40*60)/100) = 57%`.
10. 57% exceeds the 30% threshold. The DON submits a damage report on-chain.
11. PayoutReceiver validates the report, Treasury disburses `$200 * 57/100 = $114` USDC.
12. Backend converts USDC to KES via Pretium and sends M-Pesa to Grace's phone.
13. Grace receives an SMS: "You have received KES 14,820 from MicroCrop insurance payout."
14. Total time from trigger to payment: under 24 hours.

### 10.2 Turkana Pastoralist (IBLI)

**Persona:** Ekiru, a pastoralist in Turkana County with 15 cattle and 30 goats.

**Flow:**

1. Ekiru is enrolled through a partner NGO operating in Turkana.
2. His herd is registered: 15 cattle (15 TLU) + 30 goats (3 TLU) = 18 TLU.
3. For the LRLD season, his premium is: `18 TLU * KES 750/TLU = KES 13,500` (~$104).
4. He pays via M-Pesa.
5. The livestock CRE workflow runs on the 1st and 17th of each month, fetching area-averaged NDVI for Turkana County (`bbox: [34.0, 1.5, 36.5, 5.5]`).
6. By July, cumulative NDVI has dropped to 0.130, below the LRLD strike level of 0.150.
7. The CRE workflow submits the NDVI reading to the backend forage trigger service.
8. Deficit calculation: `((0.150 - 0.130) / 0.150) * 100 = 13.33%`.
9. A ForageAlert is created, and payouts are generated for all active IBLI policies in Turkana.
10. Ekiru's payout: `13.33% * sumInsured`. He receives the M-Pesa payment within 48 hours.
11. This early payout arrives before livestock condition deteriorates, enabling him to purchase supplemental feed and avoid distressed asset sales.

### 10.3 Institutional Risk Pool (Britam/Reinsurer)

**Persona:** Britam Insurance Company, a major Kenyan insurer seeking to offer parametric products.

**Flow:**

1. Britam registers as a partner organization on the MicroCrop platform.
2. They deploy a PRIVATE risk pool with $5M target capitalization and $250,000 minimum deposit.
3. Britam deposits $2M from their own balance sheet. Additional institutional investors deposit $3M via whitelisted addresses.
4. The pool covers both crop and livestock policies distributed through Britam's existing agent network.
5. Premiums flow into the pool: 70% to LPs (increasing Britam's and co-investors' positions), 12% to MicroCrop builders, 10% to MicroCrop protocol, 8% to Britam as distributor.
6. Britam monitors pool performance via the dashboard: total premiums, total payouts, active exposure, reserve ratio, token price.
7. At season end, if premiums exceed payouts, the LP token price has increased. Britam's $2M position may now be worth $2.12M -- a 6% return on underwriting capital.
8. Britam can withdraw excess returns or reinvest for the next season.

### 10.4 Cooperative Mutual Pool

**Persona:** Nyeri County Coffee Cooperative, 200 members.

**Flow:**

1. The cooperative deploys a MUTUAL risk pool through their MicroCrop partner account.
2. Each of the 200 members contributes an equal amount (e.g., KES 5,000 each), creating a pool of KES 1,000,000 (~$7,700 USDC).
3. Members insure their coffee plots against drought, excess rain, and frost (COMPREHENSIVE coverage).
4. Premiums from members flow back into the same pool, creating a self-reinforcing reserve.
5. When a member's plot is damaged, the payout comes from the shared pool.
6. If the season is favorable and few payouts are made, the accumulated premiums increase the pool's value for the next season.
7. The cooperative board can vote to distribute excess reserves to members or carry them forward.

---

## 11. Roadmap

### Phase 1: Core Protocol (Q1 2026) -- COMPLETED

- Six UUPS-upgradeable smart contracts deployed on Base Sepolia testnet
- Express.js backend with Prisma ORM, Redis, and Bull queues
- USSD state machine with session locking
- M-Pesa integration (Pretium + Swypt)
- Chainlink CRE crop and livestock workflows
- Per-organization Privy wallets
- Satellite monitoring (Copernicus CDSE Sentinel-2)
- Fraud detection (NDVI mismatch + boundary overlap)
- Damage verification service
- 5 Bull workers (payout, notification, blockchain retry, forage trigger, satellite)
- Production hardening (nonce manager, rate limiting, CORS, connection pooling)

### Phase 2: Integrations and Mainnet (Q2 2026)

- Autonomys Auto Drive integration for permanent data archival
- WeatherXM Builders Program partnership activation
- Base mainnet contract deployment and migration
- PlanetScope SuperDove 3m imagery integration (via CRE satellite provider config)
- CRE workflow deployment to Chainlink production DON
- Formal security audit of smart contracts
- IRA Kenya regulatory sandbox application

### Phase 3: Kenya Pilot (Q3 2026)

- Pilot deployment with 1,000 farmers across Nakuru, Turkana, and Marsabit counties
- Britam Insurance partnership for institutional risk pool
- Cooperative onboarding (3-5 cooperatives)
- USSD short code registration with Kenya's Communications Authority
- Real-world premium collection and payout disbursement
- Basis risk analysis from pilot data
- Iterative calibration of crop factors and NDVI thresholds

### Phase 4: Scale and Institutional Expansion (Q4 2026)

- Multi-country expansion: Tanzania, Uganda, Ethiopia
- Institutional investor onboarding for public and private pools
- Reinsurance bridge: connect MicroCrop pools to traditional reinsurance markets
- Regulatory licensing in additional jurisdictions
- Advanced NDVI analytics: multi-temporal baseline, seasonal decomposition
- Partner portal v2: self-service pool deployment, custom product design

### Phase 5: Decentralization and Scale (2027)

- 100,000+ insured farmers across East Africa
- Gelato automation for policy expiration and premium reminders
- UMA optimistic oracle as additional verification layer
- Governance token for protocol parameter management
- Cross-chain deployment (Arbitrum, Optimism) for reinsurance composability
- Integration with carbon credit markets for climate-smart agriculture incentives
- API marketplace for third-party data providers (soil moisture, crop yield models)

---

## 12. Team

*Team bios to be added.*

---

## 13. References

1. **Chainlink CRE (Compute Runtime Environment)**. Chainlink Labs. https://docs.chain.link/cre

2. **Copernicus Data Space Ecosystem (CDSE)**. European Space Agency. https://dataspace.copernicus.eu/

3. **Sentinel Hub Statistical API**. Sinergise. https://docs.sentinel-hub.com/api/latest/api/statistical/

4. **WeatherXM Pro API**. WeatherXM. https://pro.weatherxm.com/docs

5. **Autonomys Auto Drive**. Autonomys. https://docs.autonomys.xyz/auto-drive

6. **IBLI (Index-Based Livestock Insurance) Technical Design**. International Livestock Research Institute (ILRI). Chantarat, S., Mude, A.G., Barrett, C.B., & Carter, M.R. (2013). "Designing Index-Based Livestock Insurance for Managing Asset Risk in Northern Kenya." *Journal of Risk and Insurance*, 80(1), 205-237.

7. **Kenya Livestock Insurance Program (KLIP)**. Government of Kenya, State Department for Livestock. https://www.kilimo.go.ke/klip/

8. **World Bank Agricultural Insurance Protection Gap**. World Bank Group. (2023). "Agricultural Insurance: Global Challenges and Solutions." Report No. 187245.

9. **Base L2 (Coinbase)**. https://base.org/

10. **OpenZeppelin UUPS Proxy Pattern**. OpenZeppelin. https://docs.openzeppelin.com/contracts/5.x/api/proxy#UUPSUpgradeable

11. **ERC1967 Proxy Standard**. Ethereum Foundation. https://eips.ethereum.org/EIPS/eip-1967

12. **NDVI (Normalized Difference Vegetation Index)**. NASA Earth Observatory. https://earthobservatory.nasa.gov/features/MeasuringVegetation/measuring_vegetation_2.php

13. **Sentinel-2 Scene Classification Layer (SCL)**. ESA. https://sentinels.copernicus.eu/web/sentinel/technical-guides/sentinel-2-msi/level-2a/algorithm-overview

14. **FAO Tropical Livestock Units (TLU)**. Food and Agriculture Organization. "Guidelines for the Preparation of Livestock Sector Reviews." FAO Animal Production and Health Guidelines No. 5.

15. **Africa's Talking USSD/SMS API**. Africa's Talking. https://africastalking.com/

16. **M-Pesa API (Safaricom)**. Safaricom. https://developer.safaricom.co.ke/

17. **Privy Server Wallets**. Privy. https://docs.privy.io/guide/server/wallets

18. **Munich Re NatCatSERVICE**. (2024). "Natural Catastrophe Losses in Africa." Munich Re.

---

*This whitepaper describes the MicroCrop Protocol as of March 2026. The protocol is under active development and specifications may evolve. Nothing in this document constitutes financial advice or an offer of securities. Participation in risk pools involves financial risk including potential loss of deposited capital.*
