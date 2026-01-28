# Frontend Build Prompt — MicroCrop Dashboard

Use this prompt with your AI coding assistant or hand it to your frontend developer.

---

## Prompt

You are building the MicroCrop dashboard frontend — a multi-tenant B2B platform for parametric crop insurance in Africa. The backend API is fully built (see API_DOCUMENTATION.md in this repo for all 67 endpoints with request/response schemas).

### Stack

- **Framework:** Next.js 14+ (App Router)
- **Language:** TypeScript
- **UI:** Tailwind CSS + shadcn/ui components
- **Charts:** Recharts (time-series, bar, pie, area charts)
- **Maps:** Mapbox GL JS or Leaflet (for plot locations and damage heatmaps)
- **Tables:** TanStack Table (sortable, filterable, paginated)
- **Forms:** React Hook Form + Zod validation
- **State:** Zustand for global state (auth, org context)
- **HTTP:** Axios with interceptors for JWT refresh
- **Date handling:** date-fns

### Architecture

```
src/
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   └── layout.tsx
│   ├── (platform)/                    # Platform Admin views
│   │   ├── dashboard/page.tsx
│   │   ├── organizations/
│   │   │   ├── page.tsx               # Org table
│   │   │   └── [orgId]/
│   │   │       ├── page.tsx           # Org deep-dive
│   │   │       └── onboarding/page.tsx
│   │   ├── analytics/
│   │   │   ├── revenue/page.tsx
│   │   │   ├── policies/page.tsx
│   │   │   ├── farmers/page.tsx
│   │   │   ├── payouts/page.tsx
│   │   │   └── damage/page.tsx
│   │   ├── activity/page.tsx
│   │   └── layout.tsx                 # Platform sidebar layout
│   ├── (org)/                         # Organization Admin views
│   │   ├── dashboard/page.tsx
│   │   ├── farmers/
│   │   │   ├── page.tsx               # Farmer table
│   │   │   ├── analytics/page.tsx
│   │   │   ├── import/page.tsx        # Bulk import UI
│   │   │   └── [farmerId]/page.tsx
│   │   ├── policies/
│   │   │   ├── page.tsx               # Policy table
│   │   │   ├── analytics/page.tsx
│   │   │   ├── new/page.tsx           # Quote + purchase flow
│   │   │   └── [policyId]/page.tsx
│   │   ├── payouts/
│   │   │   ├── page.tsx               # Payout table
│   │   │   └── reconciliation/page.tsx
│   │   ├── plots/page.tsx             # Plot map + table
│   │   ├── damage/page.tsx            # Assessments + heatmap
│   │   ├── financials/page.tsx
│   │   ├── pool/page.tsx              # Liquidity management
│   │   ├── staff/page.tsx             # Staff management
│   │   ├── export/page.tsx            # Data export
│   │   ├── activity/page.tsx
│   │   └── layout.tsx                 # Org sidebar layout
│   └── layout.tsx                     # Root layout
├── components/
│   ├── ui/                            # shadcn/ui primitives
│   ├── charts/
│   │   ├── time-series-chart.tsx
│   │   ├── pie-chart.tsx
│   │   ├── bar-chart.tsx
│   │   └── stat-card.tsx
│   ├── tables/
│   │   ├── data-table.tsx             # Reusable TanStack wrapper
│   │   ├── farmer-columns.tsx
│   │   ├── policy-columns.tsx
│   │   ├── payout-columns.tsx
│   │   └── org-columns.tsx
│   ├── maps/
│   │   ├── plot-map.tsx
│   │   └── damage-heatmap.tsx
│   ├── forms/
│   │   ├── farmer-form.tsx
│   │   ├── bulk-import-form.tsx
│   │   ├── policy-quote-form.tsx
│   │   ├── staff-invite-form.tsx
│   │   └── cancel-policy-dialog.tsx
│   ├── layout/
│   │   ├── platform-sidebar.tsx
│   │   ├── org-sidebar.tsx
│   │   ├── header.tsx
│   │   └── date-range-picker.tsx
│   └── shared/
│       ├── status-badge.tsx
│       ├── activity-feed.tsx
│       ├── alert-banner.tsx
│       └── empty-state.tsx
├── lib/
│   ├── api.ts                         # Axios instance + interceptors
│   ├── auth.ts                        # Login, refresh, logout
│   └── utils.ts                       # Formatters (currency, date, percent)
├── hooks/
│   ├── use-auth.ts
│   ├── use-date-range.ts
│   └── use-debounce.ts
├── stores/
│   ├── auth-store.ts                  # User + tokens
│   └── org-store.ts                   # Current org context
└── types/
    ├── api.ts                         # All API response types
    ├── farmer.ts
    ├── policy.ts
    ├── payout.ts
    └── organization.ts
```

### Auth Flow

1. Login page sends `POST /api/auth/login` with email + password
2. Store `accessToken` and `refreshToken` in Zustand (persisted to localStorage)
3. Axios interceptor attaches `Authorization: Bearer <token>` to all requests
4. On 401 response, interceptor calls `POST /api/auth/refresh` with refresh token
5. If refresh fails, redirect to login
6. After login, call `GET /api/auth/me` to get user profile
7. Route based on `user.role`:
   - `PLATFORM_ADMIN` → `/platform/dashboard`
   - `ORG_ADMIN` or `ORG_STAFF` → `/org/dashboard`

### Page-by-Page Requirements

#### Platform Admin Dashboard (`/platform/dashboard`)

**API:** `GET /api/dashboard/platform/overview`

Build a KPI card grid (4 columns on desktop, 2 on tablet, 1 on mobile):

| Card | Value | Sub-text |
|------|-------|----------|
| Organizations | `organizations.total` | `organizations.active` active |
| Total Farmers | `farmers.total` | — |
| Active Policies | `policies.active` | `policies.periodNew` new this period |
| Revenue | `financials.totalRevenue` | formatted as USD |
| Premiums Collected | `financials.totalPremiums` | formatted as USD |
| Payouts Sent | `financials.totalPayouts` | `financials.totalPayoutCount` payouts |

Add a `<DateRangePicker>` in the top-right that sets `period` or `startDate`/`endDate` query params. Default to `30d`.

Below the KPIs, show a mini activity feed (last 5 items from `GET /api/dashboard/platform/activity`) and alert banners for failed payouts and expiring policies.

#### Platform Organizations Page (`/platform/organizations`)

**API:** `GET /api/dashboard/platform/organizations`

Full-page data table with:
- Columns: Name, Type, Status (badge), Farmers, Policies, Payouts, Users, Created
- Filters: Type dropdown, Active/Inactive toggle, Search input
- Pagination: page + limit controls
- Row click → navigate to `/platform/organizations/[orgId]`

#### Platform Org Deep-Dive (`/platform/organizations/[orgId]`)

**API:** `GET /api/dashboard/platform/organizations/:orgId/metrics`

Layout:
- Top: Org name + type badge + active status
- KPI row: Farmers, Policies, Premiums, Payouts, Fees, Loss Ratio
- Two-column grid:
  - Left: Farmers by KYC (pie chart), Policies by Status (pie chart)
  - Right: Policies by Coverage (bar chart), Payouts by Status (bar chart)
- Bottom: Recent Policies table (5 rows) + Recent Payouts table (5 rows)

Also include a tab or link to onboarding status:

**API:** `GET /api/platform/organizations/:orgId/onboarding-status`

Render as a stepper/checklist component showing 6 steps: Registered → Configured → Pool Deployed → Funded → Staff Invited → Activated. Highlight the current `nextStep`.

#### Platform Analytics Pages (`/platform/analytics/*`)

Each page follows the same pattern:
1. `<DateRangePicker>` + `<GranularitySelect>` (Daily/Weekly/Monthly) at the top
2. Summary KPI cards
3. Time-series area/line chart (primary visualization)
4. Breakdown section (pie or bar charts)

| Page | API | Primary Chart | Breakdown |
|------|-----|--------------|-----------|
| Revenue | `GET /api/dashboard/platform/analytics/revenue` | Revenue over time (fees, premiums, payouts as stacked area) | Revenue by Organization (horizontal bar) |
| Policies | `GET /api/dashboard/platform/analytics/policies` | Policies created over time | By Status (donut), By Coverage (bar), Claims Ratio (gauge or big number) |
| Farmers | `GET /api/dashboard/platform/analytics/farmers` | Farmer registrations over time | By KYC Status (donut), By County (horizontal bar) |
| Payouts | `GET /api/dashboard/platform/analytics/payouts` | Payouts over time (count + amount dual axis) | By Status (donut), Success Rate (big number + progress bar) |
| Damage | `GET /api/dashboard/platform/analytics/damage-assessments` | Summary stats (avg weather/satellite/combined) | Trigger rate (big number), Paginated assessments table |

#### Org Dashboard (`/org/dashboard`)

**API:** `GET /api/dashboard/org/overview`

Same KPI card pattern as platform but org-scoped:
- Total Farmers, Active Policies, New Policies (period), Premiums, Payouts, Fees
- Show `organization.poolAddress` as a truncated link to Base block explorer
- Mini activity feed from `GET /api/dashboard/org/activity`

#### Org Farmers Page (`/org/farmers`)

**API:** `GET /api/dashboard/org/farmers`

Data table with:
- Columns: Name, Phone, National ID, County, KYC Status (badge), Plots, Policies, Created
- Filters: KYC Status dropdown, County dropdown, Search input
- Row actions: View, Edit KYC
- Bulk actions: Export CSV button (calls `GET /api/export/farmers`)

**KYC Status badges:**
- `PENDING` → yellow
- `APPROVED` → green
- `REJECTED` → red

#### Org Farmer Import (`/org/farmers/import`)

**API:** `POST /api/farmers/bulk-import` and `POST /api/farmers/bulk-import/plots`

Two-tab interface:
1. **Import Farmers:** JSON textarea or CSV file upload (parse client-side to JSON). Show validation preview before submitting. After submit, show results: imported count (green), skipped (yellow), errors table (red) with row number, field, and message.
2. **Import Plots:** Same pattern but for plots. Requires farmer phone to link.

Max 500 items per import. Show a progress indicator during upload.

#### Org Policies Page (`/org/policies`)

**API:** `GET /api/dashboard/org/policies`

Dashboard-style page:
- Top row: Status breakdown (horizontal bar or stat cards for ACTIVE, EXPIRED, CANCELLED, CLAIMED)
- Coverage type breakdown (pie chart)
- Crop type breakdown (bar chart from `byCropType`)
- "Expiring Soon" table (policies expiring within 14 days) — show farmer name, crop, end date
- "Recently Activated" table

#### Org New Policy (`/org/policies/new`)

Two-step flow:
1. **Quote:** Form with farmer select, plot select, sum insured input, coverage type select, duration slider (30-365 days). Submit to `POST /api/policies/quote`. Display premium breakdown.
2. **Purchase:** Confirm button that calls `POST /api/policies/purchase`. Show payment instructions with M-Pesa details.

#### Org Payouts Page (`/org/payouts`)

**API:** `GET /api/dashboard/org/payouts`

- Summary KPIs: Total Amount, Avg Amount, Total Count, Success Rate
- Status breakdown (bar chart)
- Time-series chart (payouts over time)
- Two tables:
  - "Pending Payouts" — with a "Retry" button on each row
  - "Failed Payouts" — with individual retry + "Retry All Failed" bulk button
- Retry calls `POST /api/payouts/:payoutId/retry` or `POST /api/payouts/batch-retry`

#### Org Damage Assessments (`/org/damage`)

**API:** `GET /api/dashboard/org/damage-assessments`

Split view:
- Left: Paginated table of assessments (policy number, combined damage %, triggered status, date)
- Right: Interactive map using `heatmapData` array. Each point is a plot location color-coded by `combinedDamage`:
  - 0-30: green (healthy)
  - 30-60: yellow (moderate damage)
  - 60-100: red (severe damage)
- Clicking a map point shows a popup with plot name, crop type, damage score, trigger status

#### Org Financials (`/org/financials`)

**API:** `GET /api/dashboard/org/financials`

- Top: Period financials as KPI cards (Premiums, Payouts, Fees, Loss Ratio, Avg Premium, Policy Count)
- Middle: Stacked area chart showing premiums vs payouts over time (from `timeSeries`)
- Bottom: All-time totals in a summary row
- Loss ratio visualization: if < 0.5 show green, 0.5-0.8 yellow, > 0.8 red

#### Org Pool / Liquidity (`/org/pool`)

**API:** `GET /api/organizations/me/pool`

- Pool address (linked to Base block explorer: `https://basescan.org/address/{poolAddress}`)
- Balance (big number)
- Utilization rate (progress bar or gauge chart)
- Breakdown cards: Capital Deposited, Premiums Received, Payouts Sent, Fees Paid
- Available for Withdrawal = Balance - pending obligations

#### Org Plots Page (`/org/plots`)

**API:** `GET /api/dashboard/org/plots`

Two-panel layout:
- Left: Interactive map with all plot locations as markers. Marker popup shows: plot name, farmer name, crop type, acreage, latest NDVI, latest weather
- Right: Data table with columns: Plot Name, Farmer, Crop, Acreage, Policies, Latest NDVI, Latest Temp
- Top filter: Crop type dropdown
- Bottom: Crop distribution chart (bar chart showing count + total acreage per crop)

#### Org Staff Page (`/org/staff`)

**APIs:** `GET /api/staff`, `POST /api/staff/invite`, `PUT /api/staff/:userId/role`, `PUT /api/staff/:userId/deactivate`, `PUT /api/staff/:userId/reactivate`

- Table: Name, Email, Role (badge), Active Status, Last Login
- "Invite Staff" button → opens dialog with form (email, firstName, lastName, phone, role select)
- Row actions dropdown: Change Role, Deactivate/Reactivate
- Role badges: `ORG_ADMIN` → purple, `ORG_STAFF` → blue

#### Org Export Page (`/org/export`)

**APIs:** `GET /api/export/farmers`, `/policies`, `/payouts`, `/transactions`

Card grid with 4 export options. Each card has:
- Title (Farmers, Policies, Payouts, Transactions)
- Description of what's included
- Date range picker
- "Download CSV" button
- Button triggers API call → browser downloads the CSV file

Handle CSV download:
```typescript
const response = await api.get('/export/farmers', {
  params: { period: '30d' },
  responseType: 'blob'
});
const url = window.URL.createObjectURL(response.data);
const a = document.createElement('a');
a.href = url;
a.download = `farmers-${new Date().toISOString().split('T')[0]}.csv`;
a.click();
```

### Reusable Components

#### `<DateRangePicker>`
- Preset buttons: Today, 7D, 30D, 90D, 1Y
- Custom range: two date inputs
- Emits `{ period }` or `{ startDate, endDate }` to parent
- Used on every analytics page

#### `<GranularitySelect>`
- Three toggle buttons: Daily | Weekly | Monthly
- Only shown on time-series pages

#### `<StatCard>`
- Props: `title`, `value`, `subtitle`, `trend` (up/down arrow + percentage), `icon`
- Green/red trend indicators

#### `<StatusBadge>`
- Maps status strings to colors:
  - `ACTIVE` → green, `PENDING` → yellow, `EXPIRED` → gray
  - `COMPLETED` → green, `FAILED` → red, `CANCELLED` → gray
  - `APPROVED` → green, `REJECTED` → red

#### `<ActivityFeed>`
- Props: `items` array with `{ type, description, timestamp, data }`
- Icon per type: farmer (user icon), policy (shield), payout (dollar)
- Relative timestamps ("2 hours ago")

#### `<DataTable>`
- Wraps TanStack Table
- Props: `columns`, `data`, `pagination`, `onPageChange`, `onSearch`, `filters`
- Built-in empty state, loading skeleton, and column sorting

### Design Guidelines

- **Colors:** Use a professional green palette (agriculture theme). Primary: `#16a34a` (green-600). Accent: `#2563eb` (blue-600).
- **Dark mode:** Support via Tailwind's `dark:` classes and a toggle in the header.
- **Responsive:** Sidebar collapses to hamburger on mobile. Charts stack vertically. Tables become card views on small screens.
- **Loading states:** Skeleton loaders for cards and tables. Spinner for form submissions.
- **Empty states:** Friendly illustrations with action prompts ("No farmers yet. Import your first batch.")
- **Toasts:** Success/error notifications for all mutations (create, update, retry, import).

### API Connection

Base URL from environment variable:
```
NEXT_PUBLIC_API_URL=http://localhost:3000
```

Axios instance (`lib/api.ts`):
```typescript
import axios from 'axios';

const api = axios.create({
  baseURL: `${process.env.NEXT_PUBLIC_API_URL}/api`,
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    if (error.response?.status === 401) {
      // Try refresh token, redirect to login if that fails
    }
    return Promise.reject(error);
  }
);

export default api;
```

### Key Formatting Utilities

```typescript
// Currency (USDC amounts)
export const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

// Percentage
export const formatPercent = (value: number) =>
  `${(value * 100).toFixed(1)}%`;

// Truncate address
export const truncateAddress = (addr: string) =>
  `${addr.slice(0, 6)}...${addr.slice(-4)}`;

// Relative time
export const timeAgo = (date: string) =>
  formatDistanceToNow(new Date(date), { addSuffix: true });
```

### Build Order

1. **Auth:** Login page, auth store, API interceptors, protected route wrapper
2. **Layout:** Sidebar navigation (platform + org variants), header with user menu
3. **Shared components:** StatCard, StatusBadge, DateRangePicker, DataTable, ActivityFeed
4. **Platform dashboard:** Overview page with KPI cards
5. **Platform organizations:** Table page + org deep-dive
6. **Platform analytics:** Revenue, Policies, Farmers, Payouts, Damage (all follow same pattern)
7. **Org dashboard:** Overview page
8. **Org farmers:** Table + analytics + bulk import
9. **Org policies:** Dashboard + new policy flow (quote → purchase)
10. **Org payouts:** Dashboard + retry functionality
11. **Org operational pages:** Plots (map), Damage (heatmap), Financials, Pool, Staff, Export
12. **Polish:** Dark mode, responsive, loading/empty states, error handling, toasts

Refer to API_DOCUMENTATION.md for all endpoint details, request schemas, and response structures.
