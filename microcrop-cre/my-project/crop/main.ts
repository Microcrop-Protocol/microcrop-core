import {
  cre,
  Runner,
  type Runtime,
  type CronPayload,
  type HTTPSendRequester,
  type ConfidentialHTTPSendRequester,
  TxStatus,
} from "@chainlink/cre-sdk";
import {
  ConsensusAggregationByFields,
  median,
  consensusIdenticalAggregation,
  type ConsensusAggregation,
} from "@chainlink/cre-sdk";
import { getNetwork, prepareReportRequest } from "@chainlink/cre-sdk";
import { json, ok } from "@chainlink/cre-sdk";
import { encodeFunctionData } from "viem";
import { z } from "zod";
import { PayoutReceiverABI } from "./contracts/abi";

// ---------------------------------------------------------------------------
// Config Schema
// ---------------------------------------------------------------------------
const ConfigSchema = z.object({
  schedule: z.string(),
  backendApiUrl: z.string(),
  weatherXmApiUrl: z.string(),
  satelliteProvider: z.enum(["planet", "sentinel"]),
  planetApiUrl: z.string(),
  sentinelApiUrl: z.string(),
  payoutReceiverAddress: z.string(),
  chainSelectorName: z.string(),
  gasLimit: z.string(),
  damageThreshold: z.number(),
  weatherWeight: z.number(),
  satelliteWeight: z.number(),
});

type Config = z.infer<typeof ConfigSchema>;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface ActivePolicy {
  policyId: string;
  plotLatitude: number;
  plotLongitude: number;
  cropType: string;
  onChainPolicyId: string;
  sumInsured: number;
  farmerWallet: string | null;
}

interface WeatherData {
  temperature: number;
  precipitation: number;
  humidity: number;
  windSpeed: number;
}

interface SatelliteData {
  ndviValue: number;
}

// ---------------------------------------------------------------------------
// Weather Damage Scoring
// ---------------------------------------------------------------------------
function calculateWeatherDamage(weather: WeatherData): number {
  let damage = 0;

  // Temperature stress: optimal range 15-35°C
  if (weather.temperature < 5 || weather.temperature > 45) {
    damage += 40;
  } else if (weather.temperature < 10 || weather.temperature > 40) {
    damage += 25;
  } else if (weather.temperature < 15 || weather.temperature > 35) {
    damage += 10;
  }

  // Excessive precipitation (flooding): >50mm/day is damaging
  if (weather.precipitation > 100) {
    damage += 30;
  } else if (weather.precipitation > 50) {
    damage += 15;
  }

  // Humidity stress: >90% encourages fungal disease
  if (weather.humidity > 95) {
    damage += 15;
  } else if (weather.humidity > 90) {
    damage += 8;
  }

  // Wind damage: >60 km/h is destructive
  if (weather.windSpeed > 80) {
    damage += 20;
  } else if (weather.windSpeed > 60) {
    damage += 10;
  }

  return Math.min(damage, 100);
}

// ---------------------------------------------------------------------------
// Satellite Damage Scoring (NDVI-based)
// ---------------------------------------------------------------------------
function calculateSatelliteDamage(satellite: SatelliteData): number {
  const ndvi = satellite.ndviValue;

  // Healthy vegetation: NDVI 0.6-0.8
  // Moderate stress: NDVI 0.3-0.6
  // Severe stress: NDVI < 0.3
  if (ndvi >= 0.7) return 0;
  if (ndvi >= 0.6) return 10;
  if (ndvi >= 0.5) return 25;
  if (ndvi >= 0.4) return 40;
  if (ndvi >= 0.3) return 60;
  if (ndvi >= 0.2) return 80;
  return 100;
}

// ---------------------------------------------------------------------------
// Fetch Active Policies
// ---------------------------------------------------------------------------
function fetchActivePolicies(
  sendRequester: HTTPSendRequester,
  config: Config,
  apiKey: string
): ActivePolicy[] {
  const response = sendRequester.sendRequest({
    url: `${config.backendApiUrl}/api/internal/active-policies`,
    method: "GET",
    headers: { "x-api-key": apiKey },
  }).result();

  if (!ok(response)) {
    throw new Error(`Failed to fetch active policies: status ${response.statusCode}`);
  }

  const data = json(response) as { policies: ActivePolicy[] };
  return data.policies;
}

// ---------------------------------------------------------------------------
// Fetch Weather Data (WeatherXM)
// ---------------------------------------------------------------------------
function fetchWeatherData(
  sendRequester: HTTPSendRequester,
  config: Config,
  apiKey: string,
  lat: number,
  lon: number
): WeatherData {
  const response = sendRequester.sendRequest({
    url: `${config.weatherXmApiUrl}/cells/search?lat=${lat}&lon=${lon}&exact=true`,
    method: "GET",
    headers: { Authorization: `Bearer ${apiKey}` },
  }).result();

  if (!ok(response)) {
    throw new Error(`WeatherXM API failed: status ${response.statusCode}`);
  }

  const data = json(response) as any;

  // Extract current weather from WeatherXM response
  const current = data?.devices?.[0]?.current_weather ?? data;
  return {
    temperature: current.temperature ?? 25,
    precipitation: current.precipitation ?? 0,
    humidity: current.humidity ?? 50,
    windSpeed: current.wind_speed ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Fetch Planet Labs Satellite Data
// ---------------------------------------------------------------------------
function fetchPlanetData(
  sendRequester: HTTPSendRequester,
  config: Config,
  apiKey: string,
  lat: number,
  lon: number
): SatelliteData {
  // Build a small bounding box (~500m) around the point
  const delta = 0.005;
  const bbox = [lon - delta, lat - delta, lon + delta, lat + delta];

  const response = sendRequester.sendRequest({
    url: `${config.planetApiUrl}/quick-search`,
    method: "POST",
    headers: {
      Authorization: `Basic ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      item_types: ["PSScene"],
      filter: {
        type: "AndFilter",
        config: [
          {
            type: "GeometryFilter",
            field_name: "geometry",
            config: {
              type: "Polygon",
              coordinates: [[
                [bbox[0], bbox[1]],
                [bbox[2], bbox[1]],
                [bbox[2], bbox[3]],
                [bbox[0], bbox[3]],
                [bbox[0], bbox[1]],
              ]],
            },
          },
          {
            type: "DateRangeFilter",
            field_name: "acquired",
            config: {
              gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
            },
          },
        ],
      },
    }),
  }).result();

  if (!ok(response)) {
    throw new Error(`Planet API failed: status ${response.statusCode}`);
  }

  const data = json(response) as any;
  // Extract NDVI from Planet analytics or default to moderate health
  const ndvi = data?.features?.[0]?.properties?.ndvi ?? 0.5;
  return { ndviValue: ndvi };
}

// ---------------------------------------------------------------------------
// Fetch Sentinel Hub Satellite Data (Copernicus)
// ---------------------------------------------------------------------------
function fetchSentinelToken(
  sendRequester: ConfidentialHTTPSendRequester,
  clientId: string,
  clientSecret: string
): string {
  const response = sendRequester.sendRequests({
    input: {
      requests: [
        {
          url: "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token",
          method: "POST",
          headers: ["Content-Type: application/x-www-form-urlencoded"],
          body: `grant_type=client_credentials&client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}`,
        },
      ],
    },
  }).result();

  const responseBody = response.responses[0]?.body;
  const data = JSON.parse(new TextDecoder().decode(responseBody)) as any;
  return data.access_token as string;
}

function fetchSentinelData(
  sendRequester: HTTPSendRequester,
  config: Config,
  token: string,
  lat: number,
  lon: number
): SatelliteData {
  // Build bounding box ~500m around point
  const delta = 0.005;
  const bbox = [lon - delta, lat - delta, lon + delta, lat + delta];

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const toDate = now.toISOString().split("T")[0];
  const fromDate = weekAgo.toISOString().split("T")[0];

  // Evalscript to calculate NDVI from Sentinel-2 B04 (red) and B08 (NIR)
  const evalscript = `
//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B04", "B08"], units: "DN" }],
    output: [{ id: "ndvi", bands: 1, sampleType: "FLOAT32" }],
  };
}
function evaluatePixel(sample) {
  const ndvi = (sample.B08 - sample.B04) / (sample.B08 + sample.B04);
  return { ndvi: [ndvi] };
}
`.trim();

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
            maxCloudCoverage: 30,
          },
        },
      ],
    },
    aggregation: {
      timeRange: { from: `${fromDate}T00:00:00Z`, to: `${toDate}T23:59:59Z` },
      aggregationInterval: { of: "P7D" },
      evalscript: evalscript,
    },
    output: {
      responses: [{ identifier: "ndvi" }],
    },
  };

  const response = sendRequester.sendRequest({
    url: `${config.sentinelApiUrl}/statistics`,
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  }).result();

  if (!ok(response)) {
    throw new Error(`Sentinel Hub API failed: status ${response.statusCode}`);
  }

  const data = json(response) as any;
  // Extract mean NDVI from Statistical API response
  const stats = data?.data?.[0]?.outputs?.ndvi?.bands?.B0?.stats;
  const meanNdvi = stats?.mean ?? 0.5;
  return { ndviValue: meanNdvi };
}

// ---------------------------------------------------------------------------
// Calculate Damage Index
// ---------------------------------------------------------------------------
function calculateDamageIndex(
  weatherDamage: number,
  satelliteDamage: number,
  config: Config
): number {
  const combined =
    config.weatherWeight * weatherDamage +
    config.satelliteWeight * satelliteDamage;
  return Math.round(Math.min(combined, 100));
}

// ---------------------------------------------------------------------------
// Submit Damage Report On-Chain
// ---------------------------------------------------------------------------
function submitDamageReport(
  runtime: Runtime<Config>,
  config: Config,
  onChainPolicyId: string,
  damagePercent: number
): void {
  const network = getNetwork({ chainSelectorName: config.chainSelectorName });
  if (!network) {
    throw new Error(`Unsupported chain: ${config.chainSelectorName}`);
  }

  const evmClient = new cre.capabilities.EVMClient(network.chainSelector.selector);

  // Encode the contract call
  const callData = encodeFunctionData({
    abi: PayoutReceiverABI,
    functionName: "submitDamageReport",
    args: [
      BigInt(onChainPolicyId),
      BigInt(damagePercent),
      "0x" as `0x${string}`, // proof bytes (DON signature serves as proof)
    ],
  });

  // Generate DON-signed report
  const report = runtime.report(
    prepareReportRequest(callData)
  ).result();

  // Write report to chain
  const writeResult = evmClient.writeReport(runtime, {
    receiver: config.payoutReceiverAddress,
    report: report,
    gasConfig: { gasLimit: config.gasLimit },
  }).result();

  if (writeResult.txStatus !== TxStatus.SUCCESS) {
    throw new Error(
      `Transaction failed for policy ${onChainPolicyId}: ${writeResult.errorMessage ?? "unknown"}`
    );
  }

  const txHashHex = writeResult.txHash
    ? Array.from(writeResult.txHash).map(b => b.toString(16).padStart(2, '0')).join('')
    : "unknown";
  runtime.log(
    `Damage report submitted for policy ${onChainPolicyId}: ${damagePercent}% damage, tx: 0x${txHashHex}`
  );
}

// ---------------------------------------------------------------------------
// Main Cron Handler
// ---------------------------------------------------------------------------
const onCronTrigger = (
  runtime: Runtime<Config>,
  _payload: CronPayload
): string => {
  const config = runtime.config;
  runtime.log("MicroCrop damage assessment workflow triggered.");

  // Get API keys from secrets
  const backendApiKey = runtime.getSecret({ id: "BACKEND_API_KEY" }).result().value;
  const weatherApiKey = runtime.getSecret({ id: "WEATHERXM_API_KEY" }).result().value;

  // Set up HTTP client for public requests
  const httpClient = new cre.capabilities.HTTPClient();

  // Fetch active policies via consensus (all nodes must agree on the list)
  // Type assertion needed because ActivePolicy[] is a complex object array
  const policiesFetcher = httpClient.sendRequest(
    runtime,
    (sendRequester: HTTPSendRequester) =>
      fetchActivePolicies(sendRequester, config, backendApiKey),
    consensusIdenticalAggregation<ActivePolicy[]>() as unknown as ConsensusAggregation<ActivePolicy[], true>
  );
  const policies = policiesFetcher().result();

  if (policies.length === 0) {
    runtime.log("No active policies found.");
    return "No active policies to assess.";
  }

  runtime.log(`Found ${policies.length} active policies to assess.`);

  // Get satellite credentials if using Sentinel
  let sentinelToken: string | undefined;
  if (config.satelliteProvider === "sentinel") {
    const confidentialClient = new cre.capabilities.ConfidentialHTTPClient();
    const clientId = runtime.getSecret({ id: "SENTINEL_CLIENT_ID" }).result().value;
    const clientSecret = runtime.getSecret({ id: "SENTINEL_CLIENT_SECRET" }).result().value;

    // Fetch Sentinel token via confidential HTTP (each node independently)
    const tokenFetcher = confidentialClient.sendRequests(
      runtime,
      (sendRequester: ConfidentialHTTPSendRequester) =>
        fetchSentinelToken(sendRequester, clientId, clientSecret),
      consensusIdenticalAggregation<string>()
    );
    sentinelToken = tokenFetcher().result();
  }

  let planetApiKey: string | undefined;
  if (config.satelliteProvider === "planet") {
    planetApiKey = runtime.getSecret({ id: "PLANET_API_KEY" }).result().value;
  }

  let reportsSubmitted = 0;

  for (const policy of policies) {
    const lat = policy.plotLatitude;
    const lon = policy.plotLongitude;

    // Fetch weather data with median consensus across nodes
    const weatherFetcher = httpClient.sendRequest(
      runtime,
      (sendRequester: HTTPSendRequester) =>
        fetchWeatherData(sendRequester, config, weatherApiKey, lat, lon),
      ConsensusAggregationByFields<WeatherData>({
        temperature: () => median(),
        precipitation: () => median(),
        humidity: () => median(),
        windSpeed: () => median(),
      })
    );
    const weatherData = weatherFetcher().result();

    // Fetch satellite data with median consensus
    let satelliteData: SatelliteData;
    if (config.satelliteProvider === "sentinel" && sentinelToken) {
      const satFetcher = httpClient.sendRequest(
        runtime,
        (sendRequester: HTTPSendRequester) =>
          fetchSentinelData(sendRequester, config, sentinelToken!, lat, lon),
        ConsensusAggregationByFields<SatelliteData>({
          ndviValue: () => median(),
        })
      );
      satelliteData = satFetcher().result();
    } else {
      const satFetcher = httpClient.sendRequest(
        runtime,
        (sendRequester: HTTPSendRequester) =>
          fetchPlanetData(sendRequester, config, planetApiKey!, lat, lon),
        ConsensusAggregationByFields<SatelliteData>({
          ndviValue: () => median(),
        })
      );
      satelliteData = satFetcher().result();
    }

    // Calculate damage
    const weatherDamage = calculateWeatherDamage(weatherData);
    const satelliteDamage = calculateSatelliteDamage(satelliteData);
    const combinedDamage = calculateDamageIndex(weatherDamage, satelliteDamage, config);

    runtime.log(
      `Policy ${policy.policyId}: weather=${weatherDamage}%, satellite=${satelliteDamage}%, combined=${combinedDamage}%`
    );

    // Submit on-chain report if damage exceeds threshold
    if (combinedDamage >= config.damageThreshold) {
      runtime.log(
        `Policy ${policy.policyId}: damage ${combinedDamage}% >= threshold ${config.damageThreshold}%, submitting report.`
      );
      submitDamageReport(runtime, config, policy.onChainPolicyId, combinedDamage);
      reportsSubmitted++;
    }
  }

  const summary = `Assessed ${policies.length} policies. Submitted ${reportsSubmitted} damage reports.`;
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
