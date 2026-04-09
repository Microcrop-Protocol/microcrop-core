# MicroCrop Protocol

### Decentralized Parametric Insurance for Africa's Smallholder Farmers

**Version 1.0 | March 2026**

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [The Problem](#2-the-problem)
3. [The Solution](#3-the-solution)
4. [How It Works](#4-how-it-works)
5. [Technology Stack](#5-technology-stack)
6. [Tokenomics Overview](#6-tokenomics-overview)
7. [Products](#7-products)
8. [Competitive Advantage](#8-competitive-advantage)
9. [Roadmap](#9-roadmap)
10. [Team and Partners](#10-team-and-partners)

---

## 1. Executive Summary

MicroCrop Protocol is a decentralized parametric crop and livestock insurance platform built on Base (Ethereum L2) that protects Africa's smallholder farmers against climate risk. By combining ground-truth weather data from WeatherXM stations, satellite imagery from Copernicus Sentinel-2, and on-chain smart contracts, MicroCrop eliminates the administrative overhead, trust deficit, and payout delays that have prevented traditional insurance from reaching the continent's most vulnerable agricultural producers. Farmers purchase policies via USSD on any basic phone, pay premiums through M-Pesa mobile money, and receive automatic payouts directly to their phone when verified climate events damage their crops or deplete their livestock forage. No claims paperwork. No adjusters. No delays.

**Key figures:**

- 80% of African farmers have zero insurance coverage
- The continent faces a $5.4 billion agricultural protection gap
- 33 million smallholder farmers in Kenya alone lack access to affordable risk management
- Climate-related crop losses in sub-Saharan Africa have increased 30% over the past decade

---

## 2. The Problem

### Unprotected Farmers, Uninsurable Risk

Sub-Saharan Africa is home to over 50 million smallholder farming households that collectively produce 80% of the region's food supply. These farmers operate on plots averaging 1-2 hectares, earn under $2/day, and face escalating climate volatility with no financial safety net. A single drought or flood event can erase an entire season of income and push families into multi-year cycles of poverty.

### Why Traditional Insurance Fails

| Barrier | Impact |
|---|---|
| **High administrative costs** | Loss adjustment, field visits, and paperwork consume 40-60% of premiums, making micro-policies uneconomical |
| **Slow claims processing** | Payouts take 3-6 months, arriving long after the farmer has already sold assets or gone hungry |
| **No trust** | History of denied claims and opaque processes has eroded farmer confidence in formal insurance |
| **Literacy requirements** | Paper-based applications and complex policy documents exclude farmers with limited formal education |
| **Distribution gap** | Insurance agents do not serve remote rural areas where the need is greatest |
| **Basis risk** | Regional index products pay based on county-wide averages, missing the reality of individual plots |

### The Gap in Existing Solutions

Existing parametric insurance initiatives in East Africa, both traditional and blockchain-based, suffer from critical limitations. Centralized platforms depend on single data providers, creating single points of failure. Regional index products average risk over large geographic areas, paying farmers who were not affected while missing those who were. None have solved the last-mile distribution problem: reaching farmers who have no smartphone, no internet, and no bank account, but do have a basic mobile phone and an M-Pesa account.

---

## 3. The Solution

MicroCrop Protocol is purpose-built infrastructure for African agricultural insurance that operates at the intersection of three domains:

**Decentralized finance** -- Risk pools, premium collection, and payouts are managed by auditable smart contracts on Base, an Ethereum L2 with sub-cent gas costs. Capital allocation is transparent, and every premium payment and payout is recorded on-chain.

**Remote sensing and IoT** -- Damage assessment combines hyperlocal weather data from WeatherXM ground stations with Copernicus Sentinel-2 satellite NDVI analysis. Dual-source verification reduces basis risk and provides per-plot precision rather than county-wide averages.

**Mobile-first access** -- The entire farmer-facing experience runs over USSD, the text-based protocol available on every GSM phone in Africa. No app download, no smartphone, no internet connection required. Premiums are paid via M-Pesa, and payouts arrive as M-Pesa credits directly on the farmer's phone.

### Core Design Principles

- **Automated, not manual.** Oracle pipelines assess damage continuously. Payouts trigger without human intervention.
- **Verifiable, not trusted.** All policy terms, assessments, and payouts live on-chain. Any party can audit the system.
- **Inclusive, not exclusive.** USSD and M-Pesa access means any farmer with a basic phone can participate.
- **Composable, not monolithic.** Risk pools, oracle feeds, and distribution channels are modular. New products, regions, and data sources plug into the same infrastructure.

---

## 4. How It Works

### Policy Lifecycle

```
+------------------+     +------------------+     +------------------+
|                  |     |                  |     |                  |
|  1. ENROLLMENT   |---->|  2. MONITORING   |---->|  3. PAYOUT       |
|                  |     |                  |     |                  |
+------------------+     +------------------+     +------------------+
  Farmer dials USSD        Daily satellite         If threshold
  Selects crop/plot         NDVI analysis +        breached: auto
  Pays via M-Pesa           weather station        payout to M-Pesa
  Policy minted             data collection        via USDC bridge
  on-chain                  Anomaly detection
```

### Detailed Flow

```
Farmer                  MicroCrop                 Blockchain (Base)
  |                         |                           |
  |  1. Dial USSD code      |                           |
  |------------------------>|                           |
  |  2. Select coverage     |                           |
  |  (crop, plot, sum)      |                           |
  |------------------------>|                           |
  |  3. M-Pesa STK push     |                           |
  |<------------------------|                           |
  |  4. Confirm payment     |                           |
  |------------------------>|                           |
  |                         |  5. Convert KES -> USDC   |
  |                         |  via Pretium/Swypt        |
  |                         |-------------------------->|
  |                         |  6. createPolicy() +      |
  |                         |  mint PolicyNFT           |
  |                         |-------------------------->|
  |  7. SMS confirmation    |                           |
  |<------------------------|                           |
  |                         |                           |
  |        --- Daily Monitoring Loop ---                |
  |                         |                           |
  |                         |  8. Fetch NDVI from       |
  |                         |  Copernicus CDSE          |
  |                         |  + WeatherXM station data |
  |                         |                           |
  |                         |  9. Analyze: baseline     |
  |                         |  comparison, anomaly      |
  |                         |  detection, fraud check   |
  |                         |                           |
  |                         |  10. Threshold exceeded?  |
  |                         |  Submit DamageAssessment  |
  |                         |-------------------------->|
  |                         |                           |
  |                         |  11. Smart contract       |
  |                         |  verifies + releases      |
  |                         |  USDC payout              |
  |                         |<--------------------------|
  |                         |                           |
  |                         |  12. Convert USDC -> KES  |
  |                         |  via Pretium/Swypt        |
  |                         |                           |
  |  13. M-Pesa payout      |                           |
  |<------------------------|                           |
  |                         |                           |
```

### Premium Calculation

Premiums are actuarially derived using four factors:

```
Premium = Sum Insured x Base Rate (8%) x Crop Factor x Duration Factor
```

| Factor | Description | Range |
|---|---|---|
| **Base Rate** | Underlying risk rate | 8% (crop), 6.5% (livestock) |
| **Crop Factor** | Per-crop risk adjustment across 14 supported crops | 0.75 (cassava) to 1.4 (coffee) |
| **Duration Factor** | Longer coverage costs proportionally more | 0.3 (30 days) to 1.8 (365 days) |
| **Region Factor** | County-level risk for livestock (10 KLIP counties) | 1.0 to 1.4 |

Policies range from $1,000 to $1,000,000 sum insured with durations of 30 to 365 days.

---

## 5. Technology Stack

### Architecture Overview

```
+---------------------------------------------------------------------+
|                         FARMER ACCESS LAYER                         |
|  USSD (any phone)  |  SMS notifications  |  Africa's Talking API   |
+---------------------------------------------------------------------+
          |                                            |
+---------------------------------------------------------------------+
|                         PAYMENT LAYER                               |
|  M-Pesa (KES)  -->  Pretium / Swypt  -->  USDC (on-chain)         |
+---------------------------------------------------------------------+
          |                                            |
+---------------------------------------------------------------------+
|                         APPLICATION LAYER                           |
|  Express.js  |  Prisma ORM  |  Redis  |  Bull Queues              |
|  REST API (50+ endpoints)  |  USSD state machine                  |
+---------------------------------------------------------------------+
          |                                            |
+---------------------------------------------------------------------+
|                         ORACLE LAYER                                |
|  Chainlink CRE Workflows   |   Self-hosted Oracle Pipeline        |
|  WeatherXM Pro API          |   Copernicus CDSE (Sentinel-2)      |
|  NDVI Analysis              |   Fraud Detection Engine             |
+---------------------------------------------------------------------+
          |                                            |
+---------------------------------------------------------------------+
|                         BLOCKCHAIN LAYER (Base L2)                  |
|  PolicyManager  |  RiskPoolFactory  |  RiskPool (ERC20 LP)        |
|  PolicyNFT      |  PayoutReceiver   |  PlatformTreasury           |
|  All UUPS-upgradeable  |  Nonce manager  |  Gas estimation        |
+---------------------------------------------------------------------+
          |                                            |
+---------------------------------------------------------------------+
|                         DATA ARCHIVAL LAYER                         |
|  Autonomys Auto Drive  --  Permanent, verifiable storage           |
+---------------------------------------------------------------------+
```

### Blockchain: Base (Ethereum L2)

Base provides sub-cent transaction costs, 2-second block times, and full EVM compatibility. MicroCrop deploys six UUPS-upgradeable smart contracts:

| Contract | Function |
|---|---|
| **PlatformTreasury** | Collects and distributes protocol fees. Entry point for premium routing. |
| **PolicyManager** | Creates, tracks, and settles insurance policies. Enforces coverage parameters. |
| **PolicyNFT (ERC721)** | Soulbound insurance certificates with on-chain SVG metadata. Proof of coverage. |
| **RiskPool (ERC20)** | NAV-based liquidity pool. Investors deposit USDC, receive LP tokens priced at pool NAV. |
| **RiskPoolFactory** | Deploys and configures new risk pools (public, private, mutual). |
| **PayoutReceiver** | Receives and routes claim payouts. Interfaces with off-ramp providers. |

All on-chain writes are serialized through a mutex-based nonce manager with gas estimation pre-checks. Failed transactions are retried via a dedicated Bull queue with exponential backoff (5 attempts, 30-second base delay).

### Oracle Pipeline: Chainlink CRE + Dual-Source Verification

Damage assessment combines two independent data sources:

**Copernicus CDSE (Sentinel-2):** The satellite monitoring service fetches NDVI (Normalized Difference Vegetation Index) imagery for every insured plot on a daily schedule. Each reading is compared against a per-plot historical baseline to detect anomalies using sigma-threshold analysis. Readings that fall below configured thresholds trigger damage assessment workflows.

**WeatherXM Pro API:** Ground-truth weather station data provides hyperlocal precipitation, temperature, and humidity readings. Weather events (drought periods, flood events, excess rainfall) are correlated with satellite observations for dual-source verification.

Chainlink CRE (Compute, Respond, Execute) workflows orchestrate the end-to-end pipeline: data fetching, threshold evaluation, consensus, and on-chain settlement. An automated fraud detection engine cross-checks claimed damage against satellite evidence, flagging claims where NDVI mismatch scores exceed confidence thresholds.

### Data Archival: Autonomys Auto Drive

All policy metadata, satellite readings, damage assessments, and payout records are archived to Autonomys Auto Drive for permanent, verifiable, and decentralized storage. This creates an immutable audit trail that regulators, reinsurers, and farmers can independently verify, while keeping the operational database lean.

### Payment Infrastructure: M-Pesa Integration

MicroCrop integrates two payment providers for M-Pesa-to-USDC conversion:

- **Pretium** (primary): Handles STK push for premium collection and bulk disbursement for payouts
- **Swypt** (fallback): Automatic failover ensures payment continuity

Per-organization Privy server wallets allow institutions to hold and manage USDC independently, with gas-sponsored transactions eliminating the need for ETH management.

---

## 6. Tokenomics Overview

MicroCrop uses two on-chain token types, each serving a distinct function within the protocol. There is no speculative governance token.

### RiskPool LP Tokens (ERC20)

When investors deposit USDC into a risk pool, they receive LP tokens priced at the pool's current Net Asset Value (NAV). As premiums flow in and claims flow out, the NAV adjusts accordingly. Profitable pools see NAV appreciation; pools that pay more claims than they collect in premiums see NAV decline.

This creates a transparent, market-driven mechanism for pricing agricultural risk. Investors earn returns proportional to the pool's underwriting performance.

### PolicyNFT (ERC721)

Each insurance policy is represented as a soulbound NFT with on-chain SVG metadata encoding coverage type, sum insured, duration, and status. The NFT serves as a verifiable, portable proof of insurance that farmers own in their wallet. Policies become transferable after claim settlement or expiry.

### Premium Revenue Distribution

Every premium payment is split deterministically by the smart contracts:

```
+------------------------------------------------------------------+
|                     PREMIUM PAYMENT (100%)                       |
+------------------------------------------------------------------+
     |              |               |              |
     v              v               v              v
+---------+   +-----------+   +----------+   +------------+
|   70%   |   |    12%    |   |   10%    |   |     8%     |
|  Risk   |   |  Product  |   | Protocol |   | Distributor|
|  Pool   |   |  Builder  |   | Treasury |   |  (co-op/   |
|  (LPs)  |   | (instit.) |   |          |   |   agent)   |
+---------+   +-----------+   +----------+   +------------+
```

| Recipient | Share | Description |
|---|---|---|
| **Risk Pool (LP holders)** | 70% | Accrues to pool NAV, backing future claims and generating LP returns |
| **Product Builder** | 12% | The institution or cooperative that designed and configured the insurance product |
| **Protocol Treasury** | 10% | Funds protocol development, audits, and operational infrastructure |
| **Distributor** | 8% | The cooperative, agent, or channel that acquired the farmer |

An additional 5% platform fee is collected at the Treasury level on applicable transactions.

### Risk Pool Types

| Pool Type | Minimum Deposit | Access | Use Case |
|---|---|---|---|
| **Public** | $100 USDC | Open to all | Retail investors seeking agricultural risk exposure |
| **Private** | $250,000 USDC | Whitelisted | Institutional capital (reinsurers, DeFi protocols, impact funds) |
| **Mutual** | Equal contributions | Cooperative members | Farmer cooperatives pooling their own risk |

---

## 7. Products

### Crop Insurance

Parametric coverage for 14 crop types across East Africa, with per-plot satellite monitoring and automated damage assessment.

| Parameter | Detail |
|---|---|
| **Supported crops** | Maize, beans, rice, sorghum, millet, vegetables, cassava, sweet potato, banana, coffee, tea, wheat, barley, potatoes |
| **Coverage types** | Drought, Flood, Both, Excess Rain, Comprehensive |
| **Policy duration** | 30 to 365 days |
| **Sum insured** | $1,000 to $1,000,000 USDC |
| **Trigger mechanism** | NDVI anomaly detection (sigma-threshold below historical baseline) combined with weather event correlation |
| **Damage threshold** | 30% verified damage triggers payout |
| **Monitoring frequency** | Daily satellite passes, continuous weather station data |

Premium pricing is risk-adjusted per crop. Coffee (factor: 1.4) costs more to insure than cassava (factor: 0.75), reflecting the underlying risk profile and value at stake.

### Livestock Insurance (IBLI)

Index-Based Livestock Insurance modeled on the Kenya Livestock Insurance Program (KLIP), covering pastoralist communities in 10 arid and semi-arid counties.

| Parameter | Detail |
|---|---|
| **Counties** | Turkana, Marsabit, Wajir, Mandera, Garissa, Isiolo, Samburu, Tana River, Baringo, Laikipia |
| **Seasons** | LRLD (Long Rains/Long Dry, March-September), SRSD (Short Rains/Short Dry, October-February) |
| **Livestock types** | Cattle, goats, sheep, camels, poultry |
| **Index** | Cumulative NDVI forage condition index per insurance unit |
| **Trigger** | Cumulative NDVI falls below county-specific strike level |
| **Pricing** | TLU (Tropical Livestock Unit) based: TLU count x premium rate per TLU |
| **Payout** | Proportional to forage deficit severity |

Each county has pre-calibrated strike levels, exit levels, and premium rates per season, derived from historical NDVI baselines. Region-specific risk factors range from 1.0 (default) to 1.4 (Turkana), reflecting the severity of pastoral risk in arid zones.

---

## 8. Competitive Advantage

### vs. IBISA and Existing Blockchain Insurance

| Dimension | IBISA / Others | MicroCrop |
|---|---|---|
| **Data sources** | Single source (NDVI only) | Dual-source: satellite NDVI + ground-truth weather stations |
| **Granularity** | Regional index (county-wide) | Per-plot monitoring with individual baselines |
| **Oracle design** | Centralized data provider | Chainlink CRE decentralized oracle pipeline |
| **Fraud detection** | Manual review | Automated NDVI mismatch scoring with confidence thresholds |
| **Farmer access** | Smartphone app required | USSD on any phone, no internet |
| **Payout speed** | Days to weeks | Minutes (on-chain trigger to M-Pesa) |

### vs. Traditional Insurance

| Dimension | Traditional | MicroCrop |
|---|---|---|
| **Admin costs** | 40-60% of premiums | Under 10% (automated assessment, no adjusters) |
| **Claims process** | 3-6 months, paperwork, field visits | Automated, minutes from trigger to payout |
| **Distribution** | Urban-based agents | USSD reaches any farmer with a phone |
| **Transparency** | Opaque pricing and claims | All terms and payouts verifiable on-chain |
| **Trust** | "Insurance never pays" perception | Deterministic smart contract execution |

### vs. Other DeFi Insurance Protocols

| Dimension | DeFi Insurance (Nexus, Etherisc) | MicroCrop |
|---|---|---|
| **Target user** | Crypto-native, smartphone, DeFi wallet | Non-crypto, basic phone, M-Pesa |
| **Access method** | Web3 dApp | USSD (works on $10 Nokia) |
| **Payment** | ETH/stablecoins from wallet | M-Pesa mobile money (KES) |
| **Geography** | Global, undifferentiated | Africa-first, localized per county |
| **Data integration** | Generic price feeds | Agricultural: satellite, weather, forage indices |

### Defensible Moats

1. **M-Pesa + USSD integration** -- The single hardest piece to replicate. Requires payment provider partnerships, telecom integrations, and regulatory compliance in each market.
2. **Dual-source oracle pipeline** -- WeatherXM ground stations + Copernicus satellite creates a verification layer that no single data provider can replicate.
3. **Per-plot historical baselines** -- Every insured plot accumulates its own NDVI history, improving accuracy over time. This dataset is a compounding asset.
4. **Institutional distribution** -- Cooperatives and agricultural organizations deploy MicroCrop as white-label infrastructure, creating embedded distribution that scales with partners rather than against them.

---

## 9. Roadmap

| Phase | Timeline | Milestones | Status |
|---|---|---|---|
| **Foundation** | Q1 2026 | Backend infrastructure, smart contract deployment, CRE oracle workflows, USSD + M-Pesa integration, satellite monitoring pipeline, IBLI livestock product | Complete |
| **Integration** | Q2 2026 | Autonomys Auto Drive integration, Builders Program participation, mainnet deployment on Base, WeatherXM station network onboarding, security audits | In Progress |
| **Pilot** | Q3 2026 | Britam reinsurance partnership, Kenya pilot with 1,000 farmers across 3 counties, cooperative onboarding, actuarial validation with claims data | Planned |
| **Scale** | Q4 2026 | Multi-country expansion (Uganda, Tanzania), public risk pool launch, institutional LP onboarding, additional crop types | Planned |
| **Growth** | 2027 | 100,000+ insured farmers, $10M+ total value locked in risk pools, regulatory licensing in 3+ markets, reinsurance partnerships | Planned |

### Near-Term Technical Priorities (Q2 2026)

- Autonomys Auto Drive integration for permanent archival of all policy and assessment data
- WeatherXM Pro station deployment in pilot counties for ground-truth weather correlation
- Chainlink CRE mainnet deployment with multi-node oracle consensus
- Smart contract audit by a top-tier security firm
- Base mainnet deployment with UUPS proxy governance

---

## 10. Team and Partners

### Team

*[Team bios to be added]*

### Partners and Integrations

| Partner | Role | Integration |
|---|---|---|
| **Chainlink** | Decentralized oracle infrastructure | CRE workflows for automated damage assessment, data feed consensus, and on-chain settlement |
| **WeatherXM** | Ground-truth weather data | Pro API integration for hyperlocal precipitation, temperature, and humidity readings from physical weather stations |
| **Autonomys** | Decentralized storage | Auto Drive for permanent, verifiable archival of policy data, satellite readings, and assessment records |
| **Base** | Layer 2 blockchain | Smart contract deployment with sub-cent gas costs and Ethereum security guarantees |
| **Copernicus / ESA** | Satellite imagery | CDSE API for Sentinel-2 NDVI data with 10-meter resolution and 5-day revisit cycle |
| **Pretium** | Fiat on/off-ramp | M-Pesa STK push for premium collection and USDC conversion |
| **Swypt** | Fiat on/off-ramp (fallback) | Redundant M-Pesa integration for payment continuity |
| **Privy** | Wallet infrastructure | Server-managed wallets for institutional partners with gas-sponsored transactions |

---

## Contact

*[Contact information to be added]*

---

*This document is for informational purposes only and does not constitute an offer to sell or a solicitation of an offer to buy any securities or tokens. The information contained herein is subject to change without notice.*
