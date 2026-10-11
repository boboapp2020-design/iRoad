import { describe, expect, it } from 'vitest';
import { EARTH_RADIUS_M, haversineDistanceM, isValidAccuracy, RULES_V1, verifyCapturePair } from '@verification';
import { baseAfter, baseBefore } from './fixtures';

/** Point `meters` north of p along the meridian (exact for the haversine sphere). */
function north(p: { latitude: number; longitude: number }, meters: number) {
  return { latitude: p.latitude + (meters / EARTH_RADIUS_M) * (180 / Math.PI), longitude: p.longitude };
}

const origin = { latitude: 13.764321, longitude: 100.538721 };

describe('haversineDistanceM', () => {
  it('returns 0 for identical coordinates', () => {
    expect(haversineDistanceM(origin, origin)).toBe(0);
  });
  it('measures points less than 3 m apart', () => {
    const d = haversineDistanceM(origin, north(origin, 1.8))!;
    expect(d).toBeCloseTo(1.8, 6);
    expect(d).toBeLessThan(3);
  });
  it('measures points exactly at the 3 m threshold', () => {
    expect(haversineDistanceM(origin, north(origin, 3))!).toBeCloseTo(3, 6);
  });
  it('measures points greater than 3 m apart', () => {
    expect(haversineDistanceM(origin, north(origin, 4.2))!).toBeCloseTo(4.2, 6);
  });
  it('handles east-west distance at the equator', () => {
    const d = haversineDistanceM({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 0.00001 })!;
    expect(d).toBeCloseTo((0.00001 * Math.PI * EARTH_RADIUS_M) / 180, 6);
  });
  it('returns null (never 0) for missing or invalid coordinates', () => {
    expect(haversineDistanceM(null, origin)).toBeNull();
    expect(haversineDistanceM(origin, undefined)).toBeNull();
    expect(haversineDistanceM({ latitude: 91, longitude: 0 }, origin)).toBeNull();
    expect(haversineDistanceM({ latitude: 0, longitude: -181 }, origin)).toBeNull();
    expect(haversineDistanceM({ latitude: NaN, longitude: 0 }, origin)).toBeNull();
    expect(haversineDistanceM({ latitude: 13 } as never, origin)).toBeNull();
  });
});

describe('distance check inside verification', () => {
  const at = (meters: number) => ({ ...baseAfter(), ...north(baseBefore(), meters) });
  it('passes below the threshold', () => {
    const r = verifyCapturePair(baseBefore(), at(2.5), RULES_V1);
    expect(r.distancePass).toBe(true);
    expect(r.overallStatus).toBe('PASS');
  });
  it('passes at exactly the threshold (inclusive comparison)', () => {
    // Construct a point whose computed distance is <= 3 (floating point safe).
    let m = 3;
    while (haversineDistanceM(baseBefore(), at(m))! > 3) m -= 1e-9;
    const r = verifyCapturePair(baseBefore(), at(m), RULES_V1);
    expect(r.measuredDistanceM!).toBeCloseTo(3, 6);
    expect(r.distancePass).toBe(true);
  });
  it('fails above the threshold and compares unrounded values', () => {
    let m = 3;
    while (haversineDistanceM(baseBefore(), at(m))! <= 3) m += 1e-9; // e.g. 3.000000001 displays as "3.0"
    const r = verifyCapturePair(baseBefore(), at(m), RULES_V1);
    expect(r.distancePass).toBe(false);
    expect(r.overallStatus).toBe('FAIL');
    expect(r.reasons.map((x) => x.code)).toContain('DISTANCE_EXCEEDED');
  });
  it('is INSUFFICIENT_DATA when coordinates are missing', () => {
    const r = verifyCapturePair(baseBefore(), { ...baseAfter(), latitude: null }, RULES_V1);
    expect(r.measuredDistanceM).toBeNull();
    expect(r.distancePass).toBeNull();
    expect(r.overallStatus).toBe('INSUFFICIENT_DATA');
  });
  it('is INSUFFICIENT_DATA when coordinates are invalid', () => {
    const r = verifyCapturePair({ ...baseBefore(), longitude: 200 }, baseAfter(), RULES_V1);
    expect(r.reasons.map((x) => x.code)).toContain('COORDINATES_INVALID');
    expect(r.overallStatus).toBe('INSUFFICIENT_DATA');
  });
});

describe('GPS accuracy', () => {
  it('passes when both readings are at or below 3 m', () => {
    const r = verifyCapturePair({ ...baseBefore(), accuracyM: 3 }, { ...baseAfter(), accuracyM: 2.4 }, RULES_V1);
    expect(r.gpsAccuracyPass).toBe(true);
    expect(r.overallStatus).toBe('PASS');
  });
  it('fails when a reading is greater than 3 m', () => {
    const r = verifyCapturePair(baseBefore(), { ...baseAfter(), accuracyM: 3.01 }, RULES_V1);
    expect(r.gpsAccuracyPass).toBe(false);
    expect(r.overallStatus).toBe('FAIL');
    expect(r.reasons.find((x) => x.code === 'ACCURACY_EXCEEDED')?.capture).toBe('AFTER');
  });
  it('is INSUFFICIENT_DATA when accuracy is missing', () => {
    const r = verifyCapturePair({ ...baseBefore(), accuracyM: undefined }, baseAfter(), RULES_V1);
    expect(r.gpsAccuracyPass).toBeNull();
    expect(r.beforeAccuracyM).toBeNull();
    expect(r.overallStatus).toBe('INSUFFICIENT_DATA');
  });
  it.each([0, -1, NaN, Infinity])('treats accuracy %s as invalid', (acc) => {
    expect(isValidAccuracy(acc)).toBe(false);
    const r = verifyCapturePair(baseBefore(), { ...baseAfter(), accuracyM: acc }, RULES_V1);
    expect(r.reasons.map((x) => x.code)).toContain('ACCURACY_INVALID');
    expect(r.overallStatus).toBe('INSUFFICIENT_DATA');
  });
  it('treats a stale GPS fix (older than 10 s) as unreliable', () => {
    const after = baseAfter();
    const r = verifyCapturePair(baseBefore(), { ...after, locationFixAt: Date.parse(after.capturedAt as string) - 10_001 }, RULES_V1);
    expect(r.reasons.map((x) => x.code)).toContain('LOCATION_STALE');
    expect(r.distancePass).toBeNull();
    expect(r.overallStatus).toBe('INSUFFICIENT_DATA');
  });
  it('accepts a fix exactly 10 s old', () => {
    const after = baseAfter();
    const r = verifyCapturePair(baseBefore(), { ...after, locationFixAt: Date.parse(after.capturedAt as string) - 10_000 }, RULES_V1);
    expect(r.overallStatus).toBe('PASS');
  });
  it('rejects a fix timestamped well after the capture', () => {
    const after = baseAfter();
    const r = verifyCapturePair(baseBefore(), { ...after, locationFixAt: Date.parse(after.capturedAt as string) + 5_000 }, RULES_V1);
    expect(r.reasons.map((x) => x.code)).toContain('LOCATION_STALE');
  });
  it('is INSUFFICIENT_DATA when the fix time is missing', () => {
    const r = verifyCapturePair(baseBefore(), { ...baseAfter(), locationFixAt: null }, RULES_V1);
    expect(r.reasons.map((x) => x.code)).toContain('LOCATION_TIMESTAMP_MISSING');
    expect(r.overallStatus).toBe('INSUFFICIENT_DATA');
  });
});
