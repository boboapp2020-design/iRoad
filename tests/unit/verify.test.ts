import { describe, expect, it } from 'vitest';
import { CURRENT_RULES, deriveStatus, EARTH_RADIUS_M, evaluateCapture, isCaptureAcceptable, RULES_V1, RULES_V2, RULES_V3, verifyCapturePair } from '@verification';
import { baseAfter, baseBefore } from './fixtures';

describe('verifyCapturePair status rules', () => {
  it('PASS requires every mandatory check to pass', () => {
    const r = verifyCapturePair(baseBefore(), baseAfter(), RULES_V1);
    expect(r).toMatchObject({ overallStatus: 'PASS', gpsAccuracyPass: true, distancePass: true, headingPass: true });
    expect(r.reasons.filter((x) => x.severity !== 'WARNING')).toEqual([]);
    expect(r.rulesVersion).toBe('rr-verify-v1');
    expect(r.thresholds).toMatchObject({ max_gps_accuracy_m: 3, max_distance_m: 3, max_heading_difference_deg: 10 });
  });

  it('missing evidence record -> INSUFFICIENT_DATA', () => {
    expect(verifyCapturePair(null, baseAfter(), RULES_V1).overallStatus).toBe('INSUFFICIENT_DATA');
    expect(verifyCapturePair(baseBefore(), undefined, RULES_V1).overallStatus).toBe('INSUFFICIENT_DATA');
  });

  it('missing AND out-of-tolerance data keeps every reason and never PASSes', () => {
    const r = verifyCapturePair(baseBefore(), { ...baseAfter(), headingDeg: null, accuracyM: 7.5 }, RULES_V1);
    const codes = r.reasons.map((x) => x.code);
    expect(codes).toEqual(expect.arrayContaining(['HEADING_MISSING', 'ACCURACY_EXCEEDED', 'HEADING_NOT_COMPUTABLE']));
    expect(r.overallStatus).not.toBe('PASS');
    expect(r.overallStatus).toBe('FAIL'); // documented precedence: definitive violation dominates
  });

  it('missing data never becomes zero distance or zero heading difference', () => {
    const r = verifyCapturePair({ ...baseBefore(), latitude: undefined, headingDeg: undefined }, baseAfter(), RULES_V1);
    expect(r.measuredDistanceM).toBeNull();
    expect(r.headingDifferenceDeg).toBeNull();
  });

  it('After timestamped before Before is not accepted', () => {
    const b = baseBefore();
    const a = { ...baseAfter(), capturedAt: '2026-03-01T00:00:00Z', locationFixAt: '2026-03-01T00:00:00Z', headingMeasuredAt: '2026-03-01T00:00:00Z' };
    const r = verifyCapturePair(b, a, RULES_V1);
    expect(r.reasons.map((x) => x.code)).toContain('CAPTURE_ORDER_INVALID');
    expect(r.overallStatus).toBe('INSUFFICIENT_DATA');
  });

  it('missing capture time -> INSUFFICIENT_DATA', () => {
    const r = verifyCapturePair(baseBefore(), { ...baseAfter(), capturedAt: 'not-a-date' }, RULES_V1);
    expect(r.reasons.map((x) => x.code)).toContain('CAPTURE_TIME_MISSING');
    expect(r.overallStatus).toBe('INSUFFICIENT_DATA');
  });

  it('deriveStatus refuses PASS when any reason is non-warning even if flags are true', () => {
    const flags = { gpsAccuracyPass: true, distancePass: true, headingPass: true };
    expect(deriveStatus(flags, [{ code: 'HEADING_STALE', severity: 'INSUFFICIENT_DATA', message: '' }])).toBe('INSUFFICIENT_DATA');
    expect(deriveStatus(flags, [{ code: 'DISTANCE_EXCEEDED', severity: 'FAIL', message: '' }])).toBe('FAIL');
    expect(deriveStatus(flags, [])).toBe('PASS');
  });
});

describe('evaluateCapture (Before acceptance / live gate)', () => {
  it('accepts a complete, fresh, accurate capture', () => {
    expect(isCaptureAcceptable(evaluateCapture(baseBefore(), 'BEFORE', RULES_V1))).toBe(true);
  });
  it('rejects accuracy > 3 m', () => {
    expect(isCaptureAcceptable(evaluateCapture({ ...baseBefore(), accuracyM: 3.2 }, 'BEFORE', RULES_V1))).toBe(false);
  });
  it('rejects a missing heading', () => {
    expect(isCaptureAcceptable(evaluateCapture({ ...baseBefore(), headingDeg: null }, 'BEFORE', RULES_V1))).toBe(false);
  });
  it('rejects a stale fix', () => {
    const b = baseBefore();
    expect(isCaptureAcceptable(evaluateCapture({ ...b, locationFixAt: Date.parse(b.capturedAt as string) - 60_000 }, 'BEFORE', RULES_V1))).toBe(false);
  });
});

describe('rules v2: Before can be taken anywhere', () => {
  it('only relaxes the Before accuracy compared with v1', () => {
    expect(RULES_V2).toMatchObject({ maxBeforeGpsAccuracyM: null, maxGpsAccuracyM: 3, maxDistanceM: 3, maxHeadingDifferenceDeg: 10 });
    expect(RULES_V1.maxBeforeGpsAccuracyM).toBe(3);
  });
  it('accepts a Before capture with poor accuracy and records a warning', () => {
    const e = evaluateCapture({ ...baseBefore(), accuracyM: 12 }, 'BEFORE', RULES_V2);
    expect(isCaptureAcceptable(e)).toBe(true);
    expect(e.reasons).toEqual([expect.objectContaining({ code: 'REFERENCE_ACCURACY_LOW', severity: 'WARNING' })]);
  });
  it('still needs Before coordinates, accuracy value and heading', () => {
    expect(isCaptureAcceptable(evaluateCapture({ ...baseBefore(), latitude: null }, 'BEFORE', RULES_V2))).toBe(false);
    expect(isCaptureAcceptable(evaluateCapture({ ...baseBefore(), accuracyM: null }, 'BEFORE', RULES_V2))).toBe(false);
    expect(isCaptureAcceptable(evaluateCapture({ ...baseBefore(), headingDeg: null }, 'BEFORE', RULES_V2))).toBe(false);
  });
  it('After accuracy, distance and heading limits are unchanged', () => {
    expect(verifyCapturePair({ ...baseBefore(), accuracyM: 9 }, baseAfter(), RULES_V2).overallStatus).toBe('PASS');
    expect(verifyCapturePair({ ...baseBefore(), accuracyM: 9 }, { ...baseAfter(), accuracyM: 3.5 }, RULES_V2).overallStatus).toBe('FAIL');
    expect(verifyCapturePair(baseBefore(), { ...baseAfter(), headingDeg: 140 }, RULES_V2).overallStatus).toBe('FAIL');
  });
  it('v1 records keep their stricter Before rule', () => {
    expect(verifyCapturePair({ ...baseBefore(), accuracyM: 9 }, baseAfter(), RULES_V1).overallStatus).toBe('FAIL');
  });
});

describe('rules v3 (current): no accuracy criterion, 1 m and ±10°', () => {
  const north = (m: number) => ({ latitude: baseBefore().latitude + (m / EARTH_RADIUS_M) * (180 / Math.PI), longitude: baseBefore().longitude });
  it('is the current rules version', () => {
    expect(CURRENT_RULES).toBe(RULES_V3);
    expect(RULES_V3).toMatchObject({ version: 'rr-verify-v3', maxGpsAccuracyM: null, maxBeforeGpsAccuracyM: null, maxDistanceM: 1, maxHeadingDifferenceDeg: 10 });
  });
  it('ignores GPS accuracy (even missing) for both photos', () => {
    const r = verifyCapturePair({ ...baseBefore(), accuracyM: 15 }, { ...baseAfter(), ...north(0.5), accuracyM: null }, RULES_V3);
    expect(r.overallStatus).toBe('PASS');
    expect(r.reasons.filter((x) => x.severity !== 'WARNING')).toEqual([]);
  });
  it('passes within 1 m and fails beyond 1 m', () => {
    expect(verifyCapturePair(baseBefore(), { ...baseAfter(), ...north(0.99) }, RULES_V3).overallStatus).toBe('PASS');
    const r = verifyCapturePair(baseBefore(), { ...baseAfter(), ...north(1.01) }, RULES_V3);
    expect(r.overallStatus).toBe('FAIL');
    expect(r.reasons.map((x) => x.code)).toContain('DISTANCE_EXCEEDED');
  });
  it('heading ±10° either side', () => {
    expect(verifyCapturePair({ ...baseBefore(), headingDeg: 125 }, { ...baseAfter(), ...north(0.3), headingDeg: 115 }, RULES_V3).overallStatus).toBe('PASS');
    expect(verifyCapturePair({ ...baseBefore(), headingDeg: 125 }, { ...baseAfter(), ...north(0.3), headingDeg: 136 }, RULES_V3).overallStatus).toBe('FAIL');
    expect(verifyCapturePair({ ...baseBefore(), headingDeg: 355 }, { ...baseAfter(), ...north(0.3), headingDeg: 5 }, RULES_V3).overallStatus).toBe('PASS');
  });
  it('still requires coordinates, fresh readings and heading', () => {
    expect(verifyCapturePair(baseBefore(), { ...baseAfter(), latitude: null }, RULES_V3).overallStatus).toBe('INSUFFICIENT_DATA');
    expect(verifyCapturePair(baseBefore(), { ...baseAfter(), ...north(0.3), headingDeg: null }, RULES_V3).overallStatus).toBe('INSUFFICIENT_DATA');
    const a = baseAfter();
    expect(verifyCapturePair(baseBefore(), { ...a, ...north(0.3), locationFixAt: Date.parse(a.capturedAt as string) - 20_000 }, RULES_V3).overallStatus).toBe('INSUFFICIENT_DATA');
  });
});
