import prisma from '../config/database.js';
import logger from '../utils/logger.js';
import { PLATFORM_FEE_PERCENT } from '../utils/constants.js';

const forageTriggerService = {
  async evaluateTrigger(data) {
    const { insuranceUnitId, season, year, source } = data;
    // Accept either raw ndviValue (single reading) or pre-computed cumulativeNDVI
    const rawNdvi = data.ndviValue !== undefined ? parseFloat(data.ndviValue) : null;
    const providedCumulative = data.cumulativeNDVI !== undefined ? parseFloat(data.cumulativeNDVI) : null;

    const unit = await prisma.insuranceUnit.findUnique({
      where: { id: insuranceUnitId },
    });

    if (!unit) {
      throw new Error(`Insurance unit ${insuranceUnitId} not found`);
    }

    // Compute cumulative NDVI: average of all readings this season (including new one)
    let cumulativeNDVI;

    if (providedCumulative !== null) {
      // CRE sent pre-computed cumulative
      cumulativeNDVI = providedCumulative;
    } else if (rawNdvi !== null) {
      // CRE sent a single reading — compute cumulative from all stored readings + this one
      const existingReadings = await prisma.insuranceUnitNDVI.findMany({
        where: { insuranceUnitId, season, year },
        select: { ndviValue: true },
      });

      const allValues = [...existingReadings.map((r) => parseFloat(r.ndviValue)), rawNdvi];
      cumulativeNDVI = parseFloat((allValues.reduce((a, b) => a + b, 0) / allValues.length).toFixed(3));
    } else {
      throw new Error('Either ndviValue or cumulativeNDVI must be provided');
    }

    // Store NDVI reading
    await prisma.insuranceUnitNDVI.create({
      data: {
        insuranceUnitId,
        season,
        year,
        captureDate: new Date(),
        ndviValue: rawNdvi ?? cumulativeNDVI,
        cumulativeNDVI,
        source: source || 'MODIS',
      },
    });

    // Get strike level for season
    const strikeLevel = season === 'LRLD'
      ? parseFloat(unit.strikeLevelLRLD)
      : parseFloat(unit.strikeLevelSRSD);

    const ndviValue = cumulativeNDVI;

    // Check if NDVI breaches strike level
    if (ndviValue >= strikeLevel) {
      logger.info('NDVI above strike level, no trigger', {
        insuranceUnitId,
        county: unit.county,
        season,
        year,
        ndviValue,
        strikeLevel,
      });
      return { triggered: false, ndviValue, strikeLevel };
    }

    // NDVI is below strike level — trigger forage alert
    const deficitPercent = parseFloat(
      (((strikeLevel - ndviValue) / strikeLevel) * 100).toFixed(2)
    );

    logger.warn('NDVI BELOW strike level — creating ForageAlert', {
      county: unit.county,
      season,
      year,
      ndviValue,
      strikeLevel,
      deficitPercent,
    });

    // Check for existing alert for same unit/season/year
    const existingAlert = await prisma.forageAlert.findFirst({
      where: { insuranceUnitId, season, year, status: { in: ['TRIGGERED', 'PROCESSING', 'COMPLETED'] } },
    });

    if (existingAlert) {
      logger.info('ForageAlert already exists for this unit/season/year', {
        alertId: existingAlert.id,
        status: existingAlert.status,
      });
      return { triggered: false, reason: 'alert_already_exists', existingAlertId: existingAlert.id };
    }

    // Create forage alert
    const alert = await prisma.forageAlert.create({
      data: {
        insuranceUnitId,
        season,
        year,
        cumulativeNDVI: ndviValue,
        strikeLevel,
        deficitPercent,
        status: 'TRIGGERED',
      },
    });

    return {
      triggered: true,
      alertId: alert.id,
      county: unit.county,
      deficitPercent,
      ndviValue,
      strikeLevel,
    };
  },

  async processForageAlert(alertId) {
    const alert = await prisma.forageAlert.findUnique({
      where: { id: alertId },
      include: { insuranceUnit: true },
    });

    if (!alert) {
      throw new Error(`ForageAlert ${alertId} not found`);
    }

    if (alert.status !== 'TRIGGERED') {
      logger.info('ForageAlert already processed', { alertId, status: alert.status });
      return;
    }

    // Mark as processing
    await prisma.forageAlert.update({
      where: { id: alertId },
      data: { status: 'PROCESSING' },
    });

    try {
      // Find ALL active IBLI policies in this insurance unit + season
      const policies = await prisma.policy.findMany({
        where: {
          insuranceUnitId: alert.insuranceUnitId,
          season: alert.season,
          status: 'ACTIVE',
          premiumPaid: true,
          productType: 'LIVESTOCK',
        },
        include: {
          farmer: true,
          herd: true,
        },
      });

      logger.info(`ForageAlert ${alertId}: found ${policies.length} active policies to pay out`, {
        county: alert.insuranceUnit.county,
        season: alert.season,
      });

      let totalPayoutUSDC = 0;

      for (const policy of policies) {
        // Payout = deficit% × sumInsured (capped at 100%)
        const payoutPercent = Math.min(alert.deficitPercent, 100);
        const payoutAmount = parseFloat(
          ((payoutPercent / 100) * parseFloat(policy.sumInsured)).toFixed(2)
        );

        if (payoutAmount <= 0) continue;

        // Create DamageAssessment
        await prisma.damageAssessment.create({
          data: {
            policyId: policy.id,
            organizationId: policy.organizationId,
            ndviDamage: alert.deficitPercent,
            combinedDamage: alert.deficitPercent,
            damagePercent: Math.round(payoutPercent),
            source: 'CRE',
            triggered: true,
            triggerDate: new Date(),
          },
        });

        // Create Payout record
        await prisma.payout.create({
          data: {
            organizationId: policy.organizationId,
            policyId: policy.id,
            farmerId: policy.farmerId,
            amountUSDC: payoutAmount,
            damagePercent: payoutPercent,
            status: 'PENDING',
            initiatedAt: new Date(),
          },
        });

        totalPayoutUSDC += payoutAmount;

        logger.info('Created payout for IBLI policy', {
          policyId: policy.id,
          policyNumber: policy.policyNumber,
          farmerId: policy.farmerId,
          payoutAmount,
          deficitPercent: alert.deficitPercent,
        });
      }

      // Mark alert as completed
      await prisma.forageAlert.update({
        where: { id: alertId },
        data: {
          status: 'COMPLETED',
          policiesAffected: policies.length,
          totalPayoutUSDC: totalPayoutUSDC,
          processedAt: new Date(),
        },
      });

      logger.info('ForageAlert processed successfully', {
        alertId,
        policiesAffected: policies.length,
        totalPayoutUSDC,
      });

      return {
        alertId,
        policiesAffected: policies.length,
        totalPayoutUSDC,
      };
    } catch (error) {
      // Mark as failed
      await prisma.forageAlert.update({
        where: { id: alertId },
        data: { status: 'FAILED' },
      });

      logger.error('ForageAlert processing failed', { alertId, error: error.message });
      throw error;
    }
  },
};

export default forageTriggerService;
