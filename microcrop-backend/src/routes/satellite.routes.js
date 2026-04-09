import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { loadOrganization } from '../middleware/organization.middleware.js';
import { authorize } from '../middleware/authorize.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import {
  setBoundarySchema,
  gpsTrackSchema,
  ndviQuerySchema,
  resolveFraudFlagSchema,
  fraudFlagsQuerySchema,
  paginationQuerySchema,
} from '../validators/satellite.validator.js';
import prisma from '../config/database.js';
import { formatResponse, formatPaginatedResponse, paginate } from '../utils/helpers.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import satelliteService from '../services/satellite.service.js';
import geometryService from '../services/geometry.service.js';
import satelliteMonitoringService from '../services/satellite-monitoring.service.js';
import fraudService from '../services/fraud.service.js';
import damageVerificationService from '../services/damage-verification.service.js';
import logger from '../utils/logger.js';

const router = Router();

router.use(authenticate, loadOrganization);

// ============================================
// PLOT BOUNDARY
// ============================================

/**
 * POST /plots/:plotId/boundary
 * Set or update a plot's GeoJSON polygon boundary.
 */
router.post(
  '/plots/:plotId/boundary',
  authorize('ORG_ADMIN', 'ORG_STAFF'),
  validate(setBoundarySchema),
  async (req, res, next) => {
    try {
      const { plotId } = req.params;
      const { boundary } = req.body;

      // Verify plot exists and belongs to this organization
      const plot = await prisma.plot.findUnique({ where: { id: plotId } });
      if (!plot) {
        throw new NotFoundError('Plot not found');
      }
      if (plot.organizationId !== req.organization.id) {
        throw new NotFoundError('Plot not found');
      }

      // Validate GeoJSON geometry
      const geoResult = geometryService.validateGeoJSON(boundary);
      if (!geoResult.valid) {
        throw new ValidationError(geoResult.error);
      }

      // Compute centroid and area
      const metrics = geometryService.computePlotMetrics(boundary);

      // Persist boundary + computed metrics
      const updated = await prisma.plot.update({
        where: { id: plotId },
        data: {
          boundary,
          centroidLat: metrics.centroidLat,
          centroidLon: metrics.centroidLon,
          areaHectares: metrics.areaHectares,
        },
      });

      // Check for overlaps with other plots in the org
      let overlaps = [];
      try {
        overlaps = await geometryService.checkOverlaps(req.organization.id, boundary, plotId);
      } catch (error) {
        logger.warn('Overlap check failed (non-blocking)', { plotId, error: error.message });
      }

      res.status(200).json(formatResponse({
        plot: updated,
        overlaps: overlaps.length > 0 ? overlaps : null,
        overlapWarning: overlaps.length > 0
          ? `Boundary overlaps with ${overlaps.length} other plot(s)`
          : null,
      }));
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /plots/:plotId/boundary/gps-track
 * Convert raw GPS track points (from a boundary walk) into a GeoJSON polygon
 * and store it as the plot boundary.
 */
router.post(
  '/plots/:plotId/boundary/gps-track',
  authorize('ORG_ADMIN', 'ORG_STAFF'),
  validate(gpsTrackSchema),
  async (req, res, next) => {
    try {
      const { plotId } = req.params;
      const { points, accuracyThreshold } = req.body;

      // Verify plot exists and belongs to this organization
      const plot = await prisma.plot.findUnique({ where: { id: plotId } });
      if (!plot) {
        throw new NotFoundError('Plot not found');
      }
      if (plot.organizationId !== req.organization.id) {
        throw new NotFoundError('Plot not found');
      }

      const totalPointsReceived = points.length;

      // 1. Filter out points with accuracy worse than threshold
      const filtered = points.filter((p) => p.accuracy <= accuracyThreshold);
      const pointsFilteredOut = totalPointsReceived - filtered.length;

      if (filtered.length < 4) {
        throw new ValidationError(
          `Only ${filtered.length} point(s) remain after accuracy filtering (threshold: ${accuracyThreshold}m). Minimum 4 required.`
        );
      }

      // 2. Sort by timestamp
      filtered.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

      // 3. Douglas-Peucker simplification (tolerance ~0.00005 degrees ~ 5.5m)
      const SIMPLIFICATION_TOLERANCE = 0.00005;

      function perpendicularDistance(point, lineStart, lineEnd) {
        const dx = lineEnd.lon - lineStart.lon;
        const dy = lineEnd.lat - lineStart.lat;
        const lengthSq = dx * dx + dy * dy;
        if (lengthSq === 0) {
          const ex = point.lon - lineStart.lon;
          const ey = point.lat - lineStart.lat;
          return Math.sqrt(ex * ex + ey * ey);
        }
        const t = Math.max(0, Math.min(1,
          ((point.lon - lineStart.lon) * dx + (point.lat - lineStart.lat) * dy) / lengthSq
        ));
        const projLon = lineStart.lon + t * dx;
        const projLat = lineStart.lat + t * dy;
        const dLon = point.lon - projLon;
        const dLat = point.lat - projLat;
        return Math.sqrt(dLon * dLon + dLat * dLat);
      }

      function douglasPeucker(pts, tolerance) {
        if (pts.length <= 2) return pts;

        let maxDist = 0;
        let maxIdx = 0;
        const first = pts[0];
        const last = pts[pts.length - 1];

        for (let i = 1; i < pts.length - 1; i++) {
          const dist = perpendicularDistance(pts[i], first, last);
          if (dist > maxDist) {
            maxDist = dist;
            maxIdx = i;
          }
        }

        if (maxDist > tolerance) {
          const left = douglasPeucker(pts.slice(0, maxIdx + 1), tolerance);
          const right = douglasPeucker(pts.slice(maxIdx), tolerance);
          return left.slice(0, -1).concat(right);
        }

        return [first, last];
      }

      let simplified = douglasPeucker(filtered, SIMPLIFICATION_TOLERANCE);

      // Ensure we still have enough points for a polygon (min 3 distinct vertices)
      if (simplified.length < 3) {
        simplified = filtered;
      }

      // 4. Close the polygon (ensure first == last)
      const coords = simplified.map((p) => [p.lon, p.lat]);
      const firstCoord = coords[0];
      const lastCoord = coords[coords.length - 1];
      if (firstCoord[0] !== lastCoord[0] || firstCoord[1] !== lastCoord[1]) {
        coords.push([firstCoord[0], firstCoord[1]]);
      }

      // Must have at least 4 coordinates (3 vertices + closing point) for a valid polygon
      if (coords.length < 4) {
        throw new ValidationError(
          'GPS track does not form a valid polygon. At least 3 distinct points are required after simplification.'
        );
      }

      // 5. Build GeoJSON Polygon
      const boundary = {
        type: 'Polygon',
        coordinates: [coords],
      };

      // 6. Validate the polygon (self-intersections, structure)
      const geoResult = geometryService.validateGeoJSON(boundary);
      if (!geoResult.valid) {
        throw new ValidationError(`Generated polygon is invalid: ${geoResult.error}`);
      }

      // 7. Compute centroid and area using existing geometry service
      const metrics = geometryService.computePlotMetrics(boundary);

      // 8. Compute average accuracy of points that were kept
      const avgAccuracy = parseFloat(
        (filtered.reduce((sum, p) => sum + p.accuracy, 0) / filtered.length).toFixed(1)
      );

      // 9. Persist boundary + computed metrics
      const updated = await prisma.plot.update({
        where: { id: plotId },
        data: {
          boundary,
          centroidLat: metrics.centroidLat,
          centroidLon: metrics.centroidLon,
          areaHectares: metrics.areaHectares,
        },
      });

      // 10. Check for overlaps (non-blocking)
      let overlaps = [];
      try {
        overlaps = await geometryService.checkOverlaps(req.organization.id, boundary, plotId);
      } catch (error) {
        logger.warn('Overlap check failed (non-blocking)', { plotId, error: error.message });
      }

      const finalVertices = coords.length - 1; // exclude closing duplicate

      res.status(200).json(formatResponse({
        plot: {
          id: updated.id,
          boundary: updated.boundary,
          centroidLat: metrics.centroidLat,
          centroidLon: metrics.centroidLon,
          areaHectares: metrics.areaHectares,
        },
        metadata: {
          totalPointsReceived,
          pointsFilteredOut,
          finalVertices,
          accuracyThreshold,
          avgAccuracy,
        },
        overlaps: overlaps.length > 0 ? overlaps : null,
        overlapWarning: overlaps.length > 0
          ? `Boundary overlaps with ${overlaps.length} other plot(s)`
          : null,
      }));
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /plots/:plotId/boundary
 * Retrieve a plot's boundary, centroid, and area.
 */
router.get('/plots/:plotId/boundary', async (req, res, next) => {
  try {
    const { plotId } = req.params;

    const plot = await prisma.plot.findUnique({
      where: { id: plotId },
      select: {
        id: true,
        name: true,
        boundary: true,
        centroidLat: true,
        centroidLon: true,
        areaHectares: true,
        organizationId: true,
      },
    });

    if (!plot || plot.organizationId !== req.organization.id) {
      throw new NotFoundError('Plot not found');
    }

    res.status(200).json(formatResponse({
      plotId: plot.id,
      name: plot.name,
      boundary: plot.boundary,
      centroidLat: plot.centroidLat ? parseFloat(plot.centroidLat) : null,
      centroidLon: plot.centroidLon ? parseFloat(plot.centroidLon) : null,
      areaHectares: plot.areaHectares ? parseFloat(plot.areaHectares) : null,
    }));
  } catch (error) {
    next(error);
  }
});

// ============================================
// NDVI & HEALTH
// ============================================

/**
 * GET /plots/:plotId/ndvi
 * Retrieve historical NDVI readings for a plot.
 */
router.get(
  '/plots/:plotId/ndvi',
  validate(ndviQuerySchema, 'query'),
  async (req, res, next) => {
    try {
      const { plotId } = req.params;

      const plot = await prisma.plot.findUnique({ where: { id: plotId } });
      if (!plot || plot.organizationId !== req.organization.id) {
        throw new NotFoundError('Plot not found');
      }

      // Dates default to last 90 days via validator schema
      const from = new Date(req.query.from);
      const to = new Date(req.query.to);

      const readings = await prisma.satelliteData.findMany({
        where: {
          plotId,
          captureDate: { gte: from, lte: to },
          ...(req.query.source && { source: req.query.source }),
        },
        orderBy: { captureDate: 'asc' },
      });

      res.status(200).json(formatResponse(readings));
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /plots/:plotId/health
 * Get current vegetation health classification for a plot.
 */
router.get('/plots/:plotId/health', async (req, res, next) => {
  try {
    const { plotId } = req.params;

    const plot = await prisma.plot.findUnique({
      where: { id: plotId },
      include: {
        satelliteData: {
          orderBy: { captureDate: 'desc' },
          take: 1,
        },
      },
    });

    if (!plot || plot.organizationId !== req.organization.id) {
      throw new NotFoundError('Plot not found');
    }

    if (!plot.satelliteData || plot.satelliteData.length === 0) {
      return res.status(200).json(formatResponse({
        plotId,
        health: 'UNKNOWN',
        message: 'No satellite data available for this plot',
      }));
    }

    const latest = plot.satelliteData[0];
    const ndvi = parseFloat(latest.ndvi);

    // Get day-of-year for baseline lookup
    const captureDate = new Date(latest.captureDate);
    const start = new Date(captureDate.getFullYear(), 0, 0);
    const diff = captureDate - start;
    const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24));

    const baseline = await satelliteService.getBaseline(plotId, dayOfYear);
    const health = satelliteService.classifyHealth(ndvi, baseline);

    res.status(200).json(formatResponse({
      plotId,
      ndvi,
      health: health.status,
      deviation: health.deviation,
      isAnomaly: health.isAnomaly,
      captureDate: latest.captureDate,
      source: latest.source,
      baseline: baseline
        ? {
            mean: baseline.baselineMean,
            stdDev: baseline.baselineStdDev,
            yearsIncluded: baseline.yearsIncluded,
          }
        : null,
    }));
  } catch (error) {
    next(error);
  }
});

/**
 * GET /plots/:plotId/satellite
 * Paginated satellite data history for a plot.
 */
router.get(
  '/plots/:plotId/satellite',
  validate(paginationQuerySchema, 'query'),
  async (req, res, next) => {
    try {
      const { plotId } = req.params;

      const plot = await prisma.plot.findUnique({ where: { id: plotId } });
      if (!plot || plot.organizationId !== req.organization.id) {
        throw new NotFoundError('Plot not found');
      }

      const { skip, take, page, limit } = paginate(req.query.page, req.query.limit);

      const [data, total] = await Promise.all([
        prisma.satelliteData.findMany({
          where: { plotId },
          orderBy: { captureDate: 'desc' },
          skip,
          take,
        }),
        prisma.satelliteData.count({ where: { plotId } }),
      ]);

      res.status(200).json(formatPaginatedResponse(data, total, page, limit));
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /plots/:plotId/ndvi/fetch
 * On-demand NDVI fetch from Sentinel Hub.
 */
router.post(
  '/plots/:plotId/ndvi/fetch',
  authorize('ORG_ADMIN'),
  async (req, res, next) => {
    try {
      const { plotId } = req.params;

      const plot = await prisma.plot.findUnique({ where: { id: plotId } });
      if (!plot || plot.organizationId !== req.organization.id) {
        throw new NotFoundError('Plot not found');
      }

      // Fetch last 7 days of NDVI
      const now = new Date();
      const sevenDaysAgo = new Date(now);
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const fromDateStr = sevenDaysAgo.toISOString().split('T')[0];
      const toDateStr = now.toISOString().split('T')[0];

      const ndviData = await satelliteService.fetchNDVI(plot, fromDateStr, toDateStr);

      if (!ndviData) {
        return res.status(200).json(formatResponse({
          plotId,
          message: 'No NDVI data available (likely cloud cover)',
          reading: null,
        }));
      }

      // Store the reading
      const captureDate = ndviData.date || toDateStr;
      const record = await satelliteService.storeNDVIReading(
        plotId,
        req.organization.id,
        ndviData,
        captureDate
      );

      res.status(200).json(formatResponse({
        plotId,
        reading: record,
      }));
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// MONITORING
// ============================================

/**
 * GET /monitoring
 * Org-wide satellite monitoring dashboard.
 */
router.get(
  '/monitoring',
  validate(paginationQuerySchema, 'query'),
  async (req, res, next) => {
    try {
      const orgId = req.organization.id;
      const { skip, take, page, limit } = paginate(req.query.page, req.query.limit);

      const plotWhere = { organizationId: orgId };

      // Get paginated plots with their latest satellite data
      const [plots, totalPlots] = await Promise.all([
        prisma.plot.findMany({
          where: plotWhere,
          skip,
          take,
          include: {
            satelliteData: {
              orderBy: { captureDate: 'desc' },
              take: 1,
            },
          },
        }),
        prisma.plot.count({ where: plotWhere }),
      ]);

      // Classify each plot by health status
      const healthCounts = { EXCELLENT: 0, GOOD: 0, MODERATE: 0, POOR: 0, CRITICAL: 0, UNKNOWN: 0 };
      let totalNdvi = 0;
      let ndviCount = 0;

      for (const plot of plots) {
        if (!plot.satelliteData || plot.satelliteData.length === 0) {
          healthCounts.UNKNOWN++;
          continue;
        }

        const ndvi = parseFloat(plot.satelliteData[0].ndvi);
        if (isNaN(ndvi)) {
          healthCounts.UNKNOWN++;
          continue;
        }

        totalNdvi += ndvi;
        ndviCount++;

        // Simple classification without baseline for dashboard overview
        const health = satelliteService.classifyHealth(ndvi, null);
        healthCounts[health.status] = (healthCounts[health.status] || 0) + 1;
      }

      // Count recent anomalies (CRE damage assessments in last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const anomalyCount = await prisma.damageAssessment.count({
        where: {
          organizationId: orgId,
          source: 'CRE',
          createdAt: { gte: thirtyDaysAgo },
        },
      });

      res.status(200).json({
        success: true,
        data: {
          totalPlots,
          healthDistribution: healthCounts,
          averageNdvi: ndviCount > 0 ? parseFloat((totalNdvi / ndviCount).toFixed(3)) : null,
          recentAnomalies: anomalyCount,
        },
        pagination: {
          page,
          limit,
          total: totalPlots,
          totalPages: Math.ceil(totalPlots / limit),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /monitoring/anomalies
 * Recent CRE-detected anomalies for the org (paginated).
 */
router.get(
  '/monitoring/anomalies',
  validate(paginationQuerySchema, 'query'),
  async (req, res, next) => {
    try {
      const orgId = req.organization.id;
      const { skip, take, page, limit } = paginate(req.query.page, req.query.limit);

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const where = {
        organizationId: orgId,
        source: 'CRE',
        createdAt: { gte: thirtyDaysAgo },
      };

      const [anomalies, total] = await Promise.all([
        prisma.damageAssessment.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take,
          include: {
            policy: {
              select: {
                id: true,
                policyNumber: true,
                plot: {
                  select: {
                    id: true,
                    name: true,
                    latitude: true,
                    longitude: true,
                    cropType: true,
                  },
                },
              },
            },
          },
        }),
        prisma.damageAssessment.count({ where }),
      ]);

      res.status(200).json(formatPaginatedResponse(anomalies, total, page, limit));
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// DAMAGE VERIFICATION
// ============================================

/**
 * GET /damage-assessments/:assessmentId/verify
 * Get a verification report comparing on-chain claims with satellite evidence.
 */
router.get('/damage-assessments/:assessmentId/verify', async (req, res, next) => {
  try {
    const { assessmentId } = req.params;

    // Verify the assessment belongs to this organization
    const assessment = await prisma.damageAssessment.findUnique({
      where: { id: assessmentId },
      select: { organizationId: true },
    });

    if (!assessment) {
      throw new NotFoundError('Damage assessment not found');
    }
    if (assessment.organizationId !== req.organization.id) {
      throw new NotFoundError('Damage assessment not found');
    }

    const report = await damageVerificationService.getVerificationReport(assessmentId);

    if (!report) {
      throw new NotFoundError('Verification report could not be generated');
    }

    res.status(200).json(formatResponse(report));
  } catch (error) {
    next(error);
  }
});

// ============================================
// FRAUD
// ============================================

/**
 * GET /fraud/flags
 * Paginated fraud flags for the org.
 */
router.get(
  '/fraud/flags',
  authorize('ORG_ADMIN', 'PLATFORM_ADMIN'),
  validate(fraudFlagsQuerySchema, 'query'),
  async (req, res, next) => {
    try {
      const result = await fraudService.getFraudFlags(req.organization.id, req.query);

      res.status(200).json(formatPaginatedResponse(
        result.flags,
        result.total,
        result.page,
        result.limit
      ));
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PATCH /fraud/flags/:flagId
 * Resolve or update a fraud flag's status.
 */
router.patch(
  '/fraud/flags/:flagId',
  authorize('ORG_ADMIN', 'PLATFORM_ADMIN'),
  validate(resolveFraudFlagSchema),
  async (req, res, next) => {
    try {
      const { flagId } = req.params;
      const { status, resolution } = req.body;

      // Verify the flag belongs to this organization
      const flag = await prisma.fraudFlag.findUnique({
        where: { id: flagId },
        select: { organizationId: true },
      });

      if (!flag) {
        throw new NotFoundError('Fraud flag not found');
      }
      if (flag.organizationId !== req.organization.id) {
        throw new NotFoundError('Fraud flag not found');
      }

      const updated = await fraudService.resolveFraudFlag(
        flagId,
        status,
        resolution,
        req.user.id
      );

      res.status(200).json(formatResponse(updated));
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /fraud/summary
 * Aggregated fraud statistics for the org.
 */
router.get(
  '/fraud/summary',
  authorize('ORG_ADMIN', 'PLATFORM_ADMIN'),
  async (req, res, next) => {
    try {
      const orgId = req.organization.id;

      const [byType, bySeverity, byStatus, total] = await Promise.all([
        prisma.fraudFlag.groupBy({
          by: ['type'],
          where: { organizationId: orgId },
          _count: { id: true },
        }),
        prisma.fraudFlag.groupBy({
          by: ['severity'],
          where: { organizationId: orgId },
          _count: { id: true },
        }),
        prisma.fraudFlag.groupBy({
          by: ['status'],
          where: { organizationId: orgId },
          _count: { id: true },
        }),
        prisma.fraudFlag.count({ where: { organizationId: orgId } }),
      ]);

      const formatGroup = (groups) =>
        groups.reduce((acc, g) => {
          acc[g.type || g.severity || g.status] = g._count.id;
          return acc;
        }, {});

      res.status(200).json(formatResponse({
        total,
        byType: formatGroup(byType),
        bySeverity: formatGroup(bySeverity),
        byStatus: formatGroup(byStatus),
      }));
    } catch (error) {
      next(error);
    }
  }
);

export const satelliteRouter = router;
