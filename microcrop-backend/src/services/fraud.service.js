import prisma from '../config/database.js';
import logger from '../utils/logger.js';
import satelliteService from './satellite.service.js';
import geometryService from './geometry.service.js';
import { FRAUD_NDVI_MISMATCH_THRESHOLD, FRAUD_CONFIDENCE_THRESHOLD } from '../utils/constants.js';

// ---------------------------------------------------------------------------
// getDayOfYear — local helper (matches satellite.service.js)
// ---------------------------------------------------------------------------
function getDayOfYear(date) {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date - start;
  const oneDay = 1000 * 60 * 60 * 24;
  return Math.floor(diff / oneDay);
}

// ---------------------------------------------------------------------------
// calculateNdviMismatchScore — Pure function returning 0-1 confidence score
//
// Measures how much the claimed damage *exceeds* what satellite data supports.
// Returns 0 when the claim matches or underestimates satellite-observed damage.
// ---------------------------------------------------------------------------
function calculateNdviMismatchScore(claimedDamage, observedNdvi, baseline) {
  const expectedDamage = satelliteService.calculateSatelliteDamage(observedNdvi);

  // mismatch: how much the claim exceeds satellite evidence (normalised 0-1)
  const mismatch = (claimedDamage - expectedDamage) / 100;

  // Claim matches or underestimates satellite damage — no fraud signal
  if (mismatch <= 0) return 0;

  let score = mismatch;

  // Boost score if baseline is available and the plant is *healthier* than normal
  if (baseline && baseline.baselineMean && baseline.baselineStdDev > 0) {
    if (observedNdvi > baseline.baselineMean) {
      // Plant is above historical average — claim is even more suspicious
      const healthBoost = Math.min(
        (observedNdvi - baseline.baselineMean) / baseline.baselineStdDev * 0.1,
        0.2
      );
      score += healthBoost;
    }
  }

  // Clamp to [0, 1]
  return Math.min(Math.max(score, 0), 1);
}

// ---------------------------------------------------------------------------
// verifyDamageAssessment — Cross-check an on-chain damage claim against
// satellite NDVI data and flag mismatches.
// ---------------------------------------------------------------------------
async function verifyDamageAssessment(assessmentId) {
  try {
    const assessment = await prisma.damageAssessment.findUnique({
      where: { id: assessmentId },
      include: {
        policy: {
          include: {
            plot: true,
          },
        },
      },
    });

    if (!assessment) {
      logger.warn('Fraud verification: assessment not found', { assessmentId });
      return { verified: false, flags: [], error: 'Assessment not found' };
    }

    const plot = assessment.policy?.plot;

    if (!plot) {
      logger.debug('Fraud verification: no plot on policy, skipping', {
        assessmentId,
        policyId: assessment.policyId,
      });
      return { verified: true, flags: [], skipped: true, reason: 'no_plot' };
    }

    // Fetch current NDVI for the plot (last 10 days window)
    const now = new Date();
    const tenDaysAgo = new Date(now);
    tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);

    const fromDate = tenDaysAgo.toISOString().split('T')[0];
    const toDate = now.toISOString().split('T')[0];

    const ndviResult = await satelliteService.fetchNDVI(plot, fromDate, toDate);

    if (!ndviResult || ndviResult.mean == null) {
      logger.debug('Fraud verification: no NDVI data available', {
        assessmentId,
        plotId: plot.id,
      });
      return { verified: true, flags: [], skipped: true, reason: 'no_ndvi_data' };
    }

    const ndvi = ndviResult.mean;

    // Get baseline for comparison
    const dayOfYear = getDayOfYear(now);
    const baseline = await satelliteService.getBaseline(plot.id, dayOfYear);

    // Calculate mismatch score
    const claimedDamage = assessment.damagePercent || 0;
    const score = calculateNdviMismatchScore(claimedDamage, ndvi, baseline);

    const flags = [];

    if (score > FRAUD_CONFIDENCE_THRESHOLD) {
      const severity = score > 0.9 ? 'CRITICAL' : score > 0.8 ? 'HIGH' : 'MEDIUM';

      const flag = await prisma.fraudFlag.create({
        data: {
          policyId: assessment.policyId,
          plotId: assessment.policy.plotId,
          farmerId: assessment.policy.farmerId,
          organizationId: assessment.organizationId,
          type: 'NDVI_MISMATCH',
          severity,
          description: `Claimed ${claimedDamage}% damage but satellite NDVI is ${ndvi.toFixed(3)} (baseline: ${baseline?.baselineMean ?? 'N/A'})`,
          claimedDamage,
          satelliteNdvi: ndvi,
          baselineNdvi: baseline?.baselineMean ?? null,
          confidenceScore: score,
        },
      });

      flags.push(flag);

      logger.warn('Fraud flag created: NDVI mismatch', {
        assessmentId,
        flagId: flag.id,
        severity,
        score: score.toFixed(3),
        claimedDamage,
        observedNdvi: ndvi,
      });
    }

    return {
      verified: true,
      flags,
      satelliteNdvi: ndvi,
      confidenceScore: score,
    };
  } catch (error) {
    logger.error('Fraud verification failed', {
      assessmentId,
      error: error.message,
    });
    throw error;
  }
}

// ---------------------------------------------------------------------------
// checkBoundaryOverlaps — Scan an org's plots for boundary overlaps
// ---------------------------------------------------------------------------
async function checkBoundaryOverlaps(organizationId) {
  try {
    const plots = await prisma.plot.findMany({
      where: {
        organizationId,
        boundary: { not: null },
      },
      select: {
        id: true,
        name: true,
        boundary: true,
      },
    });

    let overlapsFound = 0;
    let flagsCreated = 0;
    const checked = new Set();

    for (let i = 0; i < plots.length; i++) {
      const plotA = plots[i];

      // Check this plot's boundary against all other plots via geometryService
      const overlaps = await geometryService.checkOverlaps(
        organizationId,
        plotA.boundary,
        plotA.id
      );

      for (const overlap of overlaps) {
        // Avoid creating duplicate flags for the same pair (A-B and B-A)
        const pairKey = [plotA.id, overlap.plotId].sort().join(':');
        if (checked.has(pairKey)) continue;
        checked.add(pairKey);

        overlapsFound++;

        // Check if a flag already exists for this pair
        const existingFlag = await prisma.fraudFlag.findFirst({
          where: {
            organizationId,
            type: 'BOUNDARY_OVERLAP',
            plotId: plotA.id,
            status: 'OPEN',
          },
        });

        if (!existingFlag) {
          await prisma.fraudFlag.create({
            data: {
              organizationId,
              plotId: plotA.id,
              type: 'BOUNDARY_OVERLAP',
              severity: 'MEDIUM',
              description: `Plot "${plotA.name}" overlaps with plot "${overlap.plotName}" (overlap area: ${overlap.overlapArea >= 0 ? overlap.overlapArea + ' ha' : 'unknown'})`,
              confidenceScore: 0.85,
            },
          });
          flagsCreated++;
        }
      }
    }

    logger.info('Boundary overlap check completed', {
      organizationId,
      plotsScanned: plots.length,
      overlapsFound,
      flagsCreated,
    });

    return { overlapsFound, flagsCreated };
  } catch (error) {
    logger.error('Boundary overlap check failed', {
      organizationId,
      error: error.message,
    });
    throw error;
  }
}

// ---------------------------------------------------------------------------
// getFraudFlags — Paginated query of fraud flags for an org
// ---------------------------------------------------------------------------
async function getFraudFlags(organizationId, filters = {}) {
  try {
    const {
      type,
      severity,
      status,
      page = 1,
      limit = 20,
    } = filters;

    const where = { organizationId };

    if (type) where.type = type;
    if (severity) where.severity = severity;
    if (status) where.status = status;

    const skip = (page - 1) * limit;

    const [flags, total] = await Promise.all([
      prisma.fraudFlag.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          plot: {
            select: { name: true },
          },
        },
      }),
      prisma.fraudFlag.count({ where }),
    ]);

    return { flags, total, page, limit };
  } catch (error) {
    logger.error('Failed to fetch fraud flags', {
      organizationId,
      error: error.message,
    });
    throw error;
  }
}

// ---------------------------------------------------------------------------
// resolveFraudFlag — Update a flag's status and resolution details
// ---------------------------------------------------------------------------
async function resolveFraudFlag(flagId, status, resolution, resolvedBy) {
  try {
    const flag = await prisma.fraudFlag.update({
      where: { id: flagId },
      data: {
        status,
        resolution,
        resolvedBy,
        resolvedAt: new Date(),
      },
    });

    logger.info('Fraud flag resolved', {
      flagId,
      status,
      resolvedBy,
    });

    return flag;
  } catch (error) {
    logger.error('Failed to resolve fraud flag', {
      flagId,
      error: error.message,
    });
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------
const fraudService = {
  calculateNdviMismatchScore,
  verifyDamageAssessment,
  checkBoundaryOverlaps,
  getFraudFlags,
  resolveFraudFlag,
};

export default fraudService;
