export const ROLES = {
  PLATFORM_ADMIN: 'PLATFORM_ADMIN',
  ORG_ADMIN: 'ORG_ADMIN',
  ORG_STAFF: 'ORG_STAFF',
  FARMER: 'FARMER',
};

export const CROP_FACTORS = {
  MAIZE: 1.0,
  BEANS: 0.9,
  RICE: 1.2,
  SORGHUM: 0.85,
  MILLET: 0.8,
  VEGETABLES: 1.3,
  CASSAVA: 0.75,
  SWEET_POTATO: 0.8,
  BANANA: 1.1,
  COFFEE: 1.4,
  TEA: 1.3,
  WHEAT: 1.0,
  BARLEY: 0.95,
  POTATOES: 1.1,
};

export const BASE_PREMIUM_RATE = 0.08;

// Livestock insurance
export const BASE_LIVESTOCK_RATE = 0.065; // 6.5% base rate (higher risk than crops)

export const LIVESTOCK_FACTORS = {
  CATTLE: 1.0,
  GOAT: 0.85,
  SHEEP: 0.9,
  CAMEL: 0.8,
  POULTRY: 1.3,
};

export const LIVESTOCK_PERIL_FACTORS = {
  DROUGHT_PASTURE: 1.0,
  DISEASE_OUTBREAK: 1.2,
  HEAT_STRESS: 0.9,
};

export const LIVESTOCK_REGION_FACTORS = {
  // Arid/semi-arid counties (higher risk)
  TURKANA: 1.4,
  MARSABIT: 1.35,
  WAJIR: 1.3,
  MANDERA: 1.3,
  GARISSA: 1.25,
  ISIOLO: 1.2,
  SAMBURU: 1.2,
  TANA_RIVER: 1.15,
  BARINGO: 1.1,
  LAIKIPIA: 1.05,
  // Default for other counties
  DEFAULT: 1.0,
};

export const PLATFORM_FEE_PERCENT = 5;

export const DURATION_FACTORS = {
  30: 0.3,
  60: 0.5,
  90: 0.65,
  120: 0.8,
  150: 0.9,
  180: 1.0,
  210: 1.1,
  240: 1.2,
  270: 1.4,
  300: 1.6,
  330: 1.7,
  365: 1.8,
};

export function getDurationFactor(days) {
  const thresholds = Object.keys(DURATION_FACTORS)
    .map(Number)
    .sort((a, b) => a - b);
  for (const t of thresholds) {
    if (days <= t) return DURATION_FACTORS[t];
  }
  return DURATION_FACTORS[365];
}

// Damage thresholds (percentage 0-100, not basis points)
export const DAMAGE_THRESHOLD = 30;

// Token decimals
export const USDC_DECIMALS = 6;

// Sum insured limits (in USDC)
export const MIN_SUM_INSURED = 1000;      // Minimum $1,000 USDC
export const MAX_SUM_INSURED = 1000000;   // Maximum $1,000,000 USDC

// Policy duration limits (in days)
export const MIN_DURATION_DAYS = 30;
export const MAX_DURATION_DAYS = 365;

// Retry configuration
export const MAX_RETRY_ATTEMPTS = 3;

export const PAYOUT_QUEUE_NAME = 'payout-processing';

export const NOTIFICATION_QUEUE_NAME = 'notifications';

export const BLOCKCHAIN_RETRY_QUEUE_NAME = 'blockchain-retry';

export const FORAGE_TRIGGER_QUEUE_NAME = 'forage-trigger';

export const SATELLITE_QUEUE_NAME = 'satellite-monitoring';

export const NDVI_THRESHOLDS = {
  EXCELLENT: 0.7,
  GOOD: 0.5,
  MODERATE: 0.3,
  POOR: 0.2,
  CRITICAL: 0.1,
};

export const FRAUD_NDVI_MISMATCH_THRESHOLD = 0.3;
export const FRAUD_CONFIDENCE_THRESHOLD = 0.7;
