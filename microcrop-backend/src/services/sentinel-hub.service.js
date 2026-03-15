import { env } from '../config/env.js';
import logger from '../utils/logger.js';

let cachedToken = null;
let tokenExpiresAt = 0;

const OAUTH_URL = 'https://services.sentinel-hub.com/auth/realms/main/protocol/openid-connect/token';

// NDVI evalscript for Sentinel-2 L2A with cloud masking
const FORAGE_NDVI_EVALSCRIPT = `
//VERSION=3
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
}`.trim();

// Crop NDVI evalscript (simpler, no SCL masking needed for small plot bbox)
const CROP_NDVI_EVALSCRIPT = `
//VERSION=3
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
  var ndvi = (sample.B08 - sample.B04) / (sample.B08 + sample.B04);
  return { ndvi: [ndvi], dataMask: [1] };
}`.trim();

async function getAccessToken() {
  if (cachedToken && Date.now() < tokenExpiresAt - 60000) {
    return cachedToken;
  }

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: env.sentinelHubClientId,
    client_secret: env.sentinelHubClientSecret,
  });

  const res = await fetch(OAUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    throw new Error(`Sentinel Hub OAuth failed: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiresAt = Date.now() + (data.expires_in * 1000);
  return cachedToken;
}

/**
 * Fetch area-averaged NDVI for a county bounding box (livestock/IBLI).
 * @param {[number,number,number,number]} bbox - [minLon, minLat, maxLon, maxLat]
 * @param {number} lookbackDays - typically 16 for MODIS-equivalent
 * @returns {Promise<number>} mean NDVI value, or -1 if no valid data
 */
export async function fetchAreaNDVI(bbox, lookbackDays = 16) {
  const token = await getAccessToken();

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
      evalscript: FORAGE_NDVI_EVALSCRIPT,
    },
    output: {
      responses: [{ identifier: 'ndvi' }],
    },
  };

  const res = await fetch(`${env.sentinelHubApiUrl}/statistics`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Sentinel Hub Statistical API failed: ${res.status} ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  const stats = data?.data?.[0]?.outputs?.ndvi?.bands?.B0?.stats;
  return stats?.mean ?? -1;
}

/**
 * Fetch point-based NDVI for a crop plot (~500m bbox around point).
 * @param {number} lat
 * @param {number} lon
 * @param {number} lookbackDays - typically 7
 * @returns {Promise<number>} mean NDVI value, or 0.5 as fallback
 */
export async function fetchPlotNDVI(lat, lon, lookbackDays = 7) {
  const token = await getAccessToken();

  const delta = 0.005; // ~500m
  const bbox = [lon - delta, lat - delta, lon + delta, lat + delta];

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
          maxCloudCoverage: 30,
        },
      }],
    },
    aggregation: {
      timeRange: { from: `${fromDate}T00:00:00Z`, to: `${toDate}T23:59:59Z` },
      aggregationInterval: { of: `P${lookbackDays}D` },
      evalscript: CROP_NDVI_EVALSCRIPT,
    },
    output: {
      responses: [{ identifier: 'ndvi' }],
    },
  };

  const res = await fetch(`${env.sentinelHubApiUrl}/statistics`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Sentinel Hub Statistical API failed: ${res.status} ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  const stats = data?.data?.[0]?.outputs?.ndvi?.bands?.B0?.stats;
  return stats?.mean ?? 0.5;
}
