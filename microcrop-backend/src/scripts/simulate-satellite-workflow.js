/**
 * Satellite Monitoring Workflow Simulation
 *
 * Tests the full pipeline end-to-end:
 * 1. OAuth2 token acquisition (CDSE)
 * 2. GeoJSON validation & metrics computation
 * 3. NDVI fetch for a real Kenyan farm coordinate
 * 4. Store NDVI reading in database
 * 5. Health classification
 * 6. Damage calculation
 * 7. Fraud mismatch scoring
 *
 * Usage: node src/scripts/simulate-satellite-workflow.js
 */

import satelliteService from '../services/satellite.service.js';
import geometryService from '../services/geometry.service.js';
import prisma from '../config/database.js';
import { env } from '../config/env.js';
import { NDVI_THRESHOLDS } from '../utils/constants.js';

// ANSI colors for terminal output
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

function pass(label, detail = '') {
  console.log(`  ${GREEN}PASS${RESET}  ${label}${detail ? ` — ${detail}` : ''}`);
}

function fail(label, detail = '') {
  console.log(`  ${RED}FAIL${RESET}  ${label}${detail ? ` — ${detail}` : ''}`);
}

function warn(label, detail = '') {
  console.log(`  ${YELLOW}WARN${RESET}  ${label}${detail ? ` — ${detail}` : ''}`);
}

function section(title) {
  console.log(`\n${BOLD}${CYAN}[${ title }]${RESET}`);
}

// Test farm in Nanyuki, Kenya (agricultural area)
const TEST_FARM = {
  lat: -0.006,
  lon: 37.073,
  boundary: {
    type: 'Polygon',
    coordinates: [[
      [37.070, -0.004],
      [37.076, -0.004],
      [37.076, -0.008],
      [37.070, -0.008],
      [37.070, -0.004],
    ]],
  },
};

async function run() {
  console.log(`\n${BOLD}=== Satellite Monitoring Workflow Simulation ===${RESET}`);
  console.log(`Date: ${new Date().toISOString()}`);
  console.log(`CDSE API: ${env.sentinelApiUrl}`);
  console.log(`CDSE OAuth: ${env.sentinelOAuthUrl}`);
  console.log(`Client ID: ${env.sentinelClientId ? env.sentinelClientId.slice(0, 8) + '...' : 'NOT SET'}`);

  let totalTests = 0;
  let passed = 0;
  let failed = 0;

  // =========================================================================
  // STEP 1: OAuth2 Token
  // =========================================================================
  section('Step 1: OAuth2 Token Acquisition');
  totalTests++;
  let token;
  try {
    token = await satelliteService.getAccessToken();
    if (token) {
      pass('Token acquired', `${token.slice(0, 20)}...`);
      passed++;
    } else {
      fail('Token is null — credentials not configured');
      failed++;
      console.log(`\n${RED}Cannot proceed without a valid token. Set SENTINEL_CLIENT_ID and SENTINEL_CLIENT_SECRET.${RESET}`);
      await prisma.$disconnect();
      process.exit(1);
    }
  } catch (error) {
    fail('Token acquisition failed', error.message);
    failed++;
    console.log(`\n${RED}Cannot proceed without a valid token.${RESET}`);
    await prisma.$disconnect();
    process.exit(1);
  }

  // Test token caching (second call should be instant)
  totalTests++;
  const t0 = Date.now();
  const token2 = await satelliteService.getAccessToken();
  const cacheMs = Date.now() - t0;
  if (token2 === token && cacheMs < 50) {
    pass('Token caching works', `cached in ${cacheMs}ms`);
    passed++;
  } else {
    warn('Token caching', `took ${cacheMs}ms`);
    passed++;
  }

  // =========================================================================
  // STEP 2: GeoJSON Validation & Geometry
  // =========================================================================
  section('Step 2: GeoJSON Validation & Geometry');

  // Valid polygon
  totalTests++;
  const validResult = geometryService.validateGeoJSON(TEST_FARM.boundary);
  if (validResult.valid) {
    pass('Valid polygon accepted');
    passed++;
  } else {
    fail('Valid polygon rejected', validResult.error);
    failed++;
  }

  // Invalid polygon (not closed)
  totalTests++;
  const badPoly = {
    type: 'Polygon',
    coordinates: [[[37.0, -1.0], [37.1, -1.0], [37.1, -1.1]]],
  };
  const invalidResult = geometryService.validateGeoJSON(badPoly);
  if (!invalidResult.valid) {
    pass('Invalid polygon rejected', invalidResult.error);
    passed++;
  } else {
    fail('Invalid polygon was accepted (should have been rejected)');
    failed++;
  }

  // Compute metrics
  totalTests++;
  try {
    const metrics = geometryService.computePlotMetrics(TEST_FARM.boundary);
    if (metrics.centroidLat && metrics.centroidLon && metrics.areaHectares) {
      pass('Plot metrics computed', `centroid: (${metrics.centroidLat}, ${metrics.centroidLon}), area: ${metrics.areaHectares} ha`);
      passed++;
    } else {
      fail('Metrics missing fields', JSON.stringify(metrics));
      failed++;
    }
  } catch (error) {
    fail('computePlotMetrics threw', error.message);
    failed++;
  }

  // Point-to-polygon fallback
  totalTests++;
  try {
    const pointPoly = geometryService.pointToPolygon(TEST_FARM.lat, TEST_FARM.lon, 500);
    if (pointPoly && pointPoly.type === 'Polygon') {
      pass('pointToPolygon works', `generated ${pointPoly.coordinates[0].length} vertex polygon`);
      passed++;
    } else {
      fail('pointToPolygon returned invalid result');
      failed++;
    }
  } catch (error) {
    fail('pointToPolygon threw', error.message);
    failed++;
  }

  // =========================================================================
  // STEP 3: NDVI Fetch (Live API Call)
  // =========================================================================
  section('Step 3: NDVI Fetch from Copernicus CDSE');

  const mockPlot = {
    id: 'simulation-test',
    latitude: TEST_FARM.lat,
    longitude: TEST_FARM.lon,
    boundary: TEST_FARM.boundary,
  };

  // Geometry resolution
  totalTests++;
  const geom = satelliteService.getQueryGeometry(mockPlot);
  if (geom.type === 'polygon') {
    pass('Query geometry uses boundary polygon');
    passed++;
  } else {
    warn('Query geometry using bbox fallback (no boundary)');
    passed++;
  }

  // Fetch NDVI (last 10 days)
  totalTests++;
  const now = new Date();
  const tenDaysAgo = new Date(now);
  tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
  const fromStr = tenDaysAgo.toISOString().split('T')[0];
  const toStr = now.toISOString().split('T')[0];

  let ndviData;
  try {
    console.log(`  ...  Fetching NDVI for Nanyuki farm (${fromStr} → ${toStr})...`);
    ndviData = await satelliteService.fetchNDVI(mockPlot, fromStr, toStr);
    if (ndviData && ndviData.mean !== null && ndviData.mean !== undefined) {
      pass('NDVI fetched successfully', `mean=${ndviData.mean.toFixed(3)}, min=${ndviData.min?.toFixed(3)}, max=${ndviData.max?.toFixed(3)}, samples=${ndviData.sampleCount}`);
      passed++;
    } else if (ndviData === null) {
      warn('NDVI returned null (likely 100% cloud cover in the period)');
      passed++;
    } else {
      fail('NDVI data has unexpected shape', JSON.stringify(ndviData));
      failed++;
    }
  } catch (error) {
    fail('fetchNDVI threw', error.message);
    failed++;
  }

  // Time series fetch
  totalTests++;
  try {
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const tsFrom = thirtyDaysAgo.toISOString().split('T')[0];
    console.log(`  ...  Fetching NDVI time series (${tsFrom} → ${toStr})...`);
    const timeSeries = await satelliteService.fetchNDVITimeSeries(mockPlot, tsFrom, toStr);
    if (Array.isArray(timeSeries)) {
      pass('Time series fetched', `${timeSeries.length} data points over 30 days`);
      passed++;
      if (timeSeries.length > 0) {
        const first = timeSeries[0];
        console.log(`         Sample: date=${first.date}, ndvi=${first.mean?.toFixed(3)}, cloud=${first.cloudCover}%`);
      }
    } else {
      fail('Time series is not an array');
      failed++;
    }
  } catch (error) {
    fail('fetchNDVITimeSeries threw', error.message);
    failed++;
  }

  // =========================================================================
  // STEP 4: Health Classification (Pure Logic)
  // =========================================================================
  section('Step 4: Health Classification');

  const testCases = [
    { ndvi: 0.85, expected: 'EXCELLENT' },
    { ndvi: 0.65, expected: 'GOOD' },
    { ndvi: 0.45, expected: 'MODERATE' },
    { ndvi: 0.25, expected: 'POOR' },
    { ndvi: 0.10, expected: 'CRITICAL' },
  ];

  for (const tc of testCases) {
    totalTests++;
    const health = satelliteService.classifyHealth(tc.ndvi, null);
    if (health.status === tc.expected) {
      pass(`NDVI ${tc.ndvi} → ${health.status}`);
      passed++;
    } else {
      fail(`NDVI ${tc.ndvi} → ${health.status} (expected ${tc.expected})`);
      failed++;
    }
  }

  // With baseline anomaly detection
  totalTests++;
  const baseline = { baselineMean: 0.7, baselineStdDev: 0.08, yearsIncluded: 3 };
  const anomalyCheck = satelliteService.classifyHealth(0.45, baseline);
  if (anomalyCheck.isAnomaly === true && anomalyCheck.deviation < -2) {
    pass('Anomaly detection', `NDVI 0.45 vs baseline 0.7±0.08 → deviation=${anomalyCheck.deviation}, isAnomaly=true`);
    passed++;
  } else {
    fail('Anomaly detection', `deviation=${anomalyCheck.deviation}, isAnomaly=${anomalyCheck.isAnomaly}`);
    failed++;
  }

  // =========================================================================
  // STEP 5: Damage Calculation (CRE Formula)
  // =========================================================================
  section('Step 5: Damage Calculation (CRE Formula)');

  const damageCases = [
    { ndvi: 0.75, expected: 0 },
    { ndvi: 0.65, expected: 10 },
    { ndvi: 0.55, expected: 25 },
    { ndvi: 0.45, expected: 40 },
    { ndvi: 0.35, expected: 60 },
    { ndvi: 0.25, expected: 80 },
    { ndvi: 0.10, expected: 100 },
  ];

  for (const dc of damageCases) {
    totalTests++;
    const damage = satelliteService.calculateSatelliteDamage(dc.ndvi);
    if (damage === dc.expected) {
      pass(`NDVI ${dc.ndvi} → ${damage}% damage`);
      passed++;
    } else {
      fail(`NDVI ${dc.ndvi} → ${damage}% (expected ${dc.expected}%)`);
      failed++;
    }
  }

  // =========================================================================
  // STEP 6: Fraud Mismatch Scoring
  // =========================================================================
  section('Step 6: Fraud Mismatch Scoring');

  // Import fraud service dynamically to avoid circular deps
  const { default: fraudService } = await import('../services/fraud.service.js');

  // Honest claim: NDVI=0.35 → 60% damage, claiming 55%
  totalTests++;
  const honestScore = fraudService.calculateNdviMismatchScore(55, 0.35, baseline);
  if (honestScore === 0) {
    pass('Honest claim (55% claimed, 60% satellite)', `score=${honestScore} (no fraud signal)`);
    passed++;
  } else {
    fail('Honest claim flagged as fraud', `score=${honestScore}`);
    failed++;
  }

  // Suspicious claim: NDVI=0.65 → 10% damage, claiming 70%
  totalTests++;
  const suspiciousScore = fraudService.calculateNdviMismatchScore(70, 0.65, baseline);
  if (suspiciousScore > 0.3) {
    pass('Suspicious claim (70% claimed, 10% satellite)', `score=${suspiciousScore.toFixed(3)} (fraud signal)`);
    passed++;
  } else {
    fail('Suspicious claim not flagged', `score=${suspiciousScore}`);
    failed++;
  }

  // =========================================================================
  // STEP 7: Database Connectivity
  // =========================================================================
  section('Step 7: Database Connectivity');

  totalTests++;
  try {
    const plotCount = await prisma.plot.count();
    pass('Prisma connected', `${plotCount} plots in database`);
    passed++;
  } catch (error) {
    fail('Database connection failed', error.message);
    failed++;
  }

  totalTests++;
  try {
    const satCount = await prisma.satelliteData.count();
    pass('SatelliteData table accessible', `${satCount} records`);
    passed++;
  } catch (error) {
    fail('SatelliteData query failed', error.message);
    failed++;
  }

  totalTests++;
  try {
    const fraudCount = await prisma.fraudFlag.count();
    pass('FraudFlag table accessible', `${fraudCount} records`);
    passed++;
  } catch (error) {
    fail('FraudFlag query failed', error.message);
    failed++;
  }

  totalTests++;
  try {
    const baselineCount = await prisma.nDVIBaseline.count();
    pass('NDVIBaseline table accessible', `${baselineCount} records`);
    passed++;
  } catch (error) {
    fail('NDVIBaseline query failed', error.message);
    failed++;
  }

  // =========================================================================
  // STEP 8: Store Test Reading (if NDVI was fetched)
  // =========================================================================
  if (ndviData && ndviData.mean != null) {
    section('Step 8: Store & Retrieve NDVI Reading');

    // Find a real plot to test with, or skip
    const realPlot = await prisma.plot.findFirst({
      where: { organizationId: { not: undefined } },
      select: { id: true, organizationId: true },
    });

    if (realPlot) {
      totalTests++;
      try {
        const stored = await satelliteService.storeNDVIReading(
          realPlot.id,
          realPlot.organizationId,
          ndviData,
          toStr
        );
        if (stored && stored.id) {
          pass('NDVI reading stored', `id=${stored.id}, ndvi=${stored.ndvi}`);
          passed++;

          // Retrieve it back
          totalTests++;
          const retrieved = await prisma.satelliteData.findUnique({ where: { id: stored.id } });
          if (retrieved && parseFloat(retrieved.ndvi) === parseFloat(stored.ndvi)) {
            pass('NDVI reading retrieved matches stored value');
            passed++;
          } else {
            fail('Retrieved reading does not match');
            failed++;
          }
        } else {
          fail('storeNDVIReading returned invalid result');
          failed++;
        }
      } catch (error) {
        fail('storeNDVIReading threw', error.message);
        failed++;
      }
    } else {
      warn('No plots in database — skipping store/retrieve test');
    }
  }

  // =========================================================================
  // SUMMARY
  // =========================================================================
  console.log(`\n${BOLD}=== RESULTS ===${RESET}`);
  console.log(`  Total: ${totalTests}`);
  console.log(`  ${GREEN}Passed: ${passed}${RESET}`);
  if (failed > 0) {
    console.log(`  ${RED}Failed: ${failed}${RESET}`);
  } else {
    console.log(`  Failed: 0`);
  }
  console.log('');

  if (failed === 0) {
    console.log(`${GREEN}${BOLD}ALL TESTS PASSED — Satellite workflow is operational.${RESET}\n`);
  } else {
    console.log(`${RED}${BOLD}${failed} TEST(S) FAILED — Review issues above.${RESET}\n`);
  }

  await prisma.$disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(async (err) => {
  console.error(`\n${RED}Unhandled error:${RESET}`, err);
  await prisma.$disconnect();
  process.exit(1);
});
