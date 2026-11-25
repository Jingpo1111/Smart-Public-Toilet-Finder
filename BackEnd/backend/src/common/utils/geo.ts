const EARTH_RADIUS_METERS = 6_371_008.8;

/** Approximate bounding box of Cambodia (with a small margin). Coordinates outside are rejected. */
export const CAMBODIA_BOUNDS = { minLat: 9.5, maxLat: 14.8, minLng: 102.2, maxLng: 107.8 } as const;

export const DISTANCE_TYPE = 'STRAIGHT_LINE_APPROXIMATE' as const;
export const DISTANCE_NOTE =
  'Approximate straight-line (great-circle) distance calculated with the Haversine formula. It is not walking or driving distance.';

const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in metres (Haversine formula). */
export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Bounding box that fully contains the circle (lat, lng, radius) — used as an index-friendly pre-filter. */
export function boundingBox(lat: number, lng: number, radiusMeters: number) {
  const latDelta = (radiusMeters / EARTH_RADIUS_METERS) * (180 / Math.PI);
  const cosLat = Math.max(Math.cos(toRad(lat)), 1e-6);
  const lngDelta = latDelta / cosLat;
  return {
    minLat: lat - latDelta,
    maxLat: lat + latDelta,
    minLng: lng - lngDelta,
    maxLng: lng + lngDelta,
  };
}

export function isWithinCambodia(lat: number, lng: number): boolean {
  return (
    lat >= CAMBODIA_BOUNDS.minLat &&
    lat <= CAMBODIA_BOUNDS.maxLat &&
    lng >= CAMBODIA_BOUNDS.minLng &&
    lng <= CAMBODIA_BOUNDS.maxLng
  );
}

export function distanceInfo(meters: number) {
  return { meters: Math.round(meters), type: DISTANCE_TYPE, note: DISTANCE_NOTE };
}
