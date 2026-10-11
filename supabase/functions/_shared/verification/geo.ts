/** Mean Earth radius (IUGG), meters. Haversine error at a few meters is ~0.5% (mm-level). */
export const EARTH_RADIUS_M = 6_371_008.8;

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function isValidLatitude(lat: unknown): lat is number {
  return isFiniteNumber(lat) && lat >= -90 && lat <= 90;
}

export function isValidLongitude(lng: unknown): lng is number {
  return isFiniteNumber(lng) && lng >= -180 && lng <= 180;
}

export interface LatLng {
  latitude: number;
  longitude: number;
}

export function isValidCoordinate(p: Partial<LatLng> | null | undefined): p is LatLng {
  return !!p && isValidLatitude(p.latitude) && isValidLongitude(p.longitude);
}

/** Reported horizontal accuracy must be a finite, strictly positive number. */
export function isValidAccuracy(accuracy: unknown): accuracy is number {
  return isFiniteNumber(accuracy) && accuracy > 0;
}

const toRad = (deg: number) => (deg * Math.PI) / 180;

/**
 * Great-circle distance in meters (Haversine). Returns null — never 0 — when
 * either coordinate is missing or invalid.
 */
export function haversineDistanceM(
  a: Partial<LatLng> | null | undefined,
  b: Partial<LatLng> | null | undefined,
): number | null {
  if (!isValidCoordinate(a) || !isValidCoordinate(b)) return null;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial bearing from a to b in degrees [0, 360), or null if invalid / identical. */
export function bearingDeg(a: Partial<LatLng>, b: Partial<LatLng>): number | null {
  if (!isValidCoordinate(a) || !isValidCoordinate(b)) return null;
  if (a.latitude === b.latitude && a.longitude === b.longitude) return null;
  const φ1 = toRad(a.latitude);
  const φ2 = toRad(b.latitude);
  const Δλ = toRad(b.longitude - a.longitude);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  const θ = (Math.atan2(y, x) * 180) / Math.PI;
  return ((θ % 360) + 360) % 360;
}
