# MicroCrop Backend API Documentation

**Base URL:** `https://api.microcrop.app` (production) / `http://localhost:3000` (development)

All endpoints are prefixed with `/api/`.

---

## Table of Contents

- [Authentication](#authentication)
- [Common Patterns](#common-patterns)
- [Error Responses](#error-responses)
- [Auth Endpoints](#1-auth-endpoints)
- [Platform Admin Endpoints](#2-platform-admin-endpoints)
- [Organization Endpoints](#3-organization-endpoints)
- [Farmer Endpoints](#4-farmer-endpoints)
- [Policy Endpoints](#5-policy-endpoints)
- [Payout Endpoints](#6-payout-endpoints)
- [Staff Management Endpoints](#7-staff-management-endpoints)
- [Platform Dashboard Endpoints](#8-platform-dashboard-endpoints)
- [Organization Dashboard Endpoints](#9-organization-dashboard-endpoints)
- [Export Endpoints](#10-export-endpoints)

---

## Authentication

### JWT Bearer Token

All authenticated endpoints require:

```
Authorization: Bearer <jwt_token>
```

### Organization API Key (alternative)

Organization-scoped endpoints also accept:

```
x-api-key: <org_api_key>
```

### User Roles

| Role | Scope | Description |
|------|-------|-------------|
| `PLATFORM_ADMIN` | Global | Full platform access, manages all organizations |
| `ORG_ADMIN` | Organization | Organization administration, staff management |
| `ORG_STAFF` | Organization | Read/write access within their organization |
| `FARMER` | Organization | Farmer-facing access (USSD) |

---

## Common Patterns

### Paginated Responses

```json
{
  "success": true,
  "data": [ ... ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 245,
    "totalPages": 5
  }
}
```

### Standard Responses

```json
{
  "success": true,
  "data": { ... }
}
```

### Date Filtering

Most analytics endpoints accept date filtering via query parameters:

| Parameter | Type | Description |
|-----------|------|-------------|
| `period` | string | Preset: `today`, `7d`, `30d`, `90d`, `1y` |
| `startDate` | ISO date | Custom range start (requires `endDate`) |
| `endDate` | ISO date | Custom range end (requires `startDate`) |

- `period` and `startDate` are mutually exclusive
- If neither is provided, defaults to last 30 days

### Granularity

Time-series endpoints accept:

| Parameter | Type | Default | Values |
|-----------|------|---------|--------|
| `granularity` | string | `daily` | `daily`, `weekly`, `monthly` |

---

## Error Responses

All errors follow this format:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable description"
  }
}
```

| HTTP Status | Code | Description |
|-------------|------|-------------|
| 400 | `VALIDATION_ERROR` | Invalid request parameters |
| 401 | `UNAUTHORIZED` | Missing or invalid token |
| 403 | `FORBIDDEN` | Insufficient role permissions |
| 404 | `NOT_FOUND` | Resource not found |
| 409 | `CONFLICT` | Duplicate resource (e.g., email already exists) |
| 429 | `RATE_LIMITED` | Too many requests |
| 500 | `INTERNAL_ERROR` | Server error |

---

## 1. Auth Endpoints

### POST `/api/auth/register`

Register a new user account.

**Auth:** None

**Body:**
```json
{
  "email": "admin@example.com",
  "password": "securePassword123",
  "firstName": "John",
  "lastName": "Doe",
  "phone": "+254700000000"
}
```

**Response:** `201`
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "email": "admin@example.com",
      "firstName": "John",
      "lastName": "Doe",
      "role": "ORG_STAFF"
    },
    "accessToken": "jwt_token",
    "refreshToken": "jwt_refresh_token"
  }
}
```

### POST `/api/auth/login`

**Auth:** None

**Body:**
```json
{
  "email": "admin@example.com",
  "password": "securePassword123"
}
```

**Response:** `200`
```json
{
  "success": true,
  "data": {
    "user": { ... },
    "accessToken": "jwt_token",
    "refreshToken": "jwt_refresh_token"
  }
}
```

### POST `/api/auth/refresh`

**Auth:** None

**Body:**
```json
{
  "refreshToken": "jwt_refresh_token"
}
```

**Response:** `200` — New access and refresh tokens.

### GET `/api/auth/me`

**Auth:** Bearer token

**Response:** `200` — Current user profile with organization details.

---

## 2. Platform Admin Endpoints

**Auth:** Bearer token + `PLATFORM_ADMIN` role

### POST `/api/platform/organizations/register`

Register a new partner organization.

**Body:**
```json
{
  "name": "Kenya Farmers Cooperative",
  "registrationNumber": "KFC-2024-001",
  "type": "COOPERATIVE",
  "brandName": "KFC Insurance",
  "contactPerson": "Jane Smith",
  "contactEmail": "jane@kfc.co.ke",
  "contactPhone": "+254711000000",
  "county": "Nakuru",
  "adminWallet": "0x1234...abcd"
}
```

`type` values: `COOPERATIVE`, `NGO`, `MFI`, `INSURANCE_COMPANY`, `GOVERNMENT`, `OTHER`

**Response:** `201`
```json
{
  "success": true,
  "data": {
    "organization": { ... },
    "apiKey": "org_live_abc123...",
    "apiSecret": "def456..."
  }
}
```

> **Note:** `apiSecret` is only returned once at creation time.

### GET `/api/platform/organizations`

List all organizations.

**Response:** `200` — Array of organizations with stats.

### GET `/api/platform/organizations/:orgId`

Get organization details with counts.

**Response:** `200`
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "Kenya Farmers Cooperative",
    "type": "COOPERATIVE",
    "isActive": true,
    "poolAddress": "0x...",
    "_count": {
      "farmers": 1200,
      "policies": 890,
      "payouts": 45,
      "users": 5
    }
  }
}
```

### PUT `/api/platform/organizations/:orgId/configure`

**Body:**
```json
{
  "ussdShortCode": "*384*5#",
  "brandName": "KFC Insurance",
  "brandColor": "#2E7D32",
  "logoUrl": "https://cdn.example.com/logo.png",
  "webhookUrl": "https://hooks.example.com/microcrop"
}
```

### POST `/api/platform/organizations/:orgId/deploy-pool`

Deploy on-chain risk pool for the organization.

**Body:**
```json
{
  "initialCapital": 50000
}
```

**Response:** `200`
```json
{
  "success": true,
  "data": {
    "message": "Pool deployment initiated",
    "orgId": "uuid",
    "initialCapital": 50000
  }
}
```

### POST `/api/platform/organizations/:orgId/activate`

Activate organization (sets `isActive: true`).

### POST `/api/platform/organizations/:orgId/deactivate`

Deactivate organization (sets `isActive: false`).

### GET `/api/platform/organizations/:orgId/onboarding-status`

Get organization onboarding progress checklist.

**Response:** `200`
```json
{
  "success": true,
  "data": {
    "organization": { ... },
    "steps": {
      "registered": true,
      "configured": true,
      "poolDeployed": true,
      "funded": false,
      "staffInvited": false,
      "activated": false
    },
    "nextStep": "funded"
  }
}
```

### GET `/api/platform/analytics/revenue`

**Query:** `startDate`, `endDate`

**Response:** Platform-wide revenue analytics.

---

## 3. Organization Endpoints

**Auth:** Bearer token or API key (organization-scoped)

### GET `/api/organizations/me`

Get current organization details.

### GET `/api/organizations/me/stats`

**Response:** `200`
```json
{
  "success": true,
  "data": {
    "totalFarmers": 1200,
    "totalPolicies": 890,
    "totalFees": 4500.00
  }
}
```

### PUT `/api/organizations/me/settings`

**Body:**
```json
{
  "brandColor": "#2E7D32",
  "webhookUrl": "https://hooks.example.com/microcrop",
  "contactPhone": "+254711000000"
}
```

### GET `/api/organizations/me/pool`

Get on-chain risk pool status.

**Response:** `200`
```json
{
  "success": true,
  "data": {
    "poolAddress": "0xabc123...",
    "balance": 38000.00,
    "totalCapitalDeposited": 100000.00,
    "totalPremiumsReceived": 45000.00,
    "totalPayoutsSent": 12000.00,
    "totalFeesPaid": 2250.00,
    "utilizationRate": 24.0
  }
}
```

---

## 4. Farmer Endpoints

**Auth:** Bearer token (organization-scoped)

### POST `/api/farmers/register`

**Auth:** `ORG_ADMIN` or `ORG_STAFF`

**Body:**
```json
{
  "phoneNumber": "+254712345678",
  "nationalId": "12345678",
  "firstName": "James",
  "lastName": "Mwangi",
  "county": "Nakuru",
  "subCounty": "Njoro",
  "ward": "Mau Narok",
  "village": "Elburgon"
}
```

**Response:** `201` — Created farmer object.

### GET `/api/farmers`

List farmers with filtering and pagination.

**Query:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `page` | number | Page number (default: 1) |
| `limit` | number | Items per page (default: 50, max: 100) |
| `kycStatus` | string | Filter: `PENDING`, `APPROVED`, `REJECTED` |
| `county` | string | Filter by county |
| `search` | string | Search by name or phone |

**Response:** `200` — Paginated farmer list.

### GET `/api/farmers/:farmerId`

Get farmer details with plots and policies.

### PUT `/api/farmers/:farmerId`

Update farmer details.

**Body:**
```json
{
  "phoneNumber": "+254712345678",
  "ward": "Updated Ward",
  "village": "Updated Village"
}
```

### PUT `/api/farmers/:farmerId/kyc`

**Auth:** `ORG_ADMIN`

Update farmer KYC status.

**Body:**
```json
{
  "status": "APPROVED",
  "reason": "Documents verified"
}
```

`status`: `APPROVED` or `REJECTED`. `reason` is required when status is `REJECTED`.

### POST `/api/farmers/bulk-import`

**Auth:** `ORG_ADMIN`

Bulk import up to 500 farmers.

**Body:**
```json
{
  "farmers": [
    {
      "firstName": "James",
      "lastName": "Mwangi",
      "phoneNumber": "+254712345678",
      "nationalId": "12345678",
      "county": "Nakuru",
      "subCounty": "Njoro",
      "ward": "Mau Narok",
      "village": "Elburgon"
    }
  ]
}
```

**Response:** `201`
```json
{
  "success": true,
  "data": {
    "imported": 45,
    "skipped": 3,
    "errors": [
      { "row": 7, "field": "phoneNumber", "message": "Duplicate phone number" },
      { "row": 12, "field": "nationalId", "message": "National ID already registered" }
    ],
    "total": 48
  }
}
```

### POST `/api/farmers/bulk-import/plots`

**Auth:** `ORG_ADMIN`

Bulk import up to 500 plots linked to existing farmers by phone number.

**Body:**
```json
{
  "plots": [
    {
      "farmerPhone": "+254712345678",
      "plotName": "Main Farm",
      "latitude": -0.3031,
      "longitude": 36.0800,
      "acreage": 2.5,
      "cropType": "MAIZE"
    }
  ]
}
```

`cropType` values: `MAIZE`, `BEANS`, `RICE`, `SORGHUM`, `MILLET`, `VEGETABLES`, `CASSAVA`, `SWEET_POTATO`, `BANANA`, `COFFEE`, `TEA`, `WHEAT`, `BARLEY`, `POTATOES`

**Response:** `201` — Same structure as farmer bulk import.

---

## 5. Policy Endpoints

**Auth:** Bearer token (organization-scoped)

### POST `/api/policies/quote`

Get a premium quote without creating a policy.

**Body:**
```json
{
  "farmerId": "uuid",
  "plotId": "uuid",
  "sumInsured": 50000,
  "coverageType": "DROUGHT",
  "durationDays": 90
}
```

`coverageType`: `DROUGHT`, `FLOOD`, `BOTH`
`durationDays`: 30 to 365

**Response:** `200`
```json
{
  "success": true,
  "data": {
    "sumInsured": 50000,
    "premium": 2500.00,
    "platformFee": 125.00,
    "netPremium": 2375.00,
    "coverageType": "DROUGHT",
    "durationDays": 90,
    "breakdown": {
      "baseRate": 0.04,
      "cropFactor": 1.0,
      "durationFactor": 1.25,
      "calculation": "50000 * 0.04 * 1.0 * 1.25"
    }
  }
}
```

### POST `/api/policies/purchase`

**Auth:** `ORG_ADMIN` or `ORG_STAFF`

Create and purchase a policy. Same body as `/quote`.

**Response:** `201`
```json
{
  "success": true,
  "data": {
    "policy": {
      "id": "uuid",
      "policyNumber": "POL-2026-A1B2C3D4",
      "status": "PENDING",
      "premium": 2500.00,
      "netPremium": 2375.00,
      "platformFee": 125.00,
      "sumInsured": 50000,
      "coverageType": "DROUGHT",
      "durationDays": 90,
      "startDate": "2026-01-27T00:00:00.000Z",
      "endDate": "2026-04-27T00:00:00.000Z"
    },
    "paymentInstructions": {
      "amount": 2500.00,
      "policyNumber": "POL-2026-A1B2C3D4",
      "message": "Pay KES 2500.00 for policy POL-2026-A1B2C3D4"
    }
  }
}
```

### GET `/api/policies`

List policies with filters.

**Query:** `page`, `limit`, `status`, `farmerId`, `plotId`

### GET `/api/policies/:policyId`

Full policy details with farmer, plot, payouts, and damage assessments.

### GET `/api/policies/:policyId/status`

Policy status with `daysRemaining` field.

### PUT `/api/policies/:policyId/activate`

**Auth:** `ORG_ADMIN`

Activate a policy after premium payment is confirmed.

### POST `/api/policies/:policyId/cancel`

**Auth:** `ORG_ADMIN`

Cancel an active or pending policy. Calculates prorated refund for active policies.

**Body:**
```json
{
  "reason": "Farmer requested cancellation - relocated farm"
}
```

`reason`: 5-500 characters

**Response:** `200`
```json
{
  "success": true,
  "data": {
    "policy": {
      "id": "uuid",
      "status": "CANCELLED",
      "cancelledAt": "2026-01-27T12:00:00.000Z",
      "cancellationReason": "Farmer requested cancellation - relocated farm"
    },
    "refund": {
      "amount": 1580.00,
      "transaction": {
        "id": "uuid",
        "type": "REFUND",
        "amount": 1580.00,
        "status": "PENDING"
      }
    }
  }
}
```

### POST `/api/policies/expire-check`

**Auth:** `PLATFORM_ADMIN`

Batch-expire all overdue active policies. Intended for cron jobs.

**Response:** `200`
```json
{
  "success": true,
  "data": {
    "expired": 12
  }
}
```

---

## 6. Payout Endpoints

**Auth:** Bearer token (organization-scoped)

### GET `/api/payouts`

List payouts with filters.

**Query:** `page`, `limit`, `status`, `farmerId`

**Response:** `200` — Paginated payouts with policy number and farmer name.

### GET `/api/payouts/:payoutId`

Full payout details with policy and farmer.

### POST `/api/payouts/:payoutId/retry`

**Auth:** `ORG_ADMIN`

Retry a failed payout. Resets status to `PENDING` and increments `retryCount`.

**Response:** `200`
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "status": "PENDING",
    "retryCount": 2
  }
}
```

### POST `/api/payouts/batch-retry`

**Auth:** `ORG_ADMIN`

Retry multiple failed payouts at once.

**Body (option A — specific payouts):**
```json
{
  "payoutIds": ["uuid-1", "uuid-2", "uuid-3"]
}
```

**Body (option B — all failed):**
```json
{
  "retryAllFailed": true
}
```

Must provide either `payoutIds` OR `retryAllFailed`, not both.

**Response:** `200`
```json
{
  "success": true,
  "data": {
    "retried": 5
  }
}
```

### GET `/api/payouts/reconciliation`

**Query:** `startDate`, `endDate` (optional)

**Response:** `200`
```json
{
  "success": true,
  "data": {
    "byStatus": [
      { "status": "COMPLETED", "_count": 45, "_sum": { "amountUSDC": 12500.00 } },
      { "status": "FAILED", "_count": 3, "_sum": { "amountUSDC": 850.00 } },
      { "status": "PENDING", "_count": 2, "_sum": { "amountUSDC": 400.00 } }
    ],
    "totalClaimedPolicies": 50,
    "totalPayouts": 50,
    "totalAmount": 13750.00
  }
}
```

---

## 7. Staff Management Endpoints

**Base path:** `/api/staff`
**Auth:** Bearer token + `ORG_ADMIN` role (organization-scoped)

### GET `/api/staff`

List all staff members in the organization.

**Response:** `200`
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "email": "staff@org.com",
      "firstName": "Alice",
      "lastName": "Wanjiku",
      "role": "ORG_STAFF",
      "isActive": true,
      "lastLogin": "2026-01-27T10:00:00.000Z",
      "createdAt": "2026-01-15T08:00:00.000Z"
    }
  ]
}
```

### POST `/api/staff/invite`

Invite a new staff member. Creates user account with temporary password.

**Body:**
```json
{
  "email": "newstaff@org.com",
  "firstName": "Alice",
  "lastName": "Wanjiku",
  "phone": "+254700123456",
  "role": "ORG_STAFF"
}
```

`role`: `ORG_ADMIN` or `ORG_STAFF`

**Response:** `201` — Created user object (password not included).

### PUT `/api/staff/:userId/role`

Change a staff member's role.

**Body:**
```json
{
  "role": "ORG_ADMIN"
}
```

### PUT `/api/staff/:userId/deactivate`

Deactivate a staff member. No body required.

### PUT `/api/staff/:userId/reactivate`

Reactivate a staff member. No body required.

---

## 8. Platform Dashboard Endpoints

**Base path:** `/api/dashboard/platform`
**Auth:** Bearer token + `PLATFORM_ADMIN` role

### GET `/api/dashboard/platform/overview`

Platform-wide KPI cards.

**Query:** `period` | (`startDate` + `endDate`)

**Response:** `200`
```json
{
  "success": true,
  "data": {
    "organizations": {
      "total": 15,
      "active": 12,
      "inactive": 3
    },
    "policies": {
      "total": 4500,
      "active": 2100,
      "periodNew": 340
    },
    "farmers": {
      "total": 12000
    },
    "financials": {
      "totalPremiums": 2250000.00,
      "totalPayouts": 540000.00,
      "totalPayoutCount": 180,
      "totalRevenue": 112500.00
    },
    "period": {
      "start": "2025-12-28T00:00:00.000Z",
      "end": "2026-01-27T00:00:00.000Z"
    }
  }
}
```

### GET `/api/dashboard/platform/organizations`

Paginated organization table with stats.

**Query:** `period` | date range, `page`, `limit`, `type`, `isActive`, `search`

**Response:** `200` — Paginated list of orgs with `_count` for farmers, policies, payouts, users.

### GET `/api/dashboard/platform/organizations/:orgId/metrics`

Deep-dive metrics for a single organization.

**Query:** `period` | date range

**Response:** `200`
```json
{
  "success": true,
  "data": {
    "organization": { ... },
    "farmers": {
      "total": 1200,
      "byKycStatus": { "APPROVED": 980, "PENDING": 200, "REJECTED": 20 }
    },
    "policies": {
      "total": 890,
      "byStatus": { "ACTIVE": 450, "EXPIRED": 300, "CANCELLED": 40, "CLAIMED": 100 },
      "byCoverage": { "DROUGHT": 500, "FLOOD": 200, "BOTH": 190 },
      "totalPremiums": 445000.00,
      "totalNetPremiums": 422750.00
    },
    "payouts": {
      "total": 100,
      "totalAmount": 120000.00,
      "byStatus": { "COMPLETED": 90, "FAILED": 5, "PENDING": 5 }
    },
    "fees": { "total": 22250.00 },
    "lossRatio": 0.27,
    "recentPolicies": [ ... ],
    "recentPayouts": [ ... ]
  }
}
```

### GET `/api/dashboard/platform/analytics/revenue`

Revenue time-series and breakdown by organization.

**Query:** `period` | date range, `granularity` (`daily`/`weekly`/`monthly`)

**Response:** `200`
```json
{
  "success": true,
  "data": {
    "timeSeries": [
      { "date": "2026-01-01", "totalFees": 1500.00, "totalPremiums": 30000.00, "totalPayoutsAmount": 5000.00 }
    ],
    "byOrganization": [
      { "organizationId": "uuid", "organizationName": "KFC", "totalFees": 8000.00, "totalPremiums": 160000.00, "count": 320 }
    ],
    "granularity": "daily"
  }
}
```

### GET `/api/dashboard/platform/analytics/policies`

Policy analytics with status breakdown and claims ratio.

**Query:** `period` | date range, `granularity`

**Response:** `200`
```json
{
  "success": true,
  "data": {
    "timeSeries": [ { "date": "2026-01-01", "totalPolicies": 45 } ],
    "byStatus": { "ACTIVE": 2100, "EXPIRED": 1800, "CLAIMED": 400, "CANCELLED": 200 },
    "byCoverage": { "DROUGHT": 2500, "FLOOD": 1200, "BOTH": 800 },
    "claimsRatio": 0.093,
    "granularity": "daily"
  }
}
```

### GET `/api/dashboard/platform/analytics/farmers`

Farmer growth analytics.

**Query:** `period` | date range, `granularity`

**Response:** `200`
```json
{
  "success": true,
  "data": {
    "total": 12000,
    "byKycStatus": { "APPROVED": 9800, "PENDING": 1800, "REJECTED": 400 },
    "byCounty": { "Nakuru": 3200, "Kiambu": 2100, "Uasin Gishu": 1800 },
    "growthTimeSeries": [ { "date": "2026-01-01", "farmersRegistered": 25 } ],
    "granularity": "daily"
  }
}
```

### GET `/api/dashboard/platform/analytics/payouts`

Payout analytics with success/failure rates.

**Query:** `period` | date range, `granularity`

**Response:** `200`
```json
{
  "success": true,
  "data": {
    "summary": {
      "totalAmount": 540000.00,
      "avgAmount": 3000.00,
      "avgDamagePercent": 42.5,
      "totalCount": 180
    },
    "byStatus": {
      "COMPLETED": { "count": 165, "amount": 495000.00 },
      "FAILED": { "count": 10, "amount": 30000.00 },
      "PENDING": { "count": 5, "amount": 15000.00 }
    },
    "successRate": 0.917,
    "failureRate": 0.056,
    "timeSeries": [ ... ],
    "granularity": "daily"
  }
}
```

### GET `/api/dashboard/platform/analytics/damage-assessments`

Damage assessment statistics and paginated list.

**Query:** `period` | date range, `page`, `limit`

**Response:** `200`
```json
{
  "success": true,
  "data": {
    "summary": {
      "avgWeather": 35.2,
      "avgSatellite": 28.7,
      "avgCombined": 32.6,
      "total": 500,
      "triggered": 180,
      "triggerRate": 0.36
    }
  },
  "pagination": { "page": 1, "limit": 50, "total": 500, "totalPages": 10 }
}
```

### GET `/api/dashboard/platform/activity`

Unified activity feed with alerts.

**Query:** `limit` (default: 20, max: 100)

**Response:** `200`
```json
{
  "success": true,
  "data": {
    "activity": [
      {
        "type": "POLICY_CREATED",
        "id": "uuid",
        "policyNumber": "POL-2026-A1B2C3D4",
        "status": "ACTIVE",
        "organizationId": "uuid",
        "timestamp": "2026-01-27T12:00:00.000Z"
      },
      {
        "type": "PAYOUT_COMPLETED",
        "id": "uuid",
        "amountUSDC": 3500.00,
        "status": "COMPLETED",
        "organizationId": "uuid",
        "timestamp": "2026-01-27T11:30:00.000Z"
      },
      {
        "type": "FARMER_REGISTERED",
        "id": "uuid",
        "name": "James Mwangi",
        "organizationId": "uuid",
        "timestamp": "2026-01-27T11:00:00.000Z"
      }
    ],
    "alerts": {
      "failedPayouts": [ { "id": "uuid", "amountUSDC": 2000.00, "failureReason": "M-Pesa timeout" } ],
      "expiringSoon": [ { "id": "uuid", "policyNumber": "POL-2026-X1Y2", "endDate": "2026-02-01T00:00:00.000Z" } ]
    }
  }
}
```

Activity types: `POLICY_CREATED`, `PAYOUT_COMPLETED`, `PAYOUT_FAILED`, `PAYOUT_INITIATED`, `FARMER_REGISTERED`

---

## 9. Organization Dashboard Endpoints

**Base path:** `/api/dashboard/org`
**Auth:** Bearer token + `ORG_ADMIN` or `ORG_STAFF` role (scoped to user's organization)

### GET `/api/dashboard/org/overview`

Organization-specific KPI cards.

**Query:** `period` | date range

**Response:** `200`
```json
{
  "success": true,
  "data": {
    "farmers": { "total": 1200 },
    "policies": {
      "active": 450,
      "periodNew": 85
    },
    "financials": {
      "totalPremiums": 445000.00,
      "totalPlatformFees": 22250.00,
      "totalPayouts": 120000.00,
      "totalPayoutCount": 100
    },
    "organization": {
      "poolAddress": "0xabc...",
      "totalPremiumsCollected": 445000.00,
      "totalPayoutsProcessed": 120000.00,
      "totalFeesGenerated": 22250.00
    },
    "period": { "start": "...", "end": "..." }
  }
}
```

### GET `/api/dashboard/org/farmers`

Paginated farmer table with filters.

**Query:** `period` | date range, `page`, `limit`, `kycStatus`, `county`, `search`

**Response:** `200` — Paginated farmers with `_count` for policies and plots.

### GET `/api/dashboard/org/farmers/analytics`

Farmer analytics for the organization.

**Query:** `period` | date range, `granularity`

**Response:** `200`
```json
{
  "success": true,
  "data": {
    "byKycStatus": { "APPROVED": 980, "PENDING": 200, "REJECTED": 20 },
    "byCounty": { "Nakuru": 500, "Kiambu": 350 },
    "growthTimeSeries": [ { "date": "2026-01-01", "farmersRegistered": 12 } ],
    "granularity": "daily"
  }
}
```

### GET `/api/dashboard/org/policies`

Policy breakdown with upcoming expirations.

**Query:** `period` | date range

**Response:** `200`
```json
{
  "success": true,
  "data": {
    "byStatus": { "ACTIVE": 450, "EXPIRED": 300 },
    "byCoverage": { "DROUGHT": 400, "FLOOD": 150, "BOTH": 100 },
    "byCropType": [ { "cropType": "MAIZE", "count": 320 } ],
    "expiringSoon": [ { "id": "uuid", "policyNumber": "...", "endDate": "...", "farmer": { ... }, "plot": { ... } } ],
    "recentlyActivated": [ ... ]
  }
}
```

### GET `/api/dashboard/org/policies/analytics`

Policy creation and premium time-series.

**Query:** `period` | date range, `granularity`

**Response:** `200`
```json
{
  "success": true,
  "data": {
    "timeSeries": [
      { "date": "2026-01-01", "policiesCreated": 5, "premiumsCollected": 12500.00 }
    ],
    "granularity": "daily"
  }
}
```

### GET `/api/dashboard/org/payouts`

Payout summary with pending and failed lists.

**Query:** `period` | date range, `granularity`

**Response:** `200`
```json
{
  "success": true,
  "data": {
    "summary": {
      "totalAmount": 120000.00,
      "avgAmount": 1200.00,
      "totalCount": 100
    },
    "byStatus": {
      "COMPLETED": { "count": 90, "totalAmount": 108000.00 },
      "FAILED": { "count": 5, "totalAmount": 6000.00 },
      "PENDING": { "count": 5, "totalAmount": 6000.00 }
    },
    "successRate": 90.0,
    "timeSeries": [ ... ],
    "pendingPayouts": [ ... ],
    "failedPayouts": [ ... ]
  }
}
```

### GET `/api/dashboard/org/damage-assessments`

Paginated damage assessments with heatmap data for map visualization.

**Query:** `period` | date range, `page`, `limit`

**Response:** `200`
```json
{
  "success": true,
  "data": [ ... ],
  "pagination": { ... },
  "heatmapData": [
    {
      "combinedDamage": 65.2,
      "triggered": true,
      "triggerDate": "2026-01-20T00:00:00.000Z",
      "latitude": -0.3031,
      "longitude": 36.0800,
      "cropType": "MAIZE",
      "name": "Main Farm"
    }
  ]
}
```

> **Frontend tip:** Use `heatmapData` to render a map with damage severity overlay. Color-code by `combinedDamage` (0-100 scale).

### GET `/api/dashboard/org/financials`

Financial overview with loss ratio.

**Query:** `period` | date range, `granularity`

**Response:** `200`
```json
{
  "success": true,
  "data": {
    "period": {
      "premiums": 85000.00,
      "payouts": 22000.00,
      "fees": 4250.00,
      "avgPremium": 2833.33,
      "policyCount": 30,
      "lossRatio": 0.259
    },
    "allTime": {
      "premiums": 445000.00,
      "payouts": 120000.00,
      "fees": 22250.00
    },
    "timeSeries": [
      { "date": "2026-01-01", "premiumsCollected": 5000.00, "payoutsAmount": 2000.00, "feesGenerated": 250.00 }
    ],
    "granularity": "daily"
  }
}
```

### GET `/api/dashboard/org/plots`

Paginated plots with latest environmental data.

**Query:** `page`, `limit`, `cropType` (optional filter)

**Response:** `200`
```json
{
  "success": true,
  "data": {
    "data": [
      {
        "id": "uuid",
        "name": "Main Farm",
        "latitude": -0.3031,
        "longitude": 36.0800,
        "acreage": 2.5,
        "cropType": "MAIZE",
        "farmer": { "firstName": "James", "lastName": "Mwangi" },
        "_count": { "policies": 3 },
        "latestWeather": {
          "temperature": 24.5,
          "rainfall": 12.3,
          "humidity": 65,
          "timestamp": "2026-01-27T06:00:00.000Z"
        },
        "latestSatellite": {
          "ndvi": 0.72,
          "captureDate": "2026-01-25T00:00:00.000Z"
        }
      }
    ],
    "cropDistribution": [
      { "cropType": "MAIZE", "count": 450, "totalAcreage": 1125.5 },
      { "cropType": "BEANS", "count": 200, "totalAcreage": 380.0 }
    ]
  },
  "pagination": { ... }
}
```

### GET `/api/dashboard/org/activity`

Recent organization activity feed.

**Query:** `limit` (default: 20, max: 100)

**Response:** `200`
```json
{
  "success": true,
  "data": {
    "activity": [
      {
        "type": "farmer_registered",
        "id": "uuid",
        "description": "James Mwangi registered (KYC: PENDING)",
        "timestamp": "2026-01-27T12:00:00.000Z",
        "data": { ... }
      },
      {
        "type": "policy_created",
        "id": "uuid",
        "description": "Policy POL-2026-A1B2 ACTIVE (2500.00 USDC)",
        "timestamp": "2026-01-27T11:00:00.000Z",
        "data": { ... }
      },
      {
        "type": "payout_initiated",
        "id": "uuid",
        "description": "Payout COMPLETED (3500.00 USDC)",
        "timestamp": "2026-01-27T10:00:00.000Z",
        "data": { ... }
      }
    ]
  }
}
```

---

## 10. Export Endpoints

**Base path:** `/api/export`
**Auth:** Bearer token

All export endpoints return CSV files with header:
```
Content-Type: text/csv
Content-Disposition: attachment; filename="<type>-2026-01-27.csv"
```

### Organization Exports (ORG_ADMIN)

**Query for all:** `period` | (`startDate` + `endDate`)

| Endpoint | CSV Columns |
|----------|-------------|
| `GET /api/export/farmers` | First Name, Last Name, Phone, National ID, County, Sub-County, Ward, Village, KYC Status, Plots, Policies, Created At |
| `GET /api/export/policies` | Policy Number, Farmer Name, Farmer Phone, Plot, Crop Type, Acreage, Coverage Type, Premium, Net Premium, Platform Fee, Status, Start Date, End Date, Created At |
| `GET /api/export/payouts` | Policy Number, Farmer Name, Farmer Phone, Amount USDC, Damage Percent, Status, MPESA Reference, TX Hash, Initiated At, Completed At, Failed At, Failure Reason |
| `GET /api/export/transactions` | Type, Amount, Status, Reference, TX Hash, Created At |

### Platform Exports (PLATFORM_ADMIN)

| Endpoint | CSV Columns |
|----------|-------------|
| `GET /api/export/platform/organizations` | Name, Type, Is Active, Contact Person, Contact Email, Farmers, Policies, Total Premiums, Total Payouts, Total Fees, Pool Address, Created At |
| `GET /api/export/platform/revenue` | Organization, Premium, Fee Amount, Fee Percentage, TX Hash, Collected At |

---

## Endpoint Summary

| Category | Count | Base Path | Auth |
|----------|-------|-----------|------|
| Auth | 4 | `/api/auth` | Public / Bearer |
| Platform Admin | 9 | `/api/platform` | PLATFORM_ADMIN |
| Organizations | 4 | `/api/organizations` | Bearer / API Key |
| Farmers | 7 | `/api/farmers` | ORG_ADMIN / ORG_STAFF |
| Policies | 8 | `/api/policies` | ORG_ADMIN / ORG_STAFF |
| Payouts | 5 | `/api/payouts` | ORG_ADMIN |
| Staff | 5 | `/api/staff` | ORG_ADMIN |
| Platform Dashboard | 9 | `/api/dashboard/platform` | PLATFORM_ADMIN |
| Org Dashboard | 10 | `/api/dashboard/org` | ORG_ADMIN / ORG_STAFF |
| Export | 6 | `/api/export` | ORG_ADMIN / PLATFORM_ADMIN |
| **Total** | **67** | | |
