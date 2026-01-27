import Joi from 'joi';

export const dateRangeSchema = Joi.object({
  period: Joi.string().valid('today', '7d', '30d', '90d', '1y').optional(),
  startDate: Joi.date().iso().optional(),
  endDate: Joi.date().iso().optional(),
})
  .oxor('period', 'startDate')
  .with('startDate', 'endDate');

export const paginatedDateRangeSchema = dateRangeSchema.keys({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(50),
});

export const granularitySchema = dateRangeSchema.keys({
  granularity: Joi.string().valid('daily', 'weekly', 'monthly').default('daily'),
});

export const activitySchema = Joi.object({
  limit: Joi.number().integer().min(1).max(100).default(20),
});

/**
 * Convert period/startDate+endDate query into Prisma-compatible { gte, lte } filter.
 */
export function buildDateFilter(query) {
  const now = new Date();
  let gte;
  let lte = now;

  if (query.startDate) {
    gte = new Date(query.startDate);
    lte = query.endDate ? new Date(query.endDate) : now;
  } else {
    const periods = { today: 0, '7d': 7, '30d': 30, '90d': 90, '1y': 365 };
    const days = periods[query.period] ?? 30;
    gte = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  }

  return { gte, lte };
}

/**
 * Aggregate daily stats into weekly or monthly buckets.
 */
export function aggregateTimeSeries(dailyData, granularity, dateField = 'date') {
  if (granularity === 'daily') return dailyData;

  const buckets = new Map();

  for (const row of dailyData) {
    const d = new Date(row[dateField]);
    let key;
    if (granularity === 'weekly') {
      const startOfWeek = new Date(d);
      startOfWeek.setDate(d.getDate() - d.getDay());
      key = startOfWeek.toISOString().split('T')[0];
    } else {
      key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
    }

    if (!buckets.has(key)) {
      buckets.set(key, { [dateField]: key });
    }

    const bucket = buckets.get(key);
    for (const [k, v] of Object.entries(row)) {
      if (k === dateField) continue;
      if (typeof v === 'number' || typeof v === 'bigint') {
        bucket[k] = (bucket[k] || 0) + Number(v);
      } else if (v && typeof v === 'object' && v.toNumber) {
        // Prisma Decimal
        bucket[k] = (bucket[k] || 0) + Number(v);
      }
    }
  }

  return Array.from(buckets.values());
}

/**
 * Convert groupBy results to a key-value map.
 */
export function groupByToMap(results, keyField, valueField = '_count') {
  const map = {};
  for (const row of results) {
    const key = row[keyField];
    map[key] = typeof valueField === 'string' ? row[valueField] : row._count?._all ?? row._count;
  }
  return map;
}
