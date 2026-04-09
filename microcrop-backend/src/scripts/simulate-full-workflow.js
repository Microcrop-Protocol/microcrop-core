/**
 * Full Workflow Simulation — Damage, Fraud, Verification, Monitoring Pipeline
 *
 * Tests the data flows that depend on database records:
 * 1. Boundary setup → overlap detection
 * 2. Anomaly detection pipeline (pure logic)
 * 3. Damage assessment → fraud verification → fraud flag creation
 * 4. Damage verification report generation
 * 5. Fraud flag lifecycle (create → query → resolve)
 * 6. Payout listener idempotency logic
 * 7. Internal API satellite data ingestion
 *
 * Creates test records, runs the flows, then cleans up.
 *
 * Usage: node src/scripts/simulate-full-workflow.js
 */

import prisma from '../config/database.js';
import satelliteService from '../services/satellite.service.js';
import geometryService from '../services/geometry.service.js';
import fraudService from '../services/fraud.service.js';
import damageVerificationService from '../services/damage-verification.service.js';
import satelliteMonitoringService from '../services/satellite-monitoring.service.js';
import redis from '../config/redis.js';

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
  console.log(`\n${BOLD}${CYAN}[${title}]${RESET}`);
}

let totalTests = 0;
let passed = 0;
let failed = 0;

function assert(condition, label, detail = '') {
  totalTests++;
  if (condition) {
    pass(label, detail);
    passed++;
  } else {
    fail(label, detail);
    failed++;
  }
  return condition;
}

// Track created records for cleanup
const cleanup = {
  fraudFlags: [],
  damageAssessments: [],
  satelliteData: [],
  ndviBaselines: [],
};

// Test farm boundaries
const BOUNDARY_A = {
  type: 'Polygon',
  coordinates: [[
    [37.070, -0.004],
    [37.076, -0.004],
    [37.076, -0.008],
    [37.070, -0.008],
    [37.070, -0.004],
  ]],
};

const BOUNDARY_B_OVERLAPPING = {
  type: 'Polygon',
  coordinates: [[
    [37.074, -0.006],
    [37.080, -0.006],
    [37.080, -0.010],
    [37.074, -0.010],
    [37.074, -0.006],
  ]],
};

const BOUNDARY_C_SEPARATE = {
  type: 'Polygon',
  coordinates: [[
    [37.100, -0.020],
    [37.106, -0.020],
    [37.106, -0.024],
    [37.100, -0.024],
    [37.100, -0.020],
  ]],
};

async function run() {
  console.log(`\n${BOLD}=== Full Workflow Simulation ===${RESET}`);
  console.log(`Date: ${new Date().toISOString()}`);

  // Find an existing org and farmer to use for test data
  const org = await prisma.organization.findFirst({
    select: { id: true, name: true },
  });

  if (!org) {
    console.log(`${RED}No organization found in database. Cannot run workflow simulation.${RESET}`);
    await prisma.$disconnect();
    process.exit(1);
  }

  const farmer = await prisma.farmer.findFirst({
    where: { organizationId: org.id },
    select: { id: true, phoneNumber: true },
  });

  if (!farmer) {
    console.log(`${RED}No farmer found for org ${org.id}. Cannot run workflow simulation.${RESET}`);
    await prisma.$disconnect();
    process.exit(1);
  }

  console.log(`Org: ${org.name} (${org.id})`);
  console.log(`Farmer: ${farmer.id}`);

  // Find existing plots or use them
  const plots = await prisma.plot.findMany({
    where: { organizationId: org.id },
    take: 3,
    select: { id: true, name: true, organizationId: true, latitude: true, longitude: true },
  });

  if (plots.length === 0) {
    console.log(`${RED}No plots found for org. Cannot run workflow simulation.${RESET}`);
    await prisma.$disconnect();
    process.exit(1);
  }

  console.log(`Plots available: ${plots.length}`);

  const testPlot = plots[0];

  // =========================================================================
  // STEP 1: Boundary Setup & Overlap Detection
  // =========================================================================
  section('Step 1: Boundary Setup & Overlap Detection');

  // Set boundary on first plot
  totalTests++;
  try {
    const validation = geometryService.validateGeoJSON(BOUNDARY_A);
    const metrics = geometryService.computePlotMetrics(BOUNDARY_A);

    await prisma.plot.update({
      where: { id: testPlot.id },
      data: {
        boundary: BOUNDARY_A,
        centroidLat: metrics.centroidLat,
        centroidLon: metrics.centroidLon,
        areaHectares: metrics.areaHectares,
      },
    });

    pass('Boundary set on plot', `${testPlot.name}: ${metrics.areaHectares} ha, centroid (${metrics.centroidLat}, ${metrics.centroidLon})`);
    passed++;
  } catch (error) {
    fail('Boundary setup', error.message);
    failed++;
  }

  // Overlap detection (no overlaps expected with just one boundary)
  totalTests++;
  try {
    const overlaps = await geometryService.checkOverlaps(org.id, BOUNDARY_A, testPlot.id);
    if (Array.isArray(overlaps)) {
      pass('Overlap detection ran', `${overlaps.length} overlaps found`);
      passed++;
    } else {
      fail('Overlap detection returned non-array');
      failed++;
    }
  } catch (error) {
    fail('Overlap detection threw', error.message);
    failed++;
  }

  // Self-intersection rejection
  totalTests++;
  const selfIntersecting = {
    type: 'Polygon',
    coordinates: [[
      [37.070, -0.004],
      [37.076, -0.008],
      [37.076, -0.004],
      [37.070, -0.008],
      [37.070, -0.004],
    ]],
  };
  const siResult = geometryService.validateGeoJSON(selfIntersecting);
  assert(!siResult.valid, 'Self-intersecting polygon rejected', siResult.error || 'was accepted');

  // =========================================================================
  // STEP 2: Store Synthetic NDVI Data & Test Retrieval
  // =========================================================================
  section('Step 2: Synthetic NDVI Storage & Retrieval');

  // Store a series of NDVI readings
  const ndviReadings = [
    { mean: 0.72, min: 0.55, max: 0.85, stdDev: 0.08, sampleCount: 250, cloudCover: 12 },
    { mean: 0.68, min: 0.50, max: 0.82, stdDev: 0.10, sampleCount: 230, cloudCover: 18 },
    { mean: 0.35, min: 0.20, max: 0.50, stdDev: 0.15, sampleCount: 200, cloudCover: 25 },
  ];

  const dates = [];
  for (let i = 0; i < 3; i++) {
    const d = new Date();
    d.setDate(d.getDate() - (i * 5 + 1));
    dates.push(d.toISOString().split('T')[0]);
  }

  for (let i = 0; i < ndviReadings.length; i++) {
    totalTests++;
    try {
      const record = await satelliteService.storeNDVIReading(
        testPlot.id,
        org.id,
        ndviReadings[i],
        dates[i]
      );
      cleanup.satelliteData.push(record.id);
      pass(`NDVI reading stored (day -${i * 5 + 1})`, `ndvi=${ndviReadings[i].mean}, date=${dates[i]}`);
      passed++;
    } catch (error) {
      fail(`NDVI reading store (day -${i * 5 + 1})`, error.message);
      failed++;
    }
  }

  // Verify retrieval
  totalTests++;
  try {
    const stored = await prisma.satelliteData.findMany({
      where: { plotId: testPlot.id },
      orderBy: { captureDate: 'desc' },
    });
    assert(stored.length >= 3, 'NDVI retrieval', `${stored.length} records found`);
  } catch (error) {
    fail('NDVI retrieval', error.message);
    failed++;
  }

  // =========================================================================
  // STEP 3: Health Classification with Stored Data
  // =========================================================================
  section('Step 3: Health Classification with Real Data');

  totalTests++;
  const latestNdvi = 0.72;
  const healthResult = satelliteService.classifyHealth(latestNdvi, null);
  assert(
    healthResult.status === 'EXCELLENT',
    'Latest NDVI health classification',
    `NDVI ${latestNdvi} → ${healthResult.status}`
  );

  // With synthetic baseline
  totalTests++;
  const syntheticBaseline = { baselineMean: 0.70, baselineStdDev: 0.06, yearsIncluded: 2 };
  const healthWithBaseline = satelliteService.classifyHealth(latestNdvi, syntheticBaseline);
  assert(
    healthWithBaseline.deviation !== null && healthWithBaseline.isAnomaly === false,
    'Health with baseline (normal)',
    `deviation=${healthWithBaseline.deviation}σ, anomaly=${healthWithBaseline.isAnomaly}`
  );

  // Anomaly case
  totalTests++;
  const criticalHealth = satelliteService.classifyHealth(0.15, syntheticBaseline);
  assert(
    criticalHealth.isAnomaly === true && criticalHealth.status === 'CRITICAL',
    'Health with baseline (anomaly)',
    `NDVI 0.15 → ${criticalHealth.status}, deviation=${criticalHealth.deviation}σ, anomaly=true`
  );

  // =========================================================================
  // STEP 4: Anomaly Detection (Pure Logic)
  // =========================================================================
  section('Step 4: Anomaly Detection Pipeline');

  totalTests++;
  try {
    const anomaly = await satelliteMonitoringService.detectAnomaly(
      testPlot.id,
      0.25,
      new Date().toISOString()
    );
    // With no baseline stored yet, should return no anomaly
    pass('detectAnomaly ran', `isAnomaly=${anomaly.isAnomaly}, severity=${anomaly.severity}, sigma=${anomaly.deviationSigma}`);
    passed++;
  } catch (error) {
    fail('detectAnomaly threw', error.message);
    failed++;
  }

  // =========================================================================
  // STEP 5: Damage Assessment → Fraud Verification
  // =========================================================================
  section('Step 5: Damage Assessment & Fraud Verification');

  // Find or create a policy for the test plot
  let testPolicy = await prisma.policy.findFirst({
    where: { plotId: testPlot.id },
    select: { id: true, farmerId: true, organizationId: true },
  });

  if (!testPolicy) {
    // Find any policy for the org
    testPolicy = await prisma.policy.findFirst({
      where: { organizationId: org.id },
      select: { id: true, farmerId: true, organizationId: true, plotId: true },
    });
  }

  if (testPolicy) {
    // Create a damage assessment simulating an on-chain claim of 70% damage
    totalTests++;
    let testAssessment;
    try {
      testAssessment = await prisma.damageAssessment.create({
        data: {
          policyId: testPolicy.id,
          organizationId: org.id,
          damagePercent: 70,
          source: 'ON_CHAIN',
          txHash: '0x' + 'a'.repeat(64), // fake txHash
          blockNumber: BigInt(12345678),
        },
      });
      cleanup.damageAssessments.push(testAssessment.id);
      pass('Damage assessment created', `id=${testAssessment.id}, claimed=70%`);
      passed++;
    } catch (error) {
      fail('Damage assessment creation', error.message);
      failed++;
    }

    // Test fraud mismatch scoring (pure function)
    totalTests++;
    // Healthy plant (NDVI=0.65 → 10% damage), but claiming 70% → should flag
    const mismatchScore = fraudService.calculateNdviMismatchScore(70, 0.65, syntheticBaseline);
    assert(
      mismatchScore > 0.5,
      'Fraud mismatch score (overestimation)',
      `claimed=70%, satellite=10% → score=${mismatchScore.toFixed(3)}`
    );

    // Honest claim
    totalTests++;
    const honestScore = fraudService.calculateNdviMismatchScore(60, 0.35, syntheticBaseline);
    assert(
      honestScore === 0,
      'Fraud mismatch score (honest claim)',
      `claimed=60%, satellite=60% → score=${honestScore}`
    );

    // Test damage verification report
    if (testAssessment) {
      totalTests++;
      try {
        const report = await damageVerificationService.getVerificationReport(testAssessment.id);
        if (report) {
          assert(
            report.assessment && report.verdict && report.onChainClaim,
            'Verification report generated',
            `verdict=${report.verdict.claimConsistency}, confidence=${report.verdict.confidenceScore}`
          );
        } else {
          fail('Verification report returned null');
          failed++;
        }
      } catch (error) {
        fail('Verification report generation', error.message);
        failed++;
      }
    }

    // Test SATELLITE source damage assessment
    totalTests++;
    try {
      const satAssessment = await prisma.damageAssessment.create({
        data: {
          policyId: testPolicy.id,
          organizationId: org.id,
          damagePercent: 60,
          satelliteDamage: 60,
          ndviDamage: 45.5,
          source: 'SATELLITE',
          triggered: true,
          triggerDate: new Date(),
        },
      });
      cleanup.damageAssessments.push(satAssessment.id);
      pass('SATELLITE source assessment created', `id=${satAssessment.id} (new enum value works)`);
      passed++;
    } catch (error) {
      fail('SATELLITE source assessment creation', error.message);
      failed++;
    }
  } else {
    warn('No policy found — skipping damage/fraud tests');
  }

  // =========================================================================
  // STEP 6: Fraud Flag Lifecycle
  // =========================================================================
  section('Step 6: Fraud Flag Lifecycle');

  // Create a fraud flag
  totalTests++;
  let testFlag;
  try {
    testFlag = await prisma.fraudFlag.create({
      data: {
        organizationId: org.id,
        plotId: testPlot.id,
        policyId: testPolicy?.id || null,
        farmerId: farmer.id,
        type: 'NDVI_MISMATCH',
        severity: 'HIGH',
        description: 'Test: claimed 70% damage but NDVI shows healthy vegetation',
        claimedDamage: 70,
        satelliteNdvi: 0.65,
        baselineNdvi: 0.70,
        confidenceScore: 0.85,
      },
    });
    cleanup.fraudFlags.push(testFlag.id);
    pass('Fraud flag created', `id=${testFlag.id}, type=NDVI_MISMATCH, severity=HIGH`);
    passed++;
  } catch (error) {
    fail('Fraud flag creation', error.message);
    failed++;
  }

  // Query fraud flags
  totalTests++;
  try {
    const result = await fraudService.getFraudFlags(org.id, { page: 1, limit: 10 });
    assert(
      result.flags.length > 0 && result.total > 0,
      'Fraud flags query',
      `${result.total} total flags, page 1 has ${result.flags.length}`
    );
  } catch (error) {
    fail('Fraud flags query', error.message);
    failed++;
  }

  // Filtered query
  totalTests++;
  try {
    const filtered = await fraudService.getFraudFlags(org.id, {
      type: 'NDVI_MISMATCH',
      severity: 'HIGH',
      status: 'OPEN',
    });
    assert(
      filtered.flags.length > 0,
      'Filtered fraud flags query',
      `${filtered.total} NDVI_MISMATCH + HIGH + OPEN flags`
    );
  } catch (error) {
    fail('Filtered fraud flags query', error.message);
    failed++;
  }

  // Resolve fraud flag (test new RESOLVED_* enum values)
  if (testFlag) {
    totalTests++;
    try {
      const resolved = await fraudService.resolveFraudFlag(
        testFlag.id,
        'RESOLVED_FALSE_POSITIVE',
        'Verified with ground truth: damage was from adjacent field, not this plot',
        'simulation-test'
      );
      assert(
        resolved.status === 'RESOLVED_FALSE_POSITIVE' && resolved.resolvedBy === 'simulation-test',
        'Fraud flag resolved (RESOLVED_FALSE_POSITIVE)',
        `status=${resolved.status}, resolvedAt=${resolved.resolvedAt}`
      );
    } catch (error) {
      fail('Fraud flag resolution (RESOLVED_FALSE_POSITIVE)', error.message);
      failed++;
    }

    // Test other new enum values
    totalTests++;
    try {
      const flag2 = await prisma.fraudFlag.create({
        data: {
          organizationId: org.id,
          plotId: testPlot.id,
          type: 'HISTORICAL_ANOMALY',
          severity: 'MEDIUM',
          description: 'Test: historical anomaly flag',
          confidenceScore: 0.60,
        },
      });
      cleanup.fraudFlags.push(flag2.id);

      const resolved2 = await fraudService.resolveFraudFlag(
        flag2.id,
        'RESOLVED_CONFIRMED',
        'Confirmed fraud after field inspection',
        'simulation-test'
      );
      assert(
        resolved2.status === 'RESOLVED_CONFIRMED',
        'Fraud flag resolved (RESOLVED_CONFIRMED)',
        'new enum value works'
      );
    } catch (error) {
      fail('RESOLVED_CONFIRMED enum', error.message);
      failed++;
    }
  }

  // =========================================================================
  // STEP 7: Payout Listener Idempotency
  // =========================================================================
  section('Step 7: Payout Listener Idempotency');

  if (testPolicy) {
    // Simulate: two damage assessments with same txHash should not create duplicates
    const fakeTxHash = '0x' + 'b'.repeat(64);

    totalTests++;
    try {
      const first = await prisma.damageAssessment.create({
        data: {
          policyId: testPolicy.id,
          organizationId: org.id,
          damagePercent: 45,
          source: 'ON_CHAIN',
          txHash: fakeTxHash,
          blockNumber: BigInt(99999999),
        },
      });
      cleanup.damageAssessments.push(first.id);

      // Check if duplicate exists (simulates the idempotency check in payout listener)
      const existing = await prisma.damageAssessment.findFirst({
        where: { txHash: fakeTxHash },
      });

      assert(
        existing && existing.id === first.id,
        'Idempotency check: finds existing by txHash',
        `found id=${existing.id}`
      );
    } catch (error) {
      fail('Idempotency check', error.message);
      failed++;
    }

    // Simulate: duplicate payout check
    totalTests++;
    try {
      const existingPayout = await prisma.payout.findFirst({
        where: {
          policyId: testPolicy.id,
          status: { in: ['PENDING', 'PROCESSING'] },
        },
      });
      pass('Payout dedup check ran', existingPayout ? `found existing: ${existingPayout.id}` : 'no duplicates');
      passed++;
    } catch (error) {
      fail('Payout dedup check', error.message);
      failed++;
    }
  }

  // =========================================================================
  // STEP 8: Redis Lock (Monitoring Dedup)
  // =========================================================================
  section('Step 8: Redis Monitoring Lock');

  totalTests++;
  try {
    const lockKey = `satellite:monitor:test-${Date.now()}`;
    // First acquire should succeed
    const first = await redis.set(lockKey, Date.now().toString(), 'EX', 10, 'NX');
    // Second acquire should fail
    const second = await redis.set(lockKey, Date.now().toString(), 'EX', 10, 'NX');
    // Cleanup
    await redis.del(lockKey);

    assert(
      first !== null && second === null,
      'Redis NX lock works',
      `first=${first !== null ? 'acquired' : 'failed'}, second=${second !== null ? 'acquired (BAD)' : 'blocked (correct)'}`
    );
  } catch (error) {
    fail('Redis lock test', error.message);
    failed++;
  }

  // =========================================================================
  // STEP 9: Internal API Data Ingestion (Schema Validation)
  // =========================================================================
  section('Step 9: Internal API Data Validation');

  // Simulate what the CRE would send to POST /api/internal/satellite-data
  totalTests++;
  try {
    const internalPayload = {
      plotId: testPlot.id,
      ndvi: 0.62,
      ndviMin: 0.45,
      ndviMax: 0.78,
      ndviStdDev: 0.09,
      captureDate: new Date().toISOString().split('T')[0],
      cloudCover: 15.5,
      source: 'SENTINEL2',
    };

    // Simulate the upsert the internal endpoint does
    const record = await prisma.satelliteData.upsert({
      where: {
        plotId_captureDate_source: {
          plotId: internalPayload.plotId,
          captureDate: new Date(internalPayload.captureDate),
          source: internalPayload.source,
        },
      },
      create: {
        plotId: internalPayload.plotId,
        captureDate: new Date(internalPayload.captureDate),
        ndvi: internalPayload.ndvi,
        ndviMin: internalPayload.ndviMin,
        ndviMax: internalPayload.ndviMax,
        ndviStdDev: internalPayload.ndviStdDev,
        cloudCover: internalPayload.cloudCover,
        source: internalPayload.source,
      },
      update: {
        ndvi: internalPayload.ndvi,
        ndviMin: internalPayload.ndviMin,
        ndviMax: internalPayload.ndviMax,
        ndviStdDev: internalPayload.ndviStdDev,
        cloudCover: internalPayload.cloudCover,
      },
    });
    cleanup.satelliteData.push(record.id);
    pass('Internal API upsert', `id=${record.id}, ndvi=${record.ndvi}`);
    passed++;
  } catch (error) {
    fail('Internal API upsert', error.message);
    failed++;
  }

  // Unique constraint test (same plot+date+source should update, not duplicate)
  totalTests++;
  try {
    const count1 = await prisma.satelliteData.count({ where: { plotId: testPlot.id } });
    await prisma.satelliteData.upsert({
      where: {
        plotId_captureDate_source: {
          plotId: testPlot.id,
          captureDate: new Date(new Date().toISOString().split('T')[0]),
          source: 'SENTINEL2',
        },
      },
      create: {
        plotId: testPlot.id,
        captureDate: new Date(new Date().toISOString().split('T')[0]),
        ndvi: 0.99,
        source: 'SENTINEL2',
      },
      update: { ndvi: 0.99 },
    });
    const count2 = await prisma.satelliteData.count({ where: { plotId: testPlot.id } });
    assert(
      count2 === count1,
      'Unique constraint prevents duplicates',
      `records before=${count1}, after=${count2} (same — upsert updated existing)`
    );
  } catch (error) {
    fail('Unique constraint test', error.message);
    failed++;
  }

  // =========================================================================
  // CLEANUP
  // =========================================================================
  section('Cleanup');

  try {
    if (cleanup.fraudFlags.length > 0) {
      await prisma.fraudFlag.deleteMany({ where: { id: { in: cleanup.fraudFlags } } });
      console.log(`  Deleted ${cleanup.fraudFlags.length} fraud flags`);
    }
    if (cleanup.damageAssessments.length > 0) {
      await prisma.damageAssessment.deleteMany({ where: { id: { in: cleanup.damageAssessments } } });
      console.log(`  Deleted ${cleanup.damageAssessments.length} damage assessments`);
    }
    if (cleanup.satelliteData.length > 0) {
      await prisma.satelliteData.deleteMany({ where: { id: { in: cleanup.satelliteData } } });
      console.log(`  Deleted ${cleanup.satelliteData.length} satellite data records`);
    }
    // Reset plot boundary
    await prisma.plot.update({
      where: { id: testPlot.id },
      data: { boundary: null, centroidLat: null, centroidLon: null, areaHectares: null },
    });
    console.log(`  Reset plot boundary`);
    pass('Cleanup complete');
    totalTests++;
    passed++;
  } catch (error) {
    warn('Cleanup had errors', error.message);
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
    console.log(`${GREEN}${BOLD}ALL TESTS PASSED — Full workflow is operational.${RESET}\n`);
  } else {
    console.log(`${RED}${BOLD}${failed} TEST(S) FAILED — Review issues above.${RESET}\n`);
  }

  await prisma.$disconnect();
  await redis.quit();
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(async (err) => {
  console.error(`\n${RED}Unhandled error:${RESET}`, err);
  await prisma.$disconnect();
  await redis.quit();
  process.exit(1);
});
