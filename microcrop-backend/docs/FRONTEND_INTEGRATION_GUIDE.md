# Frontend Integration Guide - Pool & Liquidity Management

This guide provides step-by-step instructions for integrating the pool and liquidity management APIs into the frontend application.

---

## Table of Contents

1. [Authentication Setup](#authentication-setup)
2. [User Roles & Access](#user-roles--access)
3. [Insurance Company Dashboard](#insurance-company-dashboard)
4. [Platform Admin Dashboard](#platform-admin-dashboard)
5. [API Client Setup](#api-client-setup)
6. [Component Examples](#component-examples)
7. [Error Handling](#error-handling)
8. [Real-time Updates](#real-time-updates)

---

## Authentication Setup

All API calls require a JWT token in the Authorization header.

```typescript
// api/client.ts
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';

async function apiClient(endpoint: string, options: RequestInit = {}) {
  const token = localStorage.getItem('accessToken');

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'API request failed');
  }

  return response.json();
}

export default apiClient;
```

---

## User Roles & Access

| Role | Access Level |
|------|--------------|
| `PLATFORM_ADMIN` | Full access to all pools, treasury, organizations |
| `ORG_ADMIN` | Full access to their organization's pool |
| `ORG_STAFF` | Read-only access to pool status |

```typescript
// hooks/useAuth.ts
interface User {
  id: string;
  email: string;
  role: 'PLATFORM_ADMIN' | 'ORG_ADMIN' | 'ORG_STAFF' | 'FARMER';
  organizationId?: string;
}

function useAuth() {
  const [user, setUser] = useState<User | null>(null);

  const canManagePool = user?.role === 'ORG_ADMIN';
  const canViewPool = ['ORG_ADMIN', 'ORG_STAFF'].includes(user?.role || '');
  const isPlatformAdmin = user?.role === 'PLATFORM_ADMIN';

  return { user, canManagePool, canViewPool, isPlatformAdmin };
}
```

---

## Insurance Company Dashboard

### Pool Overview Component

This is the main component for insurance companies to view and manage their pool.

```tsx
// components/PoolDashboard.tsx
import { useState, useEffect } from 'react';
import apiClient from '@/api/client';

interface PoolStatus {
  poolAddress: string;
  poolValue: string;
  totalSupply: string;
  tokenPrice: string;
  totalPremiums: string;
  totalPayouts: string;
  activeExposure: string;
  depositsOpen: boolean;
  withdrawalsOpen: boolean;
  utilizationRate: number;
}

export function PoolDashboard() {
  const [pool, setPool] = useState<PoolStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchPoolStatus();
  }, []);

  async function fetchPoolStatus() {
    try {
      setLoading(true);
      const response = await apiClient('/organizations/me/pool');
      setPool(response.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorMessage message={error} />;
  if (!pool) return <NoPoolDeployed />;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {/* Pool Value Card */}
      <StatCard
        title="Pool Value"
        value={`$${formatNumber(pool.poolValue)}`}
        subtitle="Total USDC in pool"
      />

      {/* Token Price Card */}
      <StatCard
        title="Token Price"
        value={`$${pool.tokenPrice}`}
        subtitle="Current LP token price"
      />

      {/* Utilization Card */}
      <StatCard
        title="Utilization"
        value={`${pool.utilizationRate.toFixed(1)}%`}
        subtitle="Active exposure / Target capital"
      />

      {/* Premiums vs Payouts */}
      <StatCard
        title="Total Premiums"
        value={`$${formatNumber(pool.totalPremiums)}`}
        trend="up"
      />

      <StatCard
        title="Total Payouts"
        value={`$${formatNumber(pool.totalPayouts)}`}
        trend="down"
      />

      {/* Pool Status */}
      <div className="bg-white rounded-lg p-6 shadow">
        <h3 className="text-lg font-semibold mb-4">Pool Status</h3>
        <div className="space-y-2">
          <StatusBadge
            label="Deposits"
            active={pool.depositsOpen}
          />
          <StatusBadge
            label="Withdrawals"
            active={pool.withdrawalsOpen}
          />
        </div>
      </div>
    </div>
  );
}
```

### Deposit Liquidity Component

```tsx
// components/DepositForm.tsx
import { useState } from 'react';
import apiClient from '@/api/client';

interface DepositResult {
  txHash: string;
  tokensMinted: string;
  tokenPrice: string;
}

export function DepositForm({ onSuccess }: { onSuccess: () => void }) {
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DepositResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleDeposit(e: React.FormEvent) {
    e.preventDefault();

    if (!amount || parseFloat(amount) <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await apiClient('/organizations/me/pool/deposit', {
        method: 'POST',
        body: JSON.stringify({
          amount: parseFloat(amount),
          minTokensOut: 0,
        }),
      });

      setResult(response.data);
      setAmount('');
      onSuccess();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white rounded-lg p-6 shadow">
      <h3 className="text-lg font-semibold mb-4">Add Liquidity</h3>

      <form onSubmit={handleDeposit}>
        <div className="mb-4">
          <label className="block text-sm font-medium mb-2">
            Amount (USDC)
          </label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="10000"
            min="1"
            step="0.01"
            className="w-full px-4 py-2 border rounded-lg"
            disabled={loading}
          />
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-100 text-red-700 rounded">
            {error}
          </div>
        )}

        {result && (
          <div className="mb-4 p-3 bg-green-100 text-green-700 rounded">
            <p>Deposit successful!</p>
            <p className="text-sm">
              Tokens minted: {result.tokensMinted}
            </p>
            <a
              href={`https://sepolia.basescan.org/tx/${result.txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm underline"
            >
              View on BaseScan
            </a>
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Processing...' : 'Deposit USDC'}
        </button>
      </form>
    </div>
  );
}
```

### Withdraw Liquidity Component

```tsx
// components/WithdrawForm.tsx
import { useState } from 'react';
import apiClient from '@/api/client';

export function WithdrawForm({
  maxTokens,
  onSuccess
}: {
  maxTokens: string;
  onSuccess: () => void;
}) {
  const [tokenAmount, setTokenAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleWithdraw(e: React.FormEvent) {
    e.preventDefault();

    try {
      setLoading(true);
      setError(null);

      const response = await apiClient('/organizations/me/pool/withdraw', {
        method: 'POST',
        body: JSON.stringify({
          tokenAmount: parseFloat(tokenAmount),
          minUsdcOut: 0,
        }),
      });

      setResult(response.data);
      setTokenAmount('');
      onSuccess();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white rounded-lg p-6 shadow">
      <h3 className="text-lg font-semibold mb-4">Withdraw Liquidity</h3>

      <form onSubmit={handleWithdraw}>
        <div className="mb-4">
          <label className="block text-sm font-medium mb-2">
            LP Tokens to Burn
          </label>
          <input
            type="number"
            value={tokenAmount}
            onChange={(e) => setTokenAmount(e.target.value)}
            placeholder="1000"
            min="0.000001"
            step="0.000001"
            max={maxTokens}
            className="w-full px-4 py-2 border rounded-lg"
            disabled={loading}
          />
          <p className="text-sm text-gray-500 mt-1">
            Max: {maxTokens} tokens
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-100 text-red-700 rounded">
            {error}
          </div>
        )}

        {result && (
          <div className="mb-4 p-3 bg-green-100 text-green-700 rounded">
            <p>Withdrawal successful!</p>
            <p className="text-sm">
              USDC received: ${result.usdcReceived}
            </p>
            <a
              href={`https://sepolia.basescan.org/tx/${result.txHash}`}
              target="_blank"
              className="text-sm underline"
            >
              View on BaseScan
            </a>
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-orange-600 text-white py-2 rounded-lg hover:bg-orange-700 disabled:opacity-50"
        >
          {loading ? 'Processing...' : 'Withdraw USDC'}
        </button>
      </form>
    </div>
  );
}
```

### Pool Settings Component

```tsx
// components/PoolSettings.tsx
import { useState } from 'react';
import apiClient from '@/api/client';

interface PoolConfig {
  depositsOpen: boolean;
  withdrawalsOpen: boolean;
}

export function PoolSettings({
  initialConfig,
  onUpdate
}: {
  initialConfig: PoolConfig;
  onUpdate: () => void;
}) {
  const [config, setConfig] = useState(initialConfig);
  const [loading, setLoading] = useState(false);

  async function updateSettings(updates: Partial<PoolConfig>) {
    try {
      setLoading(true);

      await apiClient('/organizations/me/pool/settings', {
        method: 'PUT',
        body: JSON.stringify(updates),
      });

      setConfig({ ...config, ...updates });
      onUpdate();
    } catch (err) {
      alert('Failed to update settings: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white rounded-lg p-6 shadow">
      <h3 className="text-lg font-semibold mb-4">Pool Settings</h3>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">Accept Deposits</p>
            <p className="text-sm text-gray-500">
              Allow investors to add liquidity
            </p>
          </div>
          <Toggle
            enabled={config.depositsOpen}
            onChange={(enabled) => updateSettings({ depositsOpen: enabled })}
            disabled={loading}
          />
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">Allow Withdrawals</p>
            <p className="text-sm text-gray-500">
              Allow investors to remove liquidity
            </p>
          </div>
          <Toggle
            enabled={config.withdrawalsOpen}
            onChange={(enabled) => updateSettings({ withdrawalsOpen: enabled })}
            disabled={loading}
          />
        </div>
      </div>
    </div>
  );
}
```

### Depositor Whitelist Management

```tsx
// components/DepositorWhitelist.tsx
import { useState } from 'react';
import apiClient from '@/api/client';

export function DepositorWhitelist() {
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [depositors, setDepositors] = useState<string[]>([]);

  async function addDepositor(e: React.FormEvent) {
    e.preventDefault();

    if (!address.match(/^0x[a-fA-F0-9]{40}$/)) {
      alert('Please enter a valid Ethereum address');
      return;
    }

    try {
      setLoading(true);

      await apiClient('/organizations/me/pool/depositors', {
        method: 'POST',
        body: JSON.stringify({ depositorAddress: address }),
      });

      setDepositors([...depositors, address]);
      setAddress('');
    } catch (err) {
      alert('Failed to add depositor: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  async function removeDepositor(addr: string) {
    if (!confirm('Remove this depositor from whitelist?')) return;

    try {
      await apiClient(`/organizations/me/pool/depositors/${addr}`, {
        method: 'DELETE',
      });

      setDepositors(depositors.filter(d => d !== addr));
    } catch (err) {
      alert('Failed to remove depositor: ' + err.message);
    }
  }

  return (
    <div className="bg-white rounded-lg p-6 shadow">
      <h3 className="text-lg font-semibold mb-4">Depositor Whitelist</h3>
      <p className="text-sm text-gray-500 mb-4">
        Only whitelisted addresses can deposit to private pools.
      </p>

      <form onSubmit={addDepositor} className="flex gap-2 mb-4">
        <input
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="0x..."
          className="flex-1 px-4 py-2 border rounded-lg"
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 bg-green-600 text-white rounded-lg"
        >
          Add
        </button>
      </form>

      <ul className="space-y-2">
        {depositors.map((addr) => (
          <li key={addr} className="flex items-center justify-between p-2 bg-gray-50 rounded">
            <code className="text-sm">{addr}</code>
            <button
              onClick={() => removeDepositor(addr)}
              className="text-red-600 text-sm"
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

---

## Platform Admin Dashboard

### All Pools Overview

```tsx
// components/admin/PoolsOverview.tsx
import { useState, useEffect } from 'react';
import apiClient from '@/api/client';

interface Pool {
  address: string;
  name: string;
  symbol: string;
  poolType: number;
  poolValue: string;
  utilizationRate: number;
}

const POOL_TYPES = ['PUBLIC', 'PRIVATE', 'MUTUAL'];

export function PoolsOverview() {
  const [pools, setPools] = useState<Pool[]>([]);
  const [counts, setCounts] = useState({ total: 0, public: 0, private: 0, mutual: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [poolsRes, countsRes] = await Promise.all([
          apiClient('/platform/pools'),
          apiClient('/platform/pools/counts'),
        ]);

        setPools(poolsRes.data.pools);
        setCounts(countsRes.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard title="Total Pools" value={counts.total} />
        <StatCard title="Public Pools" value={counts.public} />
        <StatCard title="Private Pools" value={counts.private} />
        <StatCard title="Mutual Pools" value={counts.mutual} />
      </div>

      {/* Pools Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left">Pool</th>
              <th className="px-6 py-3 text-left">Type</th>
              <th className="px-6 py-3 text-right">Value</th>
              <th className="px-6 py-3 text-right">Utilization</th>
              <th className="px-6 py-3 text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            {pools.map((pool) => (
              <tr key={pool.address} className="border-t">
                <td className="px-6 py-4">
                  <div>
                    <p className="font-medium">{pool.name}</p>
                    <code className="text-xs text-gray-500">
                      {pool.address.slice(0, 10)}...
                    </code>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 rounded text-xs ${
                    pool.poolType === 0 ? 'bg-green-100 text-green-800' :
                    pool.poolType === 1 ? 'bg-blue-100 text-blue-800' :
                    'bg-purple-100 text-purple-800'
                  }`}>
                    {POOL_TYPES[pool.poolType]}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  ${formatNumber(pool.poolValue)}
                </td>
                <td className="px-6 py-4 text-right">
                  {pool.utilizationRate.toFixed(1)}%
                </td>
                <td className="px-6 py-4 text-center">
                  <a
                    href={`/admin/pools/${pool.address}`}
                    className="text-blue-600 hover:underline"
                  >
                    View
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

### Treasury Dashboard

```tsx
// components/admin/TreasuryDashboard.tsx
import { useState, useEffect } from 'react';
import apiClient from '@/api/client';

interface TreasuryStats {
  balance: string;
  totalPremiums: string;
  totalPayouts: string;
  accumulatedFees: string;
  platformFeePercent: number;
  reserveRatio: number;
  meetsReserve: boolean;
}

export function TreasuryDashboard() {
  const [stats, setStats] = useState<TreasuryStats | null>(null);

  useEffect(() => {
    apiClient('/platform/treasury')
      .then(res => setStats(res.data))
      .catch(console.error);
  }, []);

  if (!stats) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Platform Treasury</h2>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          title="Balance"
          value={`$${formatNumber(stats.balance)}`}
        />
        <StatCard
          title="Total Premiums"
          value={`$${formatNumber(stats.totalPremiums)}`}
        />
        <StatCard
          title="Total Payouts"
          value={`$${formatNumber(stats.totalPayouts)}`}
        />
        <StatCard
          title="Accumulated Fees"
          value={`$${formatNumber(stats.accumulatedFees)}`}
        />
      </div>

      <div className="bg-white rounded-lg p-6 shadow">
        <h3 className="font-semibold mb-4">Reserve Status</h3>
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <div className="h-4 bg-gray-200 rounded-full overflow-hidden">
              <div
                className={`h-full ${stats.meetsReserve ? 'bg-green-500' : 'bg-red-500'}`}
                style={{ width: `${Math.min(stats.reserveRatio, 100)}%` }}
              />
            </div>
          </div>
          <span className={`font-medium ${stats.meetsReserve ? 'text-green-600' : 'text-red-600'}`}>
            {stats.reserveRatio}%
          </span>
        </div>
        <p className="text-sm text-gray-500 mt-2">
          {stats.meetsReserve
            ? 'Reserve requirements met'
            : 'Warning: Below minimum reserve'}
        </p>
      </div>
    </div>
  );
}
```

### Deploy Pool for Organization

```tsx
// components/admin/DeployPoolForm.tsx
import { useState } from 'react';
import apiClient from '@/api/client';

interface DeployPoolFormProps {
  organizationId: string;
  organizationName: string;
  onSuccess: () => void;
}

export function DeployPoolForm({
  organizationId,
  organizationName,
  onSuccess
}: DeployPoolFormProps) {
  const [formData, setFormData] = useState({
    name: `${organizationName} Risk Pool`,
    symbol: 'POOL',
    poolType: 'PRIVATE',
    coverageType: 4,
    region: 'Africa',
    minDeposit: 100,
    maxDeposit: 1000000,
    targetCapital: 100000,
    maxCapital: 200000,
  });
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    try {
      setLoading(true);

      await apiClient(`/platform/organizations/${organizationId}/deploy-pool`, {
        method: 'POST',
        body: JSON.stringify(formData),
      });

      alert('Pool deployed successfully!');
      onSuccess();
    } catch (err) {
      alert('Failed to deploy pool: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Pool Name</label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="w-full px-3 py-2 border rounded"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Symbol</label>
          <input
            type="text"
            value={formData.symbol}
            onChange={(e) => setFormData({ ...formData, symbol: e.target.value })}
            className="w-full px-3 py-2 border rounded"
            maxLength={10}
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Pool Type</label>
          <select
            value={formData.poolType}
            onChange={(e) => setFormData({ ...formData, poolType: e.target.value })}
            className="w-full px-3 py-2 border rounded"
          >
            <option value="PRIVATE">Private (Whitelisted)</option>
            <option value="PUBLIC">Public (Open)</option>
            <option value="MUTUAL">Mutual (Cooperative)</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Region</label>
          <input
            type="text"
            value={formData.region}
            onChange={(e) => setFormData({ ...formData, region: e.target.value })}
            className="w-full px-3 py-2 border rounded"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Target Capital (USDC)</label>
          <input
            type="number"
            value={formData.targetCapital}
            onChange={(e) => setFormData({ ...formData, targetCapital: Number(e.target.value) })}
            className="w-full px-3 py-2 border rounded"
            min={1000}
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Max Capital (USDC)</label>
          <input
            type="number"
            value={formData.maxCapital}
            onChange={(e) => setFormData({ ...formData, maxCapital: Number(e.target.value) })}
            className="w-full px-3 py-2 border rounded"
            min={1000}
            required
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? 'Deploying...' : 'Deploy Pool'}
      </button>
    </form>
  );
}
```

---

## API Client Setup

### TypeScript Types

```typescript
// types/pool.ts
export interface PoolStatus {
  poolAddress: string;
  poolValue: string;
  totalSupply: string;
  tokenPrice: string;
  totalPremiums: string;
  totalPayouts: string;
  activeExposure: string;
  minDeposit: string;
  maxDeposit: string;
  targetCapital: string;
  maxCapital: string;
  depositsOpen: boolean;
  withdrawalsOpen: boolean;
  paused: boolean;
  utilizationRate: number;
}

export interface DepositResult {
  txHash: string;
  blockNumber: number;
  tokensMinted: string;
  tokenPrice: string;
}

export interface WithdrawResult {
  txHash: string;
  blockNumber: number;
  usdcReceived: string;
}

export interface InvestorInfo {
  deposited: string;
  tokensHeld: string;
  currentValue: string;
  roi: number;
}

export interface TreasuryStats {
  balance: string;
  totalPremiums: string;
  totalPayouts: string;
  accumulatedFees: string;
  platformFeePercent: number;
  reserveRatio: number;
  requiredReserve: string;
  availableForPayouts: string;
  meetsReserve: boolean;
  paused: boolean;
}
```

### API Service

```typescript
// services/poolService.ts
import apiClient from '@/api/client';
import type { PoolStatus, DepositResult, WithdrawResult, InvestorInfo } from '@/types/pool';

export const poolService = {
  // Organization Pool
  async getPoolStatus(): Promise<PoolStatus> {
    const response = await apiClient('/organizations/me/pool');
    return response.data;
  },

  async getPoolDetails(): Promise<PoolStatus> {
    const response = await apiClient('/organizations/me/pool/details');
    return response.data;
  },

  async getInvestorInfo(investorAddress: string): Promise<InvestorInfo> {
    const response = await apiClient(`/organizations/me/pool/investor/${investorAddress}`);
    return response.data;
  },

  async deposit(amount: number): Promise<DepositResult> {
    const response = await apiClient('/organizations/me/pool/deposit', {
      method: 'POST',
      body: JSON.stringify({ amount, minTokensOut: 0 }),
    });
    return response.data;
  },

  async withdraw(tokenAmount: number): Promise<WithdrawResult> {
    const response = await apiClient('/organizations/me/pool/withdraw', {
      method: 'POST',
      body: JSON.stringify({ tokenAmount, minUsdcOut: 0 }),
    });
    return response.data;
  },

  async addDepositor(depositorAddress: string): Promise<{ txHash: string }> {
    const response = await apiClient('/organizations/me/pool/depositors', {
      method: 'POST',
      body: JSON.stringify({ depositorAddress }),
    });
    return response.data;
  },

  async removeDepositor(depositorAddress: string): Promise<{ txHash: string }> {
    const response = await apiClient(`/organizations/me/pool/depositors/${depositorAddress}`, {
      method: 'DELETE',
    });
    return response.data;
  },

  async updateSettings(settings: { depositsOpen?: boolean; withdrawalsOpen?: boolean }) {
    const response = await apiClient('/organizations/me/pool/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
    return response.data;
  },

  // Platform Admin
  async getAllPools() {
    const response = await apiClient('/platform/pools');
    return response.data;
  },

  async getPoolCounts() {
    const response = await apiClient('/platform/pools/counts');
    return response.data;
  },

  async getPoolByAddress(address: string) {
    const response = await apiClient(`/platform/pools/address/${address}`);
    return response.data;
  },

  async getTreasuryStats() {
    const response = await apiClient('/platform/treasury');
    return response.data;
  },
};
```

---

## Error Handling

```typescript
// utils/errorHandler.ts
export function handleApiError(error: any): string {
  // Common blockchain errors
  const errorMessages: Record<string, string> = {
    'DepositsNotOpen': 'This pool is not accepting deposits at the moment.',
    'WithdrawalsNotOpen': 'This pool is not allowing withdrawals at the moment.',
    'InsufficientLiquidity': 'Not enough funds in the pool for this operation.',
    'BelowMinimumDeposit': 'The deposit amount is below the minimum required.',
    'ExceedsMaximumDeposit': 'The deposit amount exceeds the maximum allowed.',
    'NotAuthorized': 'You do not have permission to perform this action.',
    'Organization not found': 'Organization not found.',
    'Organization does not have a deployed pool': 'No pool has been deployed for this organization yet.',
    'Organization already has a deployed pool': 'This organization already has a pool.',
  };

  const message = error.message || error;

  for (const [key, value] of Object.entries(errorMessages)) {
    if (message.includes(key)) {
      return value;
    }
  }

  return message || 'An unexpected error occurred. Please try again.';
}
```

---

## Real-time Updates

For real-time pool updates, consider polling or WebSocket integration:

```typescript
// hooks/usePoolStatus.ts
import { useState, useEffect } from 'react';
import { poolService } from '@/services/poolService';
import type { PoolStatus } from '@/types/pool';

export function usePoolStatus(refreshInterval = 30000) {
  const [pool, setPool] = useState<PoolStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      const data = await poolService.getPoolStatus();
      setPool(data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();

    // Poll for updates
    const interval = setInterval(refresh, refreshInterval);
    return () => clearInterval(interval);
  }, [refreshInterval]);

  return { pool, loading, error, refresh };
}
```

---

## Page Structure Recommendation

```
/dashboard
  /pool                    # Organization pool dashboard
    - Overview stats
    - Deposit form
    - Withdraw form
    - Settings
    - Depositor whitelist (private pools)

/admin
  /pools                   # Platform admin - all pools
    - List all pools
    - Pool counts by type

  /pools/[address]         # Single pool details
    - Full pool details

  /organizations/[id]/pool # Deploy pool for org
    - Deploy pool form

  /treasury                # Platform treasury
    - Treasury stats
    - Reserve status
```

---

## Quick Reference

| Action | Endpoint | Method |
|--------|----------|--------|
| Get pool status | `/organizations/me/pool` | GET |
| Get pool details | `/organizations/me/pool/details` | GET |
| Deposit USDC | `/organizations/me/pool/deposit` | POST |
| Withdraw USDC | `/organizations/me/pool/withdraw` | POST |
| Add depositor | `/organizations/me/pool/depositors` | POST |
| Remove depositor | `/organizations/me/pool/depositors/:addr` | DELETE |
| Update settings | `/organizations/me/pool/settings` | PUT |
| List all pools | `/platform/pools` | GET |
| Get pool counts | `/platform/pools/counts` | GET |
| Get treasury | `/platform/treasury` | GET |
| Deploy pool | `/platform/organizations/:id/deploy-pool` | POST |
