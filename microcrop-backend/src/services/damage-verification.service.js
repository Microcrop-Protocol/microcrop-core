import prisma from '../config/database.js';
import logger from '../utils/logger.js';
import satelliteService from './satellite.service.js';

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
// enrichDamageAssessment — Add satellite-derived damage fields to a
// DamageAssessment without overwriting the authoritative on-chain value.
// ---------------------------------------------------------------------------
async function enrichDamageAssessment(assessmentId) {
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
      logger.warn('Damage enrichment: assessment not found', { assessmentId });
      return null;
    }

    const plot = assessment.policy?.plot;

    if (!plot) {
      logger.debug('Damage enrichment: no plot on policy, skipping', {
        assessmentId,
        policyId: assessment.policyId,
      });
      return assessment;
    }

    // Fetch latest satellite data (last 10 days)
    const now = new Date();
    const tenDaysAgo = new Date(now);
    tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);

    const fromDate = tenDaysAgo.toISOString().split('T')[0];
    const toDate = now.toISOString().split('T')[0];

    const ndviResult = await satelliteService.fetchNDVI(plot, fromDate, toDate);

    if (!ndviResult || ndviResult.mean == null) {
      logger.debug('Damage enrichment: no NDVI data available', {
        assessmentId,
        plotId: plot.id,
      });
      return assessment;
    }

    const ndvi = ndviResult.mean;

    // Calculate satellite-derived damage
    const satDamage = satelliteService.calculateSatelliteDamage(ndvi);

    // Calculate NDVI deviation from baseline
    const dayOfYear = getDayOfYear(now);
    const baseline = await satelliteService.getBaseline(plot.id, dayOfYear);

    let ndviDeviation = null;
    if (baseline && baseline.baselineMean && baseline.baselineStdDev > 0) {
      ndviDeviation = parseFloat(
        (((baseline.baselineMean - ndvi) / baseline.baselineMean) * 100).toFixed(2)
      );
    }

    // Update the assessment — don't overwrite damagePercent (authoritative on-chain value)
    const updated = await prisma.damageAssessment.update({
      where: { id: assessmentId },
      data: {
        satelliteDamage: satDamage,
        ndviDamage: ndviDeviation,
      },
    });

    logger.info('Damage assessment enriched with satellite data', {
      assessmentId,
      satelliteDamage: satDamage,
      ndviDeviation,
      observedNdvi: ndvi,
    });

    return updated;
  } catch (error) {
    logger.error('Damage enrichment failed', {
      assessmentId,
      error: error.message,
    });
    throw error;
  }
}

// ---------------------------------------------------------------------------
// getVerificationReport — Build a structured comparison report between
// on-chain claims and satellite evidence.
// ---------------------------------------------------------------------------
async function getVerificationReport(assessmentId) {
  try {
    const assessment = await prisma.damageAssessment.findUnique({
      where: { id: assessmentId },
      include: {
        policy: {
          include: {
            plot: true,
            farmer: true,
          },
        },
      },
    });

    if (!assessment) {
      logger.warn('Verification report: assessment not found', { assessmentId });
      return null;
    }

    const plot = assessment.policy?.plot;

    // Determine the date range around the assessment
    const assessmentDate = new Date(assessment.createdAt);
    const fromDate = new Date(assessmentDate);
    fromDate.setDate(fromDate.getDate() - 15);
    const toDate = new Date(assessmentDate);
    toDate.setDate(toDate.getDate() + 5);

    let latestNdvi = null;
    let captureDate = null;
    let cloudCover = null;
    let expectedDamage = null;

    if (plot) {
      const ndviResult = await satelliteService.fetchNDVI(
        plot,
        fromDate.toISOString().split('T')[0],
        toDate.toISOString().split('T')[0]
      );

      if (ndviResult && ndviResult.mean != null) {
        latestNdvi = ndviResult.mean;
        captureDate = ndviResult.date;
        cloudCover = ndviResult.cloudCover;
        expectedDamage = satelliteService.calculateSatelliteDamage(latestNdvi);
      }
    }

    // Get baseline for comparison
    let baselineData = null;
    let deviation = null;
    let isAnomaly = false;

    if (plot) {
      const dayOfYear = getDayOfYear(assessmentDate);
      baselineData = await satelliteService.getBaseline(plot.id, dayOfYear);

      if (baselineData && baselineData.baselineStdDev > 0 && latestNdvi != null) {
        deviation = parseFloat(
          ((latestNdvi - baselineData.baselineMean) / baselineData.baselineStdDev).toFixed(2)
        );
        isAnomaly = latestNdvi < baselineData.baselineMean - 2 * baselineData.baselineStdDev;
      }
    }

    // Build verdict
    const claimedDamage = assessment.damagePercent || 0;
    let claimConsistency = 'CONSISTENT';
    let confidenceScore = 0;
    let explanation = 'Insufficient satellite data for verification.';

    if (latestNdvi != null && expectedDamage != null) {
      const gap = Math.abs(claimedDamage - expectedDamage);

      if (gap <= 15) {
        claimConsistency = 'CONSISTENT';
        confidenceScore = parseFloat((1 - gap / 100).toFixed(2));
        explanation = `Claimed damage (${claimedDamage}%) is within ${gap}pp of satellite-estimated damage (${expectedDamage}%).`;
      } else if (gap <= 35) {
        claimConsistency = 'SUSPICIOUS';
        confidenceScore = parseFloat((gap / 100).toFixed(2));
        explanation = `Claimed damage (${claimedDamage}%) differs by ${gap}pp from satellite estimate (${expectedDamage}%). Manual review recommended.`;
      } else {
        claimConsistency = 'INCONSISTENT';
        confidenceScore = parseFloat(Math.min(gap / 100, 1).toFixed(2));
        explanation = `Claimed damage (${claimedDamage}%) is ${gap}pp higher than satellite estimate (${expectedDamage}%). High likelihood of overestimation.`;
      }
    }

    return {
      assessment: {
        id: assessment.id,
        damagePercent: claimedDamage,
        source: assessment.source,
        createdAt: assessment.createdAt,
      },
      onChainClaim: {
        damagePercent: claimedDamage,
        txHash: assessment.txHash,
        blockNumber: assessment.blockNumber ? Number(assessment.blockNumber) : null,
      },
      satelliteEvidence: {
        ndvi: latestNdvi,
        expectedDamage,
        captureDate,
        cloudCover,
        source: 'SENTINEL2',
      },
      historicalBaseline: {
        baselineMean: baselineData?.baselineMean ?? null,
        baselineStdDev: baselineData?.baselineStdDev ?? null,
        deviation,
        isAnomaly,
      },
      verdict: {
        claimConsistency,
        confidenceScore,
        explanation,
      },
    };
  } catch (error) {
    logger.error('Verification report generation failed', {
      assessmentId,
      error: error.message,
    });
    throw error;
  }
}

// ---------------------------------------------------------------------------
// calculateSatelliteDamage — Delegate to satellite service
// ---------------------------------------------------------------------------
function calculateSatelliteDamage(ndvi) {
  return satelliteService.calculateSatelliteDamage(ndvi);
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------
const damageVerificationService = {
  enrichDamageAssessment,
  getVerificationReport,
  calculateSatelliteDamage,
};

export default damageVerificationService;
