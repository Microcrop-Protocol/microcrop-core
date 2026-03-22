import axios from 'axios';
import prisma from '../config/database.js';
import { env } from '../config/env.js';
import logger from '../utils/logger.js';
import { NDVI_THRESHOLDS } from '../utils/constants.js';

// ---------------------------------------------------------------------------
// Module-level token cache
// ---------------------------------------------------------------------------
let cachedToken = null;
let tokenExpiresAt = 0;

// ---------------------------------------------------------------------------
// SCL cloud-masked NDVI evalscript (from livestock CRE)
// Masks: cloud shadow (3), water (6), cloud medium (8), cloud high (9), snow (11)
// ---------------------------------------------------------------------------
const EVALSCRIPT = `//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B04", "B08", "SCL", "dataMask"] }],
    output: [{ id: "ndvi", bands: 1, sampleType: "FLOAT32" }, { id: "dataMask", bands: 1 }]
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

// ---------------------------------------------------------------------------
// getAccessToken — OAuth2 token with caching & 5-min refresh buffer
// ---------------------------------------------------------------------------
async function getAccessToken() {
  if (!env.sentinelClientId || !env.sentinelClientSecret) {
    logger.warn('Sentinel Hub credentials not configured — skipping token fetch');
    return null;
  }

  // Return cached token if still valid (5 min buffer)
  const now = Date.now();
  if (cachedToken && tokenExpiresAt - now > 5 * 60 * 1000) {
    return cachedToken;
  }

  try {
    const response = await axios.post(
      env.sentinelOAuthUrl,
      new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: env.sentinelClientId,
        client_secret: env.sentinelClientSecret,
      }).toString(),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 15000,
      }
    );

    cachedToken = response.data.access_token;
    // expires_in is seconds; convert to ms
    tokenExpiresAt = now + (response.data.expires_in || 300) * 1000;

    logger.debug('Sentinel Hub OAuth token acquired', {
      expiresIn: response.data.expires_in,
    });

    return cachedToken;
  } catch (error) {
    logger.error('Failed to acquire Sentinel Hub OAuth token', {
      error: error.message,
      status: error.response?.status,
    });
    throw error;
  }
}

// ---------------------------------------------------------------------------
// getQueryGeometry — Convert plot to Sentinel Hub geometry
// ---------------------------------------------------------------------------
function getQueryGeometry(plot) {
  if (plot.boundary) {
    // GeoJSON Polygon stored on the plot
    return { type: 'polygon', geometry: plot.boundary };
  }

  // Fall back to lat/lon bounding box (~500m around the point, matching CRE delta)
  const lat = parseFloat(plot.latitude);
  const lon = parseFloat(plot.longitude);
  const delta = 0.005;

  return {
    type: 'bbox',
    geometry: [lon - delta, lat - delta, lon + delta, lat + delta],
  };
}

// ---------------------------------------------------------------------------
// buildBounds — Build Sentinel Hub bounds object from geometry info
// ---------------------------------------------------------------------------
function buildBounds(queryGeom) {
  if (queryGeom.type === 'bbox') {
    return {
      bbox: queryGeom.geometry,
      properties: { crs: 'http://www.opengis.net/def/crs/EPSG/0/4326' },
    };
  }

  // Polygon geometry
  return {
    geometry: queryGeom.geometry,
    properties: { crs: 'http://www.opengis.net/def/crs/EPSG/0/4326' },
  };
}

// ---------------------------------------------------------------------------
// parseStatisticalResponse — Extract stats from Sentinel Hub response
// ---------------------------------------------------------------------------
function parseStatisticalResponse(data) {
  if (!data?.data || data.data.length === 0) {
    return null;
  }

  const results = [];

  for (const interval of data.data) {
    const stats = interval?.outputs?.ndvi?.bands?.B0?.stats;
    if (!stats || stats.sampleCount === 0) {
      continue;
    }

    results.push({
      date: interval.interval?.from || null,
      mean: stats.mean ?? null,
      min: stats.min ?? null,
      max: stats.max ?? null,
      stdDev: stats.stDev ?? null,
      sampleCount: stats.sampleCount ?? 0,
      cloudCover: stats.noDataCount != null && stats.sampleCount != null
        ? parseFloat(
            ((stats.noDataCount / (stats.noDataCount + stats.sampleCount)) * 100).toFixed(2)
          )
        : null,
    });
  }

  return results.length > 0 ? results : null;
}

// ---------------------------------------------------------------------------
// fetchNDVI — Core single-period NDVI fetch via Statistical API
// ---------------------------------------------------------------------------
async function fetchNDVI(plot, fromDate, toDate) {
  const token = await getAccessToken();
  if (!token) {
    logger.warn('Sentinel credentials not configured — returning null for NDVI fetch');
    return null;
  }

  const queryGeom = getQueryGeometry(plot);
  const bounds = buildBounds(queryGeom);

  const payload = {
    input: {
      bounds,
      data: [
        {
          type: 'sentinel-2-l2a',
          dataFilter: {
            timeRange: {
              from: `${fromDate}T00:00:00Z`,
              to: `${toDate}T23:59:59Z`,
            },
            maxCloudCoverage: 30,
          },
        },
      ],
    },
    aggregation: {
      timeRange: {
        from: `${fromDate}T00:00:00Z`,
        to: `${toDate}T23:59:59Z`,
      },
      aggregationInterval: { of: 'P1D' },
      evalscript: EVALSCRIPT,
    },
    output: {
      responses: [{ identifier: 'ndvi' }],
    },
  };

  try {
    const response = await axios.post(
      `${env.sentinelApiUrl}/statistical`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      }
    );

    const parsed = parseStatisticalResponse(response.data);
    if (!parsed || parsed.length === 0) {
      logger.debug('No NDVI data returned (likely cloud cover)', {
        plotId: plot.id,
        fromDate,
        toDate,
      });
      return null;
    }

    // Return the most recent interval with valid data
    const latest = parsed[parsed.length - 1];
    return {
      mean: latest.mean,
      min: latest.min,
      max: latest.max,
      stdDev: latest.stdDev,
      sampleCount: latest.sampleCount,
      cloudCover: latest.cloudCover,
      date: latest.date,
    };
  } catch (error) {
    logger.error('Sentinel Hub NDVI fetch failed', {
      plotId: plot.id,
      error: error.message,
      status: error.response?.status,
    });
    return null;
  }
}

// ---------------------------------------------------------------------------
// fetchNDVITimeSeries — Multi-interval NDVI fetch
// ---------------------------------------------------------------------------
async function fetchNDVITimeSeries(plot, fromDate, toDate, intervalDays = 5) {
  const token = await getAccessToken();
  if (!token) {
    logger.warn('Sentinel credentials not configured — returning null for time series');
    return null;
  }

  const queryGeom = getQueryGeometry(plot);
  const bounds = buildBounds(queryGeom);

  const payload = {
    input: {
      bounds,
      data: [
        {
          type: 'sentinel-2-l2a',
          dataFilter: {
            timeRange: {
              from: `${fromDate}T00:00:00Z`,
              to: `${toDate}T23:59:59Z`,
            },
            maxCloudCoverage: 30,
          },
        },
      ],
    },
    aggregation: {
      timeRange: {
        from: `${fromDate}T00:00:00Z`,
        to: `${toDate}T23:59:59Z`,
      },
      aggregationInterval: { of: `P${intervalDays}D` },
      evalscript: EVALSCRIPT,
    },
    output: {
      responses: [{ identifier: 'ndvi' }],
    },
  };

  try {
    const response = await axios.post(
      `${env.sentinelApiUrl}/statistical`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      }
    );

    const parsed = parseStatisticalResponse(response.data);
    if (!parsed) {
      logger.debug('No NDVI time series data returned', {
        plotId: plot.id,
        fromDate,
        toDate,
      });
      return [];
    }

    return parsed.map((entry) => ({
      date: entry.date,
      mean: entry.mean,
      min: entry.min,
      max: entry.max,
      stdDev: entry.stdDev,
      cloudCover: entry.cloudCover,
    }));
  } catch (error) {
    logger.error('Sentinel Hub NDVI time series fetch failed', {
      plotId: plot.id,
      error: error.message,
      status: error.response?.status,
    });
    return [];
  }
}

// ---------------------------------------------------------------------------
// storeNDVIReading — Upsert satellite data to SatelliteData table
// ---------------------------------------------------------------------------
async function storeNDVIReading(plotId, organizationId, ndviData, captureDate) {
  try {
    const record = await prisma.satelliteData.upsert({
      where: {
        plotId_captureDate_source: {
          plotId,
          captureDate: new Date(captureDate),
          source: 'SENTINEL2',
        },
      },
      create: {
        plotId,
        organizationId,
        captureDate: new Date(captureDate),
        ndvi: ndviData.mean,
        ndviMin: ndviData.min,
        ndviMax: ndviData.max,
        ndviStdDev: ndviData.stdDev,
        sampleCount: ndviData.sampleCount,
        cloudCover: ndviData.cloudCover,
        source: 'SENTINEL2',
      },
      update: {
        ndvi: ndviData.mean,
        ndviMin: ndviData.min,
        ndviMax: ndviData.max,
        ndviStdDev: ndviData.stdDev,
        sampleCount: ndviData.sampleCount,
        cloudCover: ndviData.cloudCover,
      },
    });

    logger.debug('Stored NDVI reading', { plotId, captureDate, ndvi: ndviData.mean });
    return record;
  } catch (error) {
    logger.error('Failed to store NDVI reading', {
      plotId,
      captureDate,
      error: error.message,
    });
    throw error;
  }
}

// ---------------------------------------------------------------------------
// computeBaseline — Compute historical NDVI baseline for a day-of-year window
// ---------------------------------------------------------------------------
async function computeBaseline(plotId, dayOfYear, windowDays = 16) {
  const halfWindow = Math.floor(windowDays / 2);
  const startDOY = dayOfYear - halfWindow;
  const endDOY = dayOfYear + halfWindow;

  try {
    // Fetch all historical readings for this plot
    const readings = await prisma.satelliteData.findMany({
      where: {
        plotId,
        source: 'SENTINEL2',
        ndvi: { not: null },
      },
      select: {
        ndvi: true,
        captureDate: true,
      },
    });

    // Filter to matching day-of-year window (handle year wrapping)
    const matching = readings.filter((r) => {
      const d = new Date(r.captureDate);
      const doy = getDayOfYear(d);

      if (startDOY < 1) {
        // Window wraps around year start
        return doy >= (365 + startDOY) || doy <= endDOY;
      }
      if (endDOY > 365) {
        // Window wraps around year end
        return doy >= startDOY || doy <= (endDOY - 365);
      }
      return doy >= startDOY && doy <= endDOY;
    });

    if (matching.length === 0) {
      logger.debug('No historical data for baseline computation', { plotId, dayOfYear });
      return null;
    }

    const values = matching.map((r) => parseFloat(r.ndvi)).sort((a, b) => a - b);
    const n = values.length;
    const sum = values.reduce((acc, v) => acc + v, 0);
    const baselineMean = parseFloat((sum / n).toFixed(3));

    // Approximate median via sorting
    const baselineMedian = n % 2 === 0
      ? parseFloat(((values[n / 2 - 1] + values[n / 2]) / 2).toFixed(3))
      : parseFloat(values[Math.floor(n / 2)].toFixed(3));

    // Standard deviation
    const variance = values.reduce((acc, v) => acc + (v - baselineMean) ** 2, 0) / n;
    const baselineStdDev = parseFloat(Math.sqrt(variance).toFixed(3));

    // Count distinct years
    const years = new Set(matching.map((r) => new Date(r.captureDate).getFullYear()));
    const yearsIncluded = years.size;

    // Get the plot's cropType for the baseline record
    const plot = await prisma.plot.findUnique({
      where: { id: plotId },
      select: { cropType: true },
    });

    // Upsert baseline
    const baseline = await prisma.nDVIBaseline.upsert({
      where: {
        plotId_periodStart_periodEnd: {
          plotId,
          periodStart: startDOY < 1 ? 365 + startDOY : startDOY,
          periodEnd: endDOY > 365 ? endDOY - 365 : endDOY,
        },
      },
      create: {
        plotId,
        periodStart: startDOY < 1 ? 365 + startDOY : startDOY,
        periodEnd: endDOY > 365 ? endDOY - 365 : endDOY,
        baselineMean,
        baselineMedian,
        baselineStdDev,
        yearsIncluded,
        cropType: plot?.cropType || 'MAIZE',
        computedAt: new Date(),
      },
      update: {
        baselineMean,
        baselineMedian,
        baselineStdDev,
        yearsIncluded,
        computedAt: new Date(),
      },
    });

    logger.debug('Computed NDVI baseline', {
      plotId,
      dayOfYear,
      baselineMean,
      baselineMedian,
      baselineStdDev,
      yearsIncluded,
    });

    return { baselineMean, baselineMedian, baselineStdDev, yearsIncluded };
  } catch (error) {
    logger.error('Failed to compute NDVI baseline', {
      plotId,
      dayOfYear,
      error: error.message,
    });
    throw error;
  }
}

// ---------------------------------------------------------------------------
// getBaseline — Retrieve or compute baseline for a plot/day-of-year
// ---------------------------------------------------------------------------
async function getBaseline(plotId, dayOfYear) {
  try {
    // Try to find existing baseline covering this day-of-year
    const existing = await prisma.nDVIBaseline.findFirst({
      where: {
        plotId,
        periodStart: { lte: dayOfYear },
        periodEnd: { gte: dayOfYear },
      },
    });

    if (existing) {
      return {
        baselineMean: parseFloat(existing.baselineMean),
        baselineMedian: parseFloat(existing.baselineMedian),
        baselineStdDev: parseFloat(existing.baselineStdDev),
        yearsIncluded: existing.yearsIncluded,
      };
    }

    // Not found — compute it
    return await computeBaseline(plotId, dayOfYear);
  } catch (error) {
    logger.error('Failed to get NDVI baseline', {
      plotId,
      dayOfYear,
      error: error.message,
    });
    return null;
  }
}

// ---------------------------------------------------------------------------
// classifyHealth — Classify vegetation health from NDVI + baseline
// ---------------------------------------------------------------------------
function classifyHealth(ndvi, baseline) {
  // Absolute classification
  let status;
  if (ndvi >= NDVI_THRESHOLDS.EXCELLENT) {
    status = 'EXCELLENT';
  } else if (ndvi >= NDVI_THRESHOLDS.GOOD) {
    status = 'GOOD';
  } else if (ndvi >= NDVI_THRESHOLDS.MODERATE) {
    status = 'MODERATE';
  } else if (ndvi >= NDVI_THRESHOLDS.POOR) {
    status = 'POOR';
  } else {
    status = 'CRITICAL';
  }

  let deviation = null;
  let isAnomaly = false;

  if (baseline && baseline.baselineStdDev > 0) {
    deviation = parseFloat(
      ((ndvi - baseline.baselineMean) / baseline.baselineStdDev).toFixed(2)
    );
    isAnomaly = ndvi < baseline.baselineMean - 2 * baseline.baselineStdDev;
  }

  return { status, ndvi, deviation, isAnomaly };
}

// ---------------------------------------------------------------------------
// calculateSatelliteDamage — Exact replica of CRE formula
// ---------------------------------------------------------------------------
function calculateSatelliteDamage(ndvi) {
  if (ndvi >= 0.7) return 0;
  if (ndvi >= 0.6) return 10;
  if (ndvi >= 0.5) return 25;
  if (ndvi >= 0.4) return 40;
  if (ndvi >= 0.3) return 60;
  if (ndvi >= 0.2) return 80;
  return 100;
}

// ---------------------------------------------------------------------------
// Helper: getDayOfYear
// ---------------------------------------------------------------------------
function getDayOfYear(date) {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date - start;
  const oneDay = 1000 * 60 * 60 * 24;
  return Math.floor(diff / oneDay);
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------
const satelliteService = {
  getAccessToken,
  getQueryGeometry,
  fetchNDVI,
  fetchNDVITimeSeries,
  storeNDVIReading,
  computeBaseline,
  getBaseline,
  classifyHealth,
  calculateSatelliteDamage,
};

export default satelliteService;
