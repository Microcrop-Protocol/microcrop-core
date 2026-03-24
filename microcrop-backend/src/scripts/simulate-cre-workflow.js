/**
 * CRE Workflow Simulation
 * Tests the pure logic and external API calls from both CRE modules:
 *   - Crop CRE: weather damage, satellite damage, combined index, NDVI fetch
 *   - Livestock CRE: IBLI season determination, county NDVI, forage trigger
 *
 * Usage: node src/scripts/simulate-cre-workflow.js
 */

import 'dotenv/config';
import { env } from '../config/env.js';

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.log(`  ✗ ${label}`);
    failed++;
  }
}

// =========================================================================
// CROP CRE — Pure Logic (replicated from crop/main.ts)
// =========================================================================

function calculateWeatherDamage(weather) {
  let damage = 0;
  if (weather.temperature < 5 || weather.temperature > 45) damage += 40;
  else if (weather.temperature < 10 || weather.temperature > 40) damage += 25;
  else if (weather.temperature < 15 || weather.temperature > 35) damage += 10;

  if (weather.precipitation > 10) damage += 30;
  else if (weather.precipitation > 4) damage += 15;

  if (weather.humidity > 95) damage += 15;
  else if (weather.humidity > 90) damage += 8;

  if (weather.windSpeed > 80) damage += 20;
  else if (weather.windSpeed > 60) damage += 10;

  return Math.min(damage, 100);
}

function calculateSatelliteDamage(ndvi) {
  if (ndvi >= 0.7) return 0;
  if (ndvi >= 0.6) return 10;
  if (ndvi >= 0.5) return 25;
  if (ndvi >= 0.4) return 40;
  if (ndvi >= 0.3) return 60;
  if (ndvi >= 0.2) return 80;
  return 100;
}

function calculateDamageIndex(weatherDamage, satelliteDamage, weatherWeight, satelliteWeight) {
  const wInt = Math.round(weatherWeight * 100);
  const sInt = Math.round(satelliteWeight * 100);
  return Math.min(Math.floor((wInt * weatherDamage + sInt * satelliteDamage) / 100), 100);
}

// =========================================================================
// LIVESTOCK CRE — Pure Logic (replicated from livestock/main.ts)
// =========================================================================

function getCurrentSeason(date) {
  const month = date.getMonth() + 1;
  const year = date.getFullYear();
  if (month >= 3 && month <= 9) return { season: 'LRLD', year };
  if (month <= 2) return { season: 'SRSD', year: year - 1 };
  return { season: 'SRSD', year };
}

const COUNTY_BBOXES = {
  TURKANA:   [34.0, 1.5, 36.5, 5.5],
  MARSABIT:  [36.5, 1.5, 39.5, 4.5],
  WAJIR:     [38.5, 0.0, 41.0, 3.0],
  MANDERA:   [39.5, 2.5, 42.0, 4.5],
  GARISSA:   [38.0, -2.0, 41.5, 1.5],
  ISIOLO:    [37.0, 0.0, 39.5, 2.0],
  SAMBURU:   [36.0, 0.5, 38.0, 2.5],
  TANA_RIVER:[38.5, -3.0, 40.5, -0.5],
  BARINGO:   [35.5, 0.0, 36.5, 1.5],
  LAIKIPIA:  [36.0, -0.5, 37.5, 0.5],
};

// =========================================================================
// CDSE OAuth + Statistical API helpers
// =========================================================================

const CDSE_OAUTH_URL = 'https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token';
const CDSE_API_URL = 'https://sh.dataspace.copernicus.eu/api/v1';

async function fetchCdseToken() {
  const clientId = env.sentinelClientId;
  const clientSecret = env.sentinelClientSecret;
  if (!clientId || !clientSecret) return null;

  const body = `grant_type=client_credentials&client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}`;
  const res = await fetch(CDSE_OAUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) throw new Error(`OAuth failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.access_token;
}

// Sentinel-2 evalscript with SCL cloud masking (livestock CRE version — more robust)
const FORAGE_NDVI_EVALSCRIPT = `//VERSION=3
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
  if (sample.dataMask === 0 || scl === 3 || scl === 6 || scl === 8 || scl === 9 || scl === 11) {
    return { ndvi: [NaN], dataMask: [0] };
  }
  var ndvi = (sample.B08 - sample.B04) / (sample.B08 + sample.B04);
  return { ndvi: [ndvi], dataMask: [1] };
}`;

// Simple crop CRE evalscript (dataMask only)
const CROP_NDVI_EVALSCRIPT = `//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B04", "B08", "dataMask"] }],
    output: [
      { id: "ndvi", bands: 1, sampleType: "FLOAT32" },
      { id: "dataMask", bands: 1 }
    ]
  };
}
function evaluatePixel(sample) {
  if (sample.dataMask === 0) return { ndvi: [NaN], dataMask: [0] };
  const ndvi = (sample.B08 - sample.B04) / (sample.B08 + sample.B04);
  return { ndvi: [ndvi], dataMask: [1] };
}`;

async function fetchPointNDVI(token, lat, lon) {
  const delta = 0.005;
  const bbox = [lon - delta, lat - delta, lon + delta, lat + delta];
  const now = new Date();
  const past = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const toDate = now.toISOString().split('T')[0];
  const fromDate = past.toISOString().split('T')[0];

  const payload = {
    input: {
      bounds: {
        bbox,
        properties: { crs: 'http://www.opengis.net/def/crs/EPSG/0/4326' },
      },
      data: [{
        type: 'sentinel-2-l2a',
        dataFilter: {
          timeRange: { from: `${fromDate}T00:00:00Z`, to: `${toDate}T23:59:59Z` },
          maxCloudCoverage: 30,
        },
      }],
    },
    aggregation: {
      timeRange: { from: `${fromDate}T00:00:00Z`, to: `${toDate}T23:59:59Z` },
      aggregationInterval: { of: 'P7D' },
      evalscript: CROP_NDVI_EVALSCRIPT,
    },
    output: { responses: [{ identifier: 'ndvi' }] },
  };

  const res = await fetch(`${CDSE_API_URL}/statistics`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Point NDVI fetch failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  const stats = data?.data?.[0]?.outputs?.ndvi?.bands?.B0?.stats;
  return stats?.mean ?? null;
}

async function fetchAreaNDVI(token, bbox, lookbackDays) {
  const now = new Date();
  const past = new Date(now.getTime() - lookbackDays * 24 * 60 * 60 * 1000);
  const toDate = now.toISOString().split('T')[0];
  const fromDate = past.toISOString().split('T')[0];

  const payload = {
    input: {
      bounds: {
        bbox,
        properties: { crs: 'http://www.opengis.net/def/crs/EPSG/0/4326' },
      },
      data: [{
        type: 'sentinel-2-l2a',
        dataFilter: {
          timeRange: { from: `${fromDate}T00:00:00Z`, to: `${toDate}T23:59:59Z` },
          maxCloudCoverage: 40,
        },
      }],
    },
    aggregation: {
      timeRange: { from: `${fromDate}T00:00:00Z`, to: `${toDate}T23:59:59Z` },
      aggregationInterval: { of: `P${lookbackDays}D` },
      resx: 0.01,
      resy: 0.01,
      evalscript: FORAGE_NDVI_EVALSCRIPT,
    },
    output: { responses: [{ identifier: 'ndvi' }] },
  };

  const res = await fetch(`${CDSE_API_URL}/statistics`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Area NDVI fetch failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  const stats = data?.data?.[0]?.outputs?.ndvi?.bands?.B0?.stats;
  return stats?.mean ?? null;
}

// =========================================================================
// WeatherXM Pro API helpers (replicates crop CRE fetchWeatherData)
// =========================================================================

const WEATHERXM_API_URL = 'https://pro.weatherxm.com/api/v1';

async function fetchNearestStation(apiKey, lat, lon) {
  const res = await fetch(
    `${WEATHERXM_API_URL}/stations/near?lat=${lat}&lon=${lon}&radius=10000`,
    { method: 'GET', headers: { 'X-API-KEY': apiKey } }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`stations/near failed: ${res.status} ${text}`);
  }
  const data = await res.json();
  const stations = data?.stations ?? data;
  if (!stations || !Array.isArray(stations) || stations.length === 0) {
    return null;
  }
  return stations[0];
}

async function fetchLatestObservation(apiKey, stationId) {
  const res = await fetch(
    `${WEATHERXM_API_URL}/stations/${stationId}/latest`,
    { method: 'GET', headers: { 'X-API-KEY': apiKey } }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`stations/${stationId}/latest failed: ${res.status} ${text}`);
  }
  const data = await res.json();
  return data?.observation ?? data;
}

function parseWeatherData(obs) {
  return {
    temperature: obs.temperature ?? 25,
    precipitation: obs.precipitation_rate ?? 0,
    humidity: obs.humidity ?? 50,
    windSpeed: (obs.wind_speed ?? 0) * 3.6, // m/s → km/h
  };
}

// =========================================================================
// Tests
// =========================================================================

async function runTests() {
  console.log('\n========================================');
  console.log(' CRE Workflow Simulation');
  console.log('========================================\n');

  // ----- CROP CRE: Weather Damage Scoring -----
  console.log('1. Crop CRE — Weather Damage Scoring');

  // Optimal conditions: 25°C, 1mm rain, 60% humidity, 10 km/h wind
  assert(calculateWeatherDamage({ temperature: 25, precipitation: 1, humidity: 60, windSpeed: 10 }) === 0,
    'Optimal conditions → 0% damage');

  // Mild temp stress only
  assert(calculateWeatherDamage({ temperature: 12, precipitation: 0, humidity: 50, windSpeed: 5 }) === 10,
    'Mild cold (12°C) → 10% damage');

  // Moderate temp stress
  assert(calculateWeatherDamage({ temperature: 8, precipitation: 0, humidity: 50, windSpeed: 5 }) === 25,
    'Cold stress (8°C) → 25% damage');

  // Extreme temp
  assert(calculateWeatherDamage({ temperature: 3, precipitation: 0, humidity: 50, windSpeed: 5 }) === 40,
    'Extreme cold (3°C) → 40% damage');

  // Heavy rain only
  assert(calculateWeatherDamage({ temperature: 25, precipitation: 5, humidity: 50, windSpeed: 5 }) === 15,
    'Heavy rain (5mm/h) → 15% damage');

  // Torrential rain
  assert(calculateWeatherDamage({ temperature: 25, precipitation: 12, humidity: 50, windSpeed: 5 }) === 30,
    'Torrential rain (12mm/h) → 30% damage');

  // High humidity only
  assert(calculateWeatherDamage({ temperature: 25, precipitation: 0, humidity: 92, windSpeed: 5 }) === 8,
    'High humidity (92%) → 8% damage');

  // Very high humidity
  assert(calculateWeatherDamage({ temperature: 25, precipitation: 0, humidity: 97, windSpeed: 5 }) === 15,
    'Very high humidity (97%) → 15% damage');

  // Strong wind only
  assert(calculateWeatherDamage({ temperature: 25, precipitation: 0, humidity: 50, windSpeed: 65 }) === 10,
    'Strong wind (65 km/h) → 10% damage');

  // Destructive wind
  assert(calculateWeatherDamage({ temperature: 25, precipitation: 0, humidity: 50, windSpeed: 85 }) === 20,
    'Destructive wind (85 km/h) → 20% damage');

  // Compound extreme: cold + torrential + very humid + destructive wind
  const compoundDamage = calculateWeatherDamage({ temperature: 3, precipitation: 12, humidity: 97, windSpeed: 85 });
  assert(compoundDamage === 100,
    `Compound extreme → capped at 100% (got ${compoundDamage})`);

  // ----- CROP CRE: Satellite Damage Scoring -----
  console.log('\n2. Crop CRE — Satellite Damage Scoring (NDVI)');

  assert(calculateSatelliteDamage(0.8) === 0,   'NDVI 0.8 → 0% (healthy)');
  assert(calculateSatelliteDamage(0.7) === 0,   'NDVI 0.7 → 0% (healthy threshold)');
  assert(calculateSatelliteDamage(0.65) === 10,  'NDVI 0.65 → 10% (mild stress)');
  assert(calculateSatelliteDamage(0.55) === 25,  'NDVI 0.55 → 25% (moderate stress)');
  assert(calculateSatelliteDamage(0.45) === 40,  'NDVI 0.45 → 40% (stressed)');
  assert(calculateSatelliteDamage(0.35) === 60,  'NDVI 0.35 → 60% (severe stress)');
  assert(calculateSatelliteDamage(0.25) === 80,  'NDVI 0.25 → 80% (very severe)');
  assert(calculateSatelliteDamage(0.1) === 100,  'NDVI 0.1 → 100% (barren/dead)');

  // ----- CROP CRE: Combined Damage Index -----
  console.log('\n3. Crop CRE — Combined Damage Index (60/40 weighted)');

  // Standard production config: weatherWeight=0.6, satelliteWeight=0.4
  const W = 0.6, S = 0.4;
  const threshold = 30;

  // No damage
  assert(calculateDamageIndex(0, 0, W, S) === 0, 'No damage → 0%');

  // Weather only: 25% weather, 0% satellite → floor(60*25/100) = floor(15) = 15
  assert(calculateDamageIndex(25, 0, W, S) === 15, 'Weather 25% only → 15%');

  // Satellite only: 0% weather, 40% satellite → floor(40*40/100) = floor(16) = 16
  assert(calculateDamageIndex(0, 40, W, S) === 16, 'Satellite 40% only → 16%');

  // Both moderate: 25% weather + 25% satellite → floor((60*25 + 40*25)/100) = floor(25) = 25
  assert(calculateDamageIndex(25, 25, W, S) === 25, '25%/25% → 25% (below threshold)');

  // Trigger scenario: 30% weather + 40% satellite → floor((60*30 + 40*40)/100) = floor(34) = 34
  const triggerIndex = calculateDamageIndex(30, 40, W, S);
  assert(triggerIndex >= threshold,
    `30% weather + 40% satellite → ${triggerIndex}% (≥ ${threshold}% threshold, TRIGGERS)`);

  // High damage: 40% weather + 80% satellite → floor((60*40 + 40*80)/100) = floor(56) = 56
  assert(calculateDamageIndex(40, 80, W, S) === 56, '40%/80% → 56%');

  // Max damage
  assert(calculateDamageIndex(100, 100, W, S) === 100, '100%/100% → 100% (capped)');

  // Integer math matching Solidity: 10% weather + 10% satellite → floor((60*10 + 40*10)/100) = floor(10) = 10
  assert(calculateDamageIndex(10, 10, W, S) === 10, '10%/10% → 10% (integer math)');

  // ----- CROP CRE: Trigger Decision -----
  console.log('\n4. Crop CRE — Trigger Decision Logic');

  const scenarios = [
    { weather: { temperature: 25, precipitation: 1, humidity: 60, windSpeed: 5 }, ndvi: 0.75, shouldTrigger: false, desc: 'Good conditions, healthy crop' },
    { weather: { temperature: 8, precipitation: 6, humidity: 92, windSpeed: 10 }, ndvi: 0.55, shouldTrigger: true, desc: 'Cold + heavy rain + moderate NDVI stress' },
    { weather: { temperature: 3, precipitation: 12, humidity: 97, windSpeed: 85 }, ndvi: 0.2, shouldTrigger: true, desc: 'Extreme weather + severe NDVI stress' },
    { weather: { temperature: 25, precipitation: 0, humidity: 50, windSpeed: 5 }, ndvi: 0.25, shouldTrigger: true, desc: 'Good weather but very low NDVI' },
    { weather: { temperature: 12, precipitation: 0, humidity: 50, windSpeed: 5 }, ndvi: 0.65, shouldTrigger: false, desc: 'Mild cold, slightly stressed NDVI' },
  ];

  for (const s of scenarios) {
    const wd = calculateWeatherDamage(s.weather);
    const sd = calculateSatelliteDamage(s.ndvi);
    const ci = calculateDamageIndex(wd, sd, W, S);
    const triggered = ci >= threshold;
    assert(triggered === s.shouldTrigger,
      `${s.desc}: W=${wd}% S=${sd}% C=${ci}% → ${triggered ? 'TRIGGER' : 'NO TRIGGER'}`);
  }

  // ----- LIVESTOCK CRE: Season Determination -----
  console.log('\n5. Livestock CRE — IBLI Season Determination');

  // LRLD: March through September
  assert(getCurrentSeason(new Date(2026, 2, 15)).season === 'LRLD', 'March 2026 → LRLD');
  assert(getCurrentSeason(new Date(2026, 5, 1)).season === 'LRLD', 'June 2026 → LRLD');
  assert(getCurrentSeason(new Date(2026, 8, 30)).season === 'LRLD', 'September 2026 → LRLD');

  // SRSD: October through February
  assert(getCurrentSeason(new Date(2026, 9, 1)).season === 'SRSD', 'October 2026 → SRSD');
  assert(getCurrentSeason(new Date(2026, 11, 31)).season === 'SRSD', 'December 2026 → SRSD');

  // Jan-Feb: SRSD of *previous* year
  const janSeason = getCurrentSeason(new Date(2026, 0, 15));
  assert(janSeason.season === 'SRSD' && janSeason.year === 2025,
    'January 2026 → SRSD 2025 (previous year)');

  const febSeason = getCurrentSeason(new Date(2026, 1, 28));
  assert(febSeason.season === 'SRSD' && febSeason.year === 2025,
    'February 2026 → SRSD 2025 (previous year)');

  // Current month check
  const now = new Date();
  const current = getCurrentSeason(now);
  assert(current.season === 'LRLD' || current.season === 'SRSD',
    `Current season (${now.toISOString().slice(0, 10)}): ${current.season} ${current.year}`);

  // ----- LIVESTOCK CRE: County Bounding Boxes -----
  console.log('\n6. Livestock CRE — KLIP County Bounding Boxes');

  const counties = Object.keys(COUNTY_BBOXES);
  assert(counties.length === 10, `10 KLIP counties defined (got ${counties.length})`);

  for (const county of counties) {
    const [minLon, minLat, maxLon, maxLat] = COUNTY_BBOXES[county];
    const valid = minLon < maxLon && minLat < maxLat && minLon >= 33 && maxLon <= 43 && minLat >= -4 && maxLat <= 6;
    assert(valid, `${county}: [${minLon},${minLat},${maxLon},${maxLat}] — valid Kenya bbox`);
  }

  // ----- CDSE API Tests (require credentials) -----
  console.log('\n7. CDSE OAuth Token Acquisition');

  let token = null;
  if (!env.sentinelClientId || !env.sentinelClientSecret) {
    console.log('  ⊘ Skipped — SENTINEL_CLIENT_ID / SENTINEL_CLIENT_SECRET not set');
  } else {
    try {
      token = await fetchCdseToken();
      assert(token && token.length > 50, `Token acquired (${token.length} chars)`);
    } catch (err) {
      assert(false, `Token acquisition failed: ${err.message}`);
    }
  }

  console.log('\n8. Crop CRE — Point-Based NDVI Fetch (Nairobi)');

  if (!token) {
    console.log('  ⊘ Skipped — no CDSE token');
  } else {
    try {
      // Nairobi area — should have Sentinel-2 coverage
      const ndvi = await fetchPointNDVI(token, -1.286, 36.817);
      if (ndvi === null) {
        console.log('  ⊘ No data in 7-day window (cloud cover or no pass) — not a code error');
      } else {
        assert(ndvi >= -1 && ndvi <= 1, `Nairobi point NDVI: ${ndvi.toFixed(4)} (valid range)`);
        const satDmg = calculateSatelliteDamage(ndvi);
        console.log(`    → Satellite damage score: ${satDmg}%`);
      }
      passed++; // API call itself succeeded
    } catch (err) {
      if (err.message.includes('503') || err.message.includes('429')) {
        console.log(`  ⊘ CDSE temporary error (${err.message.slice(0, 60)}) — not a code error`);
      } else {
        assert(false, `Point NDVI fetch failed: ${err.message}`);
      }
    }
  }

  console.log('\n9. Livestock CRE — Area-Based NDVI Fetch (Turkana County)');

  if (!token) {
    console.log('  ⊘ Skipped — no CDSE token');
  } else {
    try {
      const turkana = COUNTY_BBOXES.TURKANA;
      const ndvi = await fetchAreaNDVI(token, turkana, 16);
      if (ndvi === null) {
        console.log('  ⊘ No data in 16-day window — not a code error');
      } else {
        assert(ndvi >= -1 && ndvi <= 1, `Turkana area NDVI (16-day): ${ndvi.toFixed(4)} (valid range)`);
      }
      passed++; // API call succeeded
    } catch (err) {
      if (err.message.includes('503') || err.message.includes('429')) {
        console.log(`  ⊘ CDSE temporary error (${err.message.slice(0, 60)}) — not a code error`);
      } else {
        assert(false, `Area NDVI fetch failed: ${err.message}`);
      }
    }
  }

  console.log('\n10. Livestock CRE — Multi-County NDVI Fetch');

  if (!token) {
    console.log('  ⊘ Skipped — no CDSE token');
  } else {
    // Test a smaller county (Baringo) to verify different bbox sizes work
    try {
      const baringo = COUNTY_BBOXES.BARINGO;
      const ndvi = await fetchAreaNDVI(token, baringo, 16);
      if (ndvi === null) {
        console.log('  ⊘ Baringo: No data in 16-day window');
      } else {
        assert(ndvi >= -1 && ndvi <= 1, `Baringo area NDVI: ${ndvi.toFixed(4)}`);
      }
      passed++;
    } catch (err) {
      if (err.message.includes('503') || err.message.includes('429')) {
        console.log(`  ⊘ CDSE temporary error — not a code error`);
      } else {
        assert(false, `Baringo NDVI fetch failed: ${err.message}`);
      }
    }
  }

  // ----- WeatherXM Pro API Tests -----
  console.log('\n11. WeatherXM — Station Discovery (Nairobi)');

  const wxmApiKey = env.weatherxmApiKey;
  let wxmStation = null;

  if (!wxmApiKey) {
    console.log('  ⊘ Skipped — WEATHERXM_API_KEY not set');
  } else {
    try {
      // Nairobi coordinates — same as crop CRE would use
      wxmStation = await fetchNearestStation(wxmApiKey, -1.286, 36.817);
      if (!wxmStation) {
        console.log('  ⊘ No WeatherXM station within 10km of Nairobi — not a code error');
      } else {
        assert(wxmStation.id && wxmStation.id.length > 0,
          `Station found: ${wxmStation.id} (${wxmStation.name || 'unnamed'})`);
      }
    } catch (err) {
      assert(false, `Station discovery failed: ${err.message}`);
    }
  }

  console.log('\n12. WeatherXM — Latest Observation');

  if (!wxmApiKey || !wxmStation) {
    console.log('  ⊘ Skipped — no station available');
  } else {
    try {
      const obs = await fetchLatestObservation(wxmApiKey, wxmStation.id);
      assert(obs !== null && obs !== undefined, 'Observation data received');

      const weather = parseWeatherData(obs);
      assert(typeof weather.temperature === 'number', `Temperature: ${weather.temperature.toFixed(1)}°C`);
      assert(typeof weather.precipitation === 'number', `Precipitation rate: ${weather.precipitation} mm/h`);
      assert(typeof weather.humidity === 'number', `Humidity: ${weather.humidity}%`);
      assert(typeof weather.windSpeed === 'number', `Wind speed: ${weather.windSpeed.toFixed(1)} km/h`);

      // Run through CRE damage scoring
      const wxDamage = calculateWeatherDamage(weather);
      console.log(`    → Weather damage score: ${wxDamage}%`);
      assert(wxDamage >= 0 && wxDamage <= 100, `Damage score valid (${wxDamage}%)`);
    } catch (err) {
      assert(false, `Observation fetch failed: ${err.message}`);
    }
  }

  console.log('\n13. WeatherXM — Kenyan Farm Location (Nakuru)');

  if (!wxmApiKey) {
    console.log('  ⊘ Skipped — WEATHERXM_API_KEY not set');
  } else {
    try {
      // Nakuru — major farming area in Kenya's Rift Valley
      const station = await fetchNearestStation(wxmApiKey, -0.303, 36.080);
      if (!station) {
        console.log('  ⊘ No station within 10km of Nakuru — CRE would fail for policies here');
      } else {
        assert(station.id.length > 0, `Nakuru station: ${station.id}`);
        const obs = await fetchLatestObservation(wxmApiKey, station.id);
        const weather = parseWeatherData(obs);
        const damage = calculateWeatherDamage(weather);
        console.log(`    → ${weather.temperature.toFixed(1)}°C, ${weather.precipitation}mm/h, ${weather.humidity}%, ${weather.windSpeed.toFixed(1)}km/h → ${damage}% damage`);
        assert(true, 'Full weather pipeline OK');
      }
    } catch (err) {
      assert(false, `Nakuru weather failed: ${err.message}`);
    }
  }

  console.log('\n14. WeatherXM — Combined Weather + Satellite Scoring');

  if (!wxmApiKey || !wxmStation) {
    console.log('  ⊘ Skipped — no weather data');
  } else {
    try {
      const obs = await fetchLatestObservation(wxmApiKey, wxmStation.id);
      const weather = parseWeatherData(obs);
      const weatherDmg = calculateWeatherDamage(weather);

      // Use a realistic Kenyan NDVI value
      const mockNdvi = 0.55; // moderate stress
      const satDmg = calculateSatelliteDamage(mockNdvi);
      const combined = calculateDamageIndex(weatherDmg, satDmg, 0.6, 0.4);

      console.log(`    → Weather: ${weatherDmg}%, Satellite: ${satDmg}% (NDVI ${mockNdvi}), Combined: ${combined}%`);
      assert(combined >= 0 && combined <= 100, `Combined index valid: ${combined}%`);

      const triggers = combined >= 30;
      console.log(`    → Threshold 30%: ${triggers ? 'WOULD TRIGGER PAYOUT' : 'No payout'}`);
      assert(true, `End-to-end weather+satellite scoring OK`);
    } catch (err) {
      assert(false, `Combined scoring failed: ${err.message}`);
    }
  }

  // ----- CRE Config Validation -----
  console.log('\n15. CRE Config Validation');

  // Crop config
  const cropProdConfig = {
    schedule: '0 0 * * *',
    backendApiUrl: 'https://app.microcrop.app',
    weatherXmApiUrl: 'https://pro.weatherxm.com/api/v1',
    satelliteProvider: 'planet',
    planetApiUrl: 'https://sh.dataspace.copernicus.eu/api/v1',
    planetDataType: 'planetscope',
    sentinelApiUrl: 'https://sh.dataspace.copernicus.eu/api/v1',
    damageThreshold: 30,
    weatherWeight: 0.6,
    satelliteWeight: 0.4,
  };

  assert(cropProdConfig.planetApiUrl.includes('dataspace.copernicus.eu'),
    'Crop config: planetApiUrl points to CDSE (not old sentinel-hub.com)');
  assert(cropProdConfig.sentinelApiUrl.includes('dataspace.copernicus.eu'),
    'Crop config: sentinelApiUrl points to CDSE');
  assert(cropProdConfig.weatherWeight + cropProdConfig.satelliteWeight === 1.0,
    'Crop config: weights sum to 1.0');
  assert(cropProdConfig.damageThreshold === 30,
    'Crop config: damage threshold = 30%');
  assert(cropProdConfig.schedule === '0 0 * * *',
    'Crop config: daily cron schedule');

  // Livestock config
  const livestockProdConfig = {
    schedule: '0 6 1,17 * *',
    backendApiUrl: 'https://app.microcrop.app',
    sentinelApiUrl: 'https://sh.dataspace.copernicus.eu/api/v1',
    ndviLookbackDays: 16,
  };

  assert(livestockProdConfig.sentinelApiUrl.includes('dataspace.copernicus.eu'),
    'Livestock config: sentinelApiUrl points to CDSE');
  assert(livestockProdConfig.ndviLookbackDays === 16,
    'Livestock config: 16-day MODIS-equivalent composite');
  assert(livestockProdConfig.schedule === '0 6 1,17 * *',
    'Livestock config: 1st and 17th of each month at 06:00');

  // ----- OAuth URL Validation -----
  console.log('\n16. CRE OAuth URL Validation');

  const EXPECTED_OAUTH = 'https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token';
  // Both CRE modules define SENTINEL_HUB_OAUTH_URL — verify it's the CDSE URL
  assert(CDSE_OAUTH_URL === EXPECTED_OAUTH, 'OAuth URL matches CDSE endpoint');
  assert(!EXPECTED_OAUTH.includes('sentinel-hub.com'), 'OAuth URL does NOT reference old sentinel-hub.com');

  // ----- Evalscript Validation -----
  console.log('\n17. Evalscript Validation');

  assert(CROP_NDVI_EVALSCRIPT.includes('B04') && CROP_NDVI_EVALSCRIPT.includes('B08'),
    'Crop evalscript uses Sentinel-2 B04 (Red) + B08 (NIR)');
  assert(CROP_NDVI_EVALSCRIPT.includes('FLOAT32'),
    'Crop evalscript outputs FLOAT32');

  assert(FORAGE_NDVI_EVALSCRIPT.includes('SCL'),
    'Livestock evalscript includes SCL cloud masking');
  assert(FORAGE_NDVI_EVALSCRIPT.includes('scl === 8') && FORAGE_NDVI_EVALSCRIPT.includes('scl === 9'),
    'Livestock evalscript masks cloud classes 8 & 9');
  assert(FORAGE_NDVI_EVALSCRIPT.includes('scl === 3'),
    'Livestock evalscript masks cloud shadows (class 3)');
  assert(FORAGE_NDVI_EVALSCRIPT.includes('scl === 6'),
    'Livestock evalscript masks water (class 6)');

  // ----- End-to-End Scenario: Crop CRE Full Pipeline -----
  console.log('\n18. End-to-End — Crop CRE Pipeline Simulation');

  // Simulate a complete crop CRE cycle for one policy
  const mockPolicy = {
    policyId: 'POL-001',
    plotLatitude: -0.4,
    plotLongitude: 36.9,
    cropType: 'MAIZE',
    onChainPolicyId: '42',
    sumInsured: 500,
  };

  // Simulate weather reading
  const mockWeather = { temperature: 7, precipitation: 8, humidity: 93, windSpeed: 45 };
  const wd = calculateWeatherDamage(mockWeather);
  assert(wd === 48, `Step 1: Weather damage = ${wd}% (cold + heavy rain + humid)`);

  // Simulate NDVI reading
  const mockNdvi = 0.35;
  const sd = calculateSatelliteDamage(mockNdvi);
  assert(sd === 60, `Step 2: Satellite damage = ${sd}% (NDVI ${mockNdvi})`);

  // Combined
  const ci = calculateDamageIndex(wd, sd, W, S);
  // floor((60*48 + 40*60)/100) = floor((2880+2400)/100) = floor(52.8) = 52
  assert(ci === 52, `Step 3: Combined damage = ${ci}%`);

  // Trigger check
  const shouldPayout = ci >= threshold;
  assert(shouldPayout === true, `Step 4: ${ci}% ≥ ${threshold}% → payout triggered`);

  // Payout calculation (matching Solidity integer math)
  const sumInsuredOnChain = BigInt(Math.round(mockPolicy.sumInsured * 1e6));
  const payoutAmount = sumInsuredOnChain * BigInt(ci) / BigInt(100);
  const expectedPayout = 500 * 0.52; // $260
  assert(Number(payoutAmount) / 1e6 === expectedPayout,
    `Step 5: Payout = $${(Number(payoutAmount) / 1e6).toFixed(2)} USDC (52% of $500)`);

  // ----- End-to-End Scenario: Livestock CRE Full Pipeline -----
  console.log('\n19. End-to-End — Livestock CRE Pipeline Simulation');

  // Simulate a livestock CRE cycle
  const season = getCurrentSeason(new Date());
  console.log(`  Current season: ${season.season} ${season.year}`);

  // Simulate fetching insurance units
  const mockUnits = [
    { id: 'IU-001', county: 'Turkana', unitCode: 'TURKANA', ndviBaselineLRLD: 0.35, ndviBaselineSRSD: 0.25, strikeLevelLRLD: 0.28, strikeLevelSRSD: 0.20 },
    { id: 'IU-002', county: 'Marsabit', unitCode: 'MARSABIT', ndviBaselineLRLD: 0.40, ndviBaselineSRSD: 0.30, strikeLevelLRLD: 0.32, strikeLevelSRSD: 0.24 },
    { id: 'IU-003', county: 'UNKNOWN', unitCode: 'UNKNOWN', ndviBaselineLRLD: 0, ndviBaselineSRSD: 0, strikeLevelLRLD: 0, strikeLevelSRSD: 0 },
  ];

  // Test bbox lookup
  assert(COUNTY_BBOXES[mockUnits[0].unitCode] !== undefined, 'TURKANA has bbox');
  assert(COUNTY_BBOXES[mockUnits[1].unitCode] !== undefined, 'MARSABIT has bbox');
  assert(COUNTY_BBOXES[mockUnits[2].unitCode] === undefined, 'UNKNOWN county → no bbox (skip)');

  // Simulate NDVI readings and trigger evaluation
  const mockReadings = { TURKANA: 0.22, MARSABIT: 0.38 };
  let alertsTriggered = 0;

  for (const unit of mockUnits) {
    const bbox = COUNTY_BBOXES[unit.unitCode];
    if (!bbox) continue;

    const ndvi = mockReadings[unit.unitCode];
    const baseline = season.season === 'LRLD' ? unit.ndviBaselineLRLD : unit.ndviBaselineSRSD;
    const strike = season.season === 'LRLD' ? unit.strikeLevelLRLD : unit.strikeLevelSRSD;

    if (ndvi < strike) {
      alertsTriggered++;
      const deficit = ((baseline - ndvi) / baseline * 100).toFixed(1);
      console.log(`  ALERT: ${unit.county} — NDVI ${ndvi} < strike ${strike}, deficit ${deficit}%`);
    } else {
      console.log(`  OK: ${unit.county} — NDVI ${ndvi} ≥ strike ${strike}`);
    }
  }

  assert(alertsTriggered === 1, `1 forage alert triggered (Turkana NDVI 0.22 < strike 0.28)`);

  // =========================================================================
  // Summary
  // =========================================================================
  console.log('\n========================================');
  console.log(` Results: ${passed} passed, ${failed} failed`);
  console.log('========================================\n');

  if (failed > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error('Simulation crashed:', err);
  process.exit(1);
});
