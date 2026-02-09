import crypto from 'crypto';

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
