import * as turf from '@turf/turf';
import logger from '../utils/logger.js';

// ---------------------------------------------------------------------------
// validateGeoJSON — Validate a GeoJSON Polygon
// ---------------------------------------------------------------------------
function validateGeoJSON(geojson) {
  if (!geojson || typeof geojson !== 'object') {
    return { valid: false, error: 'GeoJSON must be a non-null object' };
  }

  if (geojson.type !== 'Polygon') {
    return { valid: false, error: `Expected type "Polygon", got "${geojson.type}"` };
  }

  if (!Array.isArray(geojson.coordinates) || geojson.coordinates.length < 1) {
    return { valid: false, error: 'Coordinates must be an array with at least 1 ring' };
  }

  const ring = geojson.coordinates[0];

  if (!Array.isArray(ring) || ring.length < 4) {
    return {
      valid: false,
      error: `Outer ring must have at least 4 points (closed polygon), got ${ring?.length || 0}`,
    };
  }

  // Check ring closure (first point === last point)
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    return { valid: false, error: 'Outer ring is not closed (first point must equal last point)' };
  }

  // Validate all coordinate values
  for (let i = 0; i < ring.length; i++) {
    const coord = ring[i];
    if (!Array.isArray(coord) || coord.length < 2) {
      return { valid: false, error: `Invalid coordinate at index ${i}` };
    }

    const [lng, lat] = coord;

    if (typeof lng !== 'number' || typeof lat !== 'number' || isNaN(lng) || isNaN(lat)) {
      return { valid: false, error: `Non-numeric coordinate at index ${i}` };
    }

    if (lng < -180 || lng > 180) {
      return { valid: false, error: `Longitude ${lng} out of range [-180, 180] at index ${i}` };
    }

    if (lat < -90 || lat > 90) {
      return { valid: false, error: `Latitude ${lat} out of range [-90, 90] at index ${i}` };
    }
  }

  // Check for self-intersecting polygon using turf's kinks()
  try {
    const poly = turf.polygon(geojson.coordinates);
    const selfIntersections = turf.kinks(poly);
    if (selfIntersections.features.length > 0) {
      return {
        valid: false,
        error: `Polygon is self-intersecting (${selfIntersections.features.length} intersection(s) found)`,
      };
    }
  } catch (err) {
    return { valid: false, error: `Failed to validate polygon topology: ${err.message}` };
  }

  return { valid: true };
}

// ---------------------------------------------------------------------------
// computePlotMetrics — Centroid and area from a GeoJSON Polygon boundary
// ---------------------------------------------------------------------------
function computePlotMetrics(boundary) {
  try {
    const polygon = turf.polygon(boundary.coordinates);
    const centroidFeature = turf.centroid(polygon);
    const areaM2 = turf.area(polygon);

    const [centroidLon, centroidLat] = centroidFeature.geometry.coordinates;
    const areaHectares = parseFloat((areaM2 / 10000).toFixed(4));

    return { centroidLat, centroidLon, areaHectares };
  } catch (error) {
    logger.error('Failed to compute plot metrics', { error: error.message });
    throw error;
  }
}

// ---------------------------------------------------------------------------
// pointToPolygon — Create a circular polygon from a point + radius
// ---------------------------------------------------------------------------
function pointToPolygon(lat, lon, radiusMeters = 500) {
  try {
    const point = turf.point([lon, lat]);
    const buffered = turf.buffer(point, radiusMeters, { units: 'meters' });
    return buffered.geometry;
  } catch (error) {
    logger.error('Failed to convert point to polygon', {
      lat,
      lon,
      radiusMeters,
      error: error.message,
    });
    throw error;
  }
}

// ---------------------------------------------------------------------------
// bboxOverlaps — Cheap check: do two [minLon, minLat, maxLon, maxLat] overlap?
// ---------------------------------------------------------------------------
function bboxOverlaps(a, b) {
  // a and b are [minLon, minLat, maxLon, maxLat]
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}

// ---------------------------------------------------------------------------
// checkOverlaps — Find overlapping plots within an organization
// Optimized: bbox pre-filter before full polygon intersection, with limit.
// ---------------------------------------------------------------------------
async function checkOverlaps(organizationId, boundary, excludePlotId = null, { limit = 10 } = {}) {
  try {
    // Import prisma lazily to avoid circular dependency
    const { default: prisma } = await import('../config/database.js');

    const whereClause = {
      organizationId,
      boundary: { not: null },
    };

    if (excludePlotId) {
      whereClause.id = { not: excludePlotId };
    }

    const plots = await prisma.plot.findMany({
      where: whereClause,
      select: {
        id: true,
        name: true,
        boundary: true,
      },
    });

    const inputPolygon = turf.polygon(boundary.coordinates);
    const inputBbox = turf.bbox(inputPolygon);
    const overlapping = [];

    for (const plot of plots) {
      // Stop early once we hit the overlap limit
      if (overlapping.length >= limit) break;

      try {
        const plotPolygon = turf.polygon(plot.boundary.coordinates);

        // Cheap bbox pre-filter: skip if bounding boxes don't overlap
        const plotBbox = turf.bbox(plotPolygon);
        if (!bboxOverlaps(inputBbox, plotBbox)) {
          continue;
        }

        // Full polygon intersection check (only on bbox-filtered candidates)
        if (turf.booleanIntersects(inputPolygon, plotPolygon)) {
          let overlapArea = 0;
          try {
            const intersection = turf.intersect(
              turf.featureCollection([inputPolygon, plotPolygon])
            );
            if (intersection) {
              overlapArea = parseFloat((turf.area(intersection) / 10000).toFixed(4));
            }
          } catch {
            // Intersection computation can fail on edge cases; just flag the overlap
            overlapArea = -1;
          }

          overlapping.push({
            plotId: plot.id,
            plotName: plot.name,
            overlapArea,
          });
        }
      } catch {
        // Skip plots with invalid boundary data
        logger.debug('Skipping plot with invalid boundary in overlap check', { plotId: plot.id });
      }
    }

    return overlapping;
  } catch (error) {
    logger.error('Failed to check plot overlaps', {
      organizationId,
      error: error.message,
    });
    throw error;
  }
}

// ---------------------------------------------------------------------------
// polygonToBbox — Extract bounding box from a polygon
// ---------------------------------------------------------------------------
function polygonToBbox(polygon) {
  try {
    const bbox = turf.bbox(polygon);
    // turf.bbox returns [minLon, minLat, maxLon, maxLat]
    return bbox;
  } catch (error) {
    logger.error('Failed to compute bounding box', { error: error.message });
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------
const geometryService = {
  validateGeoJSON,
  computePlotMetrics,
  pointToPolygon,
  checkOverlaps,
  polygonToBbox,
};

export default geometryService;
