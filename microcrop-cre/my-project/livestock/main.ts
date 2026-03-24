import {
  cre,
  Runner,
  type Runtime,
  type CronPayload,
  type HTTPSendRequester,
} from "@chainlink/cre-sdk";
import {
  ConsensusAggregationByFields,
  median,
  consensusIdenticalAggregation,
  type ConsensusAggregation,
} from "@chainlink/cre-sdk";
import { json, ok } from "@chainlink/cre-sdk";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Base64 Encoding (CRE runtime doesn't have btoa)
// ---------------------------------------------------------------------------
const BASE64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function toBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let result = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    result += BASE64_CHARS[(b0 >> 2) & 0x3f];
    result += BASE64_CHARS[((b0 << 4) | (b1 >> 4)) & 0x3f];
    result += i + 1 < bytes.length ? BASE64_CHARS[((b1 << 2) | (b2 >> 6)) & 0x3f] : "=";
    result += i + 2 < bytes.length ? BASE64_CHARS[b2 & 0x3f] : "=";
  }
  return result;
}

// ---------------------------------------------------------------------------
// OAuth Token Endpoint
// ---------------------------------------------------------------------------
const SENTINEL_HUB_OAUTH_URL =
  "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token";

// ---------------------------------------------------------------------------
// NDVI Evalscript — Sentinel-2 L2A for area-averaged forage NDVI
// Uses SCL (Scene Classification Layer) to mask clouds, shadows, water
// ---------------------------------------------------------------------------
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
  // Mask out clouds (8,9), cloud shadow (3), water (6), snow (11)
  var scl = sample.SCL;
  if (sample.dataMask === 0 || scl === 3 || scl === 6 || scl === 8 || scl === 9 || scl === 11) {
    return { ndvi: [NaN], dataMask: [0] };
  }
  var ndvi = (sample.B08 - sample.B04) / (sample.B08 + sample.B04);
  return { ndvi: [ndvi], dataMask: [1] };
}`.trim();

// ---------------------------------------------------------------------------
// KLIP County Bounding Boxes [minLon, minLat, maxLon, maxLat]
// Used for area-averaged NDVI over the entire county
// ---------------------------------------------------------------------------
const COUNTY_BBOXES: Record<string, [number, number, number, number]> = {
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

// ---------------------------------------------------------------------------
// Config Schema
// ---------------------------------------------------------------------------
const ConfigSchema = z.object({
  schedule: z.string(),
  backendApiUrl: z.string(),
  sentinelApiUrl: z.string(),
  ndviLookbackDays: z.number(), // 16 for MODIS-equivalent composite
});

type Config = z.infer<typeof ConfigSchema>;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface InsuranceUnit {
  id: string;
  county: string;
  unitCode: string;
  ndviBaselineLRLD: number;
  ndviBaselineSRSD: number;
  strikeLevelLRLD: number;
  strikeLevelSRSD: number;
}

interface NDVIResult {
  ndviValue: number;
}

interface TriggerResult {
  triggered: boolean;
  ndviValue?: number;
  strikeLevel?: number;
  alertId?: string;
  deficitPercent?: number;
  reason?: string;
}

// ---------------------------------------------------------------------------
// Determine Current IBLI Season
// ---------------------------------------------------------------------------
function getCurrentSeason(): { season: "LRLD" | "SRSD"; year: number } {
  const now = new Date();
  const month = now.getMonth() + 1; // 1-indexed
  const year = now.getFullYear();

  if (month >= 3 && month <= 9) {
    return { season: "LRLD", year };
  }
  // Oct-Dec: SRSD of current year. Jan-Feb: SRSD of previous year.
  if (month <= 2) {
    return { season: "SRSD", year: year - 1 };
  }
  return { season: "SRSD", year };
}

// ---------------------------------------------------------------------------
// Fetch Insurance Units from Backend
// ---------------------------------------------------------------------------
function fetchInsuranceUnits(
  sendRequester: HTTPSendRequester,
  config: Config,
  apiKey: string
): InsuranceUnit[] {
  const response = sendRequester.sendRequest({
    url: `${config.backendApiUrl}/api/internal/insurance-units`,
    method: "GET",
    headers: { "x-api-key": apiKey },
  }).result();

  if (!ok(response)) {
    throw new Error(`Failed to fetch insurance units: status ${response.statusCode}`);
  }

  const data = json(response) as { units: InsuranceUnit[] };
  return data.units;
}

// ---------------------------------------------------------------------------
// Fetch OAuth Token
// ---------------------------------------------------------------------------
function fetchOAuthToken(
  sendRequester: HTTPSendRequester,
  clientId: string,
  clientSecret: string
): string {
  const bodyStr = `grant_type=client_credentials&client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}`;
  const bodyBase64 = toBase64(bodyStr);

  const response = sendRequester.sendRequest({
    url: SENTINEL_HUB_OAUTH_URL,
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: bodyBase64,
  }).result();

  if (!ok(response)) {
    throw new Error(`OAuth token request failed: status ${response.statusCode}`);
  }

  const data = json(response) as any;
  return data.access_token as string;
}

// ---------------------------------------------------------------------------
// Fetch Area-Averaged NDVI via Sentinel Hub Statistical API
// Uses county-level bounding box for IBLI area averaging
// ---------------------------------------------------------------------------
function fetchAreaNDVI(
  sendRequester: HTTPSendRequester,
  config: Config,
  token: string,
  bbox: [number, number, number, number],
  lookbackDays: number
): NDVIResult {
  const now = new Date();
  const past = new Date(now.getTime() - lookbackDays * 24 * 60 * 60 * 1000);
  const toDate = now.toISOString().split("T")[0];
  const fromDate = past.toISOString().split("T")[0];

  const payload = {
    input: {
      bounds: {
        bbox: bbox,
        properties: { crs: "http://www.opengis.net/def/crs/EPSG/0/4326" },
      },
      data: [
        {
          type: "sentinel-2-l2a",
          dataFilter: {
            timeRange: { from: `${fromDate}T00:00:00Z`, to: `${toDate}T23:59:59Z` },
            maxCloudCoverage: 40,
          },
        },
      ],
    },
    aggregation: {
      timeRange: { from: `${fromDate}T00:00:00Z`, to: `${toDate}T23:59:59Z` },
      aggregationInterval: { of: `P${lookbackDays}D` },
      // Resolution in degrees (~1km at equator) to stay within CDSE 1500m/pixel limit
      // for large county-level bounding boxes (e.g. Turkana 2.5°×4.0°)
      resx: 0.01,
      resy: 0.01,
      evalscript: FORAGE_NDVI_EVALSCRIPT,
    },
    output: {
      responses: [{ identifier: "ndvi" }],
    },
  };

  const bodyStr = JSON.stringify(payload);
  const bodyBase64 = toBase64(bodyStr);

  const response = sendRequester.sendRequest({
    url: `${config.sentinelApiUrl}/statistics`,
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: bodyBase64,
  }).result();

  if (!ok(response)) {
    throw new Error(`Sentinel Hub Statistical API failed: status ${response.statusCode}`);
  }

  const data = json(response) as any;
  const stats = data?.data?.[0]?.outputs?.ndvi?.bands?.B0?.stats;
  const meanNdvi = stats?.mean ?? -1;

  return { ndviValue: meanNdvi };
}

// ---------------------------------------------------------------------------
// Submit NDVI Reading to Backend Forage Trigger
// ---------------------------------------------------------------------------
function submitForageTrigger(
  sendRequester: HTTPSendRequester,
  config: Config,
  apiKey: string,
  insuranceUnitId: string,
  season: string,
  year: number,
  ndviValue: number
): TriggerResult {
  const bodyStr = JSON.stringify({
    insuranceUnitId,
    season,
    year,
    ndviValue,
    source: "SENTINEL2",
  });
  const bodyBase64 = toBase64(bodyStr);

  const response = sendRequester.sendRequest({
    url: `${config.backendApiUrl}/api/internal/forage-trigger`,
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: bodyBase64,
  }).result();

  if (!ok(response)) {
    throw new Error(`Forage trigger submission failed: status ${response.statusCode}`);
  }

  const data = json(response) as { data: TriggerResult };
  return data.data;
}

// ---------------------------------------------------------------------------
// Main Cron Handler
// ---------------------------------------------------------------------------
const onCronTrigger = (
  runtime: Runtime<Config>,
  _payload: CronPayload
): string => {
  const config = runtime.config;
  runtime.log("IBLI livestock NDVI monitoring workflow triggered.");

  const backendApiKey = runtime.getSecret({ id: "BACKEND_API_KEY" }).result().value;
  const sentinelClientId = runtime.getSecret({ id: "SENTINEL_CLIENT_ID" }).result().value;
  const sentinelClientSecret = runtime.getSecret({ id: "SENTINEL_CLIENT_SECRET" }).result().value;

  const httpClient = new cre.capabilities.HTTPClient();

  // Determine current IBLI season
  const { season, year } = getCurrentSeason();
  runtime.log(`Current IBLI season: ${season} ${year}`);

  // Fetch insurance units via consensus
  const unitsFetcher = httpClient.sendRequest(
    runtime,
    (sendRequester: HTTPSendRequester) =>
      fetchInsuranceUnits(sendRequester, config, backendApiKey),
    consensusIdenticalAggregation<InsuranceUnit[]>() as unknown as ConsensusAggregation<InsuranceUnit[], true>
  );
  const units = unitsFetcher().result();

  if (units.length === 0) {
    runtime.log("No active insurance units found.");
    return "No insurance units to monitor.";
  }

  runtime.log(`Monitoring ${units.length} insurance units for ${season} ${year}.`);

  // Fetch Sentinel Hub OAuth token
  const tokenFetcher = httpClient.sendRequest(
    runtime,
    (sendRequester: HTTPSendRequester) =>
      fetchOAuthToken(sendRequester, sentinelClientId, sentinelClientSecret),
    consensusIdenticalAggregation<string>()
  );
  const sentinelToken = tokenFetcher().result();

  let unitsProcessed = 0;
  let alertsTriggered = 0;

  for (const unit of units) {
    const bbox = COUNTY_BBOXES[unit.unitCode];
    if (!bbox) {
      runtime.log(`No bounding box for unit ${unit.unitCode}, skipping.`);
      continue;
    }

    // Fetch area-averaged NDVI with median consensus across DON nodes
    const ndviFetcher = httpClient.sendRequest(
      runtime,
      (sendRequester: HTTPSendRequester) =>
        fetchAreaNDVI(sendRequester, config, sentinelToken, bbox, config.ndviLookbackDays),
      ConsensusAggregationByFields<NDVIResult>({
        ndviValue: () => median(),
      })
    );
    const ndviResult = ndviFetcher().result();

    if (ndviResult.ndviValue < 0) {
      runtime.log(`${unit.county} (${unit.unitCode}): No valid NDVI data, skipping.`);
      continue;
    }

    runtime.log(
      `${unit.county} (${unit.unitCode}): Area NDVI = ${ndviResult.ndviValue.toFixed(3)}`
    );

    // Submit to backend — it computes cumulative and evaluates trigger
    const triggerFetcher = httpClient.sendRequest(
      runtime,
      (sendRequester: HTTPSendRequester) =>
        submitForageTrigger(
          sendRequester, config, backendApiKey,
          unit.id, season, year, ndviResult.ndviValue
        ),
      consensusIdenticalAggregation<TriggerResult>() as unknown as ConsensusAggregation<TriggerResult, true>
    );
    const triggerResult = triggerFetcher().result();

    unitsProcessed++;

    if (triggerResult.triggered) {
      alertsTriggered++;
      runtime.log(
        `ALERT: ${unit.county} — NDVI ${triggerResult.ndviValue?.toFixed(3)} below strike ${triggerResult.strikeLevel?.toFixed(3)}, deficit ${triggerResult.deficitPercent}%`
      );
    }
  }

  const summary = `Monitored ${unitsProcessed}/${units.length} units. ${alertsTriggered} forage alerts triggered.`;
  runtime.log(summary);
  return summary;
};

// ---------------------------------------------------------------------------
// Workflow Init
// ---------------------------------------------------------------------------
const initWorkflow = (config: Config) => {
  const cron = new cre.capabilities.CronCapability();

  return [
    cre.handler(
      cron.trigger({ schedule: config.schedule }),
      onCronTrigger
    ),
  ];
};

// ---------------------------------------------------------------------------
// Entry Point
// ---------------------------------------------------------------------------
export async function main() {
  const runner = await Runner.newRunner<Config>({
    configSchema: ConfigSchema,
  });
  await runner.run(initWorkflow);
}

main();
