import crypto from 'crypto';
import { TLU_FACTORS, IBLI_SEASONS } from './ibli.constants.js';

export function normalizePhone(phone) {
  let cleaned = phone.replace(/\s+/g, '').replace(/-/g, '');
  if (cleaned.startsWith('0')) {
    cleaned = '+254' + cleaned.slice(1);
  } else if (cleaned.startsWith('254') && !cleaned.startsWith('+')) {
    cleaned = '+' + cleaned;
  }
  return cleaned;
}

export function generateApiKey() {
  return `org_live_${crypto.randomBytes(32).toString('hex')}`;
}

export function generateApiSecret() {
  return crypto.randomBytes(48).toString('hex');
}

export function generatePolicyNumber() {
  const year = new Date().getFullYear();
  const random = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `POL-${year}-${random}`;
}

export function paginate(page = 1, limit = 50) {
  const p = Math.max(1, parseInt(page, 10) || 1);
  const l = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
  return { skip: (p - 1) * l, take: l, page: p, limit: l };
}

export function formatPaginatedResponse(data, total, page, limit) {
  return {
    success: true,
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export function formatResponse(data) {
  return { success: true, data };
}

// ============================================
// IBLI Helpers
// ============================================

export function calculateTLU(livestockType, headCount) {
  const factor = TLU_FACTORS[livestockType];
  if (!factor) throw new Error(`Unknown livestock type: ${livestockType}`);
  return parseFloat((headCount * factor).toFixed(2));
}

export function getCurrentSeason(date = new Date()) {
  const month = date.getMonth() + 1; // 1-indexed
  if (month >= 3 && month <= 9) return 'LRLD';
  return 'SRSD';
}

export function getSeasonDates(season, year) {
  const cfg = IBLI_SEASONS[season];
  if (!cfg) throw new Error(`Unknown IBLI season: ${season}`);

  if (season === 'SRSD') {
    // Oct of year → Feb of year+1
    const start = new Date(year, cfg.startMonth - 1, cfg.startDay);
    const endYear = year + 1;
    const endDay = (endYear % 4 === 0 && (endYear % 100 !== 0 || endYear % 400 === 0)) ? 29 : 28;
    const end = new Date(endYear, cfg.endMonth - 1, endDay);
    return { startDate: start, endDate: end };
  }

  // LRLD: Mar-Sep same year
  const start = new Date(year, cfg.startMonth - 1, cfg.startDay);
  const end = new Date(year, cfg.endMonth - 1, cfg.endDay);
  return { startDate: start, endDate: end };
}

export function getSeasonYear(season, date = new Date()) {
  const month = date.getMonth() + 1;
  if (season === 'SRSD' && month <= 2) {
    return date.getFullYear() - 1; // Jan-Feb belongs to previous year's SRSD
  }
  return date.getFullYear();
}
