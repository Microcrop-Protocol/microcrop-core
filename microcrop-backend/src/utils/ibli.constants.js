// ============================================
// IBLI (Index-Based Livestock Insurance) Constants
// ============================================

// TLU conversion factors (FAO standard)
export const TLU_FACTORS = {
  CATTLE: 1.0,
  CAMEL: 1.4,
  GOAT: 0.1,
  SHEEP: 0.1,
  POULTRY: 0.01,
};

// IBLI season date ranges (Kenya KLIP)
export const IBLI_SEASONS = {
  LRLD: { label: 'Long Rains (Mar-Sep)', startMonth: 3, startDay: 1, endMonth: 9, endDay: 30 },
  SRSD: { label: 'Short Rains (Oct-Feb)', startMonth: 10, startDay: 1, endMonth: 2, endDay: 28 },
};

// KLIP county seed data — 10 counties in Kenya's IBLI program
// NDVI baselines and strike levels based on historical MODIS MOD13Q1 averages
// Premium rates are per TLU per season (KES)
export const KLIP_COUNTIES = [
  {
    county: 'Turkana',
    unitCode: 'TURKANA',
    ndviBaselineLRLD: 0.220,
    ndviBaselineSRSD: 0.180,
    strikeLevelLRLD: 0.150,
    strikeLevelSRSD: 0.120,
    premiumRateLRLD: 750,
    premiumRateSRSD: 850,
    valuePerTLU: 15000,
  },
  {
    county: 'Marsabit',
    unitCode: 'MARSABIT',
    ndviBaselineLRLD: 0.250,
    ndviBaselineSRSD: 0.200,
    strikeLevelLRLD: 0.170,
    strikeLevelSRSD: 0.135,
    premiumRateLRLD: 700,
    premiumRateSRSD: 800,
    valuePerTLU: 15000,
  },
  {
    county: 'Wajir',
    unitCode: 'WAJIR',
    ndviBaselineLRLD: 0.210,
    ndviBaselineSRSD: 0.170,
    strikeLevelLRLD: 0.140,
    strikeLevelSRSD: 0.115,
    premiumRateLRLD: 780,
    premiumRateSRSD: 870,
    valuePerTLU: 15000,
  },
  {
    county: 'Mandera',
    unitCode: 'MANDERA',
    ndviBaselineLRLD: 0.200,
    ndviBaselineSRSD: 0.160,
    strikeLevelLRLD: 0.135,
    strikeLevelSRSD: 0.110,
    premiumRateLRLD: 800,
    premiumRateSRSD: 900,
    valuePerTLU: 15000,
  },
  {
    county: 'Garissa',
    unitCode: 'GARISSA',
    ndviBaselineLRLD: 0.230,
    ndviBaselineSRSD: 0.185,
    strikeLevelLRLD: 0.155,
    strikeLevelSRSD: 0.125,
    premiumRateLRLD: 720,
    premiumRateSRSD: 810,
    valuePerTLU: 15000,
  },
  {
    county: 'Isiolo',
    unitCode: 'ISIOLO',
    ndviBaselineLRLD: 0.260,
    ndviBaselineSRSD: 0.210,
    strikeLevelLRLD: 0.175,
    strikeLevelSRSD: 0.140,
    premiumRateLRLD: 680,
    premiumRateSRSD: 770,
    valuePerTLU: 15000,
  },
  {
    county: 'Samburu',
    unitCode: 'SAMBURU',
    ndviBaselineLRLD: 0.270,
    ndviBaselineSRSD: 0.220,
    strikeLevelLRLD: 0.180,
    strikeLevelSRSD: 0.145,
    premiumRateLRLD: 650,
    premiumRateSRSD: 740,
    valuePerTLU: 15000,
  },
  {
    county: 'Tana River',
    unitCode: 'TANA_RIVER',
    ndviBaselineLRLD: 0.240,
    ndviBaselineSRSD: 0.195,
    strikeLevelLRLD: 0.160,
    strikeLevelSRSD: 0.130,
    premiumRateLRLD: 700,
    premiumRateSRSD: 790,
    valuePerTLU: 15000,
  },
  {
    county: 'Baringo',
    unitCode: 'BARINGO',
    ndviBaselineLRLD: 0.300,
    ndviBaselineSRSD: 0.250,
    strikeLevelLRLD: 0.200,
    strikeLevelSRSD: 0.165,
    premiumRateLRLD: 600,
    premiumRateSRSD: 680,
    valuePerTLU: 15000,
  },
  {
    county: 'Laikipia',
    unitCode: 'LAIKIPIA',
    ndviBaselineLRLD: 0.320,
    ndviBaselineSRSD: 0.270,
    strikeLevelLRLD: 0.215,
    strikeLevelSRSD: 0.180,
    premiumRateLRLD: 550,
    premiumRateSRSD: 630,
    valuePerTLU: 15000,
  },
];

export const FORAGE_TRIGGER_QUEUE_NAME = 'forage-trigger';
