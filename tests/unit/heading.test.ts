import { describe, expect, it } from 'vitest';
import {
  cameraHeadingFromOrientation,
  circularHeadingDifference,
  circularStats,
  isValidHeading,
  normalizeHeading,
  RULES_V1,
  verifyCapturePair,
} from '@verification';
import { baseAfter, baseBefore } from './fixtures';

describe('circularHeadingDifference', () => {
  it('359° vs 1° = 2°', () => expect(circularHeadingDifference(359, 1)).toBe(2));
  it('1° vs 359° = 2° (symmetric)', () => expect(circularHeadingDifference(1, 359)).toBe(2));
  it('90° vs 100° = 10°', () => expect(circularHeadingDifference(90, 100)).toBe(10));
  it('90° vs 101° = 11°', () => expect(circularHeadingDifference(90, 101)).toBe(11));
  it('0° vs 180° = 180°', () => expect(circularHeadingDifference(0, 180)).toBe(180));
  it('0° vs 360° = 0° (range boundaries)', () => expect(circularHeadingDifference(0, 360)).toBe(0));
  it('360° vs 0° = 0°', () => expect(circularHeadingDifference(360, 0)).toBe(0));
  it('0° vs 359.9° ≈ 0.1°', () => expect(circularHeadingDifference(0, 359.9)).toBeCloseTo(0.1, 9));
  it('returns null (never 0) for missing headings', () => {
    expect(circularHeadingDifference(null, 10)).toBeNull();
    expect(circularHeadingDifference(10, undefined)).toBeNull();
  });
  it('returns null for invalid headings', () => {
    expect(circularHeadingDifference(-1, 10)).toBeNull();
    expect(circularHeadingDifference(10, 360.5)).toBeNull();
    expect(circularHeadingDifference(NaN, 10)).toBeNull();
    expect(circularHeadingDifference('90' as unknown as number, 10)).toBeNull();
  });
});

describe('heading validation helpers', () => {
  it('accepts [0, 360] and rejects outside', () => {
    expect(isValidHeading(0)).toBe(true);
    expect(isValidHeading(360)).toBe(true);
    expect(isValidHeading(359.999)).toBe(true);
    expect(isValidHeading(-0.001)).toBe(false);
    expect(isValidHeading(360.001)).toBe(false);
    expect(isValidHeading(null)).toBe(false);
  });
  it('normalizes to [0, 360)', () => {
    expect(normalizeHeading(360)).toBe(0);
    expect(normalizeHeading(-10)).toBe(350);
    expect(normalizeHeading(725)).toBe(5);
    expect(normalizeHeading(-0)).toBe(0);
    expect(normalizeHeading(undefined)).toBeNull();
  });
  it('computes circular mean across north', () => {
    const s = circularStats([358, 0, 2])!;
    expect(Math.min(s.meanDeg, 360 - s.meanDeg)).toBeLessThan(1e-9);
    expect(s.spreadDeg).toBeLessThan(2);
    expect(circularStats([])).toBeNull();
  });
});

describe('heading inside verification', () => {
  it('passes at exactly 10°', () => {
    const r = verifyCapturePair({ ...baseBefore(), headingDeg: 90 }, { ...baseAfter(), headingDeg: 100 }, RULES_V1);
    expect(r.headingDifferenceDeg).toBe(10);
    expect(r.headingPass).toBe(true);
    expect(r.overallStatus).toBe('PASS');
  });
  it('fails at 11°', () => {
    const r = verifyCapturePair({ ...baseBefore(), headingDeg: 90 }, { ...baseAfter(), headingDeg: 101 }, RULES_V1);
    expect(r.headingPass).toBe(false);
    expect(r.overallStatus).toBe('FAIL');
  });
  it('passes across north (359° vs 1°)', () => {
    const r = verifyCapturePair({ ...baseBefore(), headingDeg: 359 }, { ...baseAfter(), headingDeg: 1 }, RULES_V1);
    expect(r.headingDifferenceDeg).toBe(2);
    expect(r.overallStatus).toBe('PASS');
  });
  it('missing heading -> INSUFFICIENT_DATA, not 0', () => {
    const r = verifyCapturePair(baseBefore(), { ...baseAfter(), headingDeg: null }, RULES_V1);
    expect(r.headingDifferenceDeg).toBeNull();
    expect(r.headingPass).toBeNull();
    expect(r.overallStatus).toBe('INSUFFICIENT_DATA');
    expect(r.reasons.map((x) => x.code)).toEqual(expect.arrayContaining(['HEADING_MISSING', 'HEADING_NOT_COMPUTABLE']));
  });
  it('invalid heading -> INSUFFICIENT_DATA', () => {
    const r = verifyCapturePair({ ...baseBefore(), headingDeg: 400 }, baseAfter(), RULES_V1);
    expect(r.reasons.map((x) => x.code)).toContain('HEADING_INVALID');
    expect(r.overallStatus).toBe('INSUFFICIENT_DATA');
  });
  it('unknown heading source -> INSUFFICIENT_DATA', () => {
    const r = verifyCapturePair(baseBefore(), { ...baseAfter(), headingSource: null }, RULES_V1);
    expect(r.overallStatus).toBe('INSUFFICIENT_DATA');
  });
  it('stale heading -> INSUFFICIENT_DATA', () => {
    const a = baseAfter();
    const r = verifyCapturePair(baseBefore(), { ...a, headingMeasuredAt: Date.parse(a.capturedAt as string) - 11_000 }, RULES_V1);
    expect(r.reasons.map((x) => x.code)).toContain('HEADING_STALE');
    expect(r.overallStatus).toBe('INSUFFICIENT_DATA');
  });
  it('high heading uncertainty -> INSUFFICIENT_DATA', () => {
    const r = verifyCapturePair(baseBefore(), { ...baseAfter(), headingUncertaintyDeg: 25 }, RULES_V1);
    expect(r.reasons.map((x) => x.code)).toContain('HEADING_UNRELIABLE');
    expect(r.overallStatus).toBe('INSUFFICIENT_DATA');
  });
  it('different heading sources only produce a warning', () => {
    const r = verifyCapturePair(baseBefore(), { ...baseAfter(), headingSource: 'ios_webkit_compass' }, RULES_V1);
    expect(r.overallStatus).toBe('PASS');
    expect(r.reasons.find((x) => x.code === 'HEADING_SOURCE_MISMATCH')?.severity).toBe('WARNING');
  });
});

describe('cameraHeadingFromOrientation (rear camera axis)', () => {
  const h = (alpha: number, beta: number, gamma: number) => cameraHeadingFromOrientation({ alpha, beta, gamma });
  it('upright portrait facing north -> 0°', () => expect(h(0, 90, 0).headingDeg).toBeCloseTo(0, 9));
  it('upright portrait facing east (alpha 270) -> 90°', () => expect(h(270, 90, 0).headingDeg).toBeCloseTo(90, 9));
  it('upright portrait facing west (alpha 90) -> 270°', () => expect(h(90, 90, 0).headingDeg).toBeCloseTo(270, 9));
  it('tilted down 45° toward the road keeps the heading', () => expect(h(270, 45, 0).headingDeg).toBeCloseTo(90, 9));
  it('landscape (device rolled about its screen normal) gives the same camera heading', () => {
    // Compose R(alpha,beta,gamma) * Rz(roll) and decompose back to W3C Z-X-Y angles.
    const rad = Math.PI / 180;
    const Rz = (t: number) => [[Math.cos(t), -Math.sin(t), 0], [Math.sin(t), Math.cos(t), 0], [0, 0, 1]];
    const Rx = (t: number) => [[1, 0, 0], [0, Math.cos(t), -Math.sin(t)], [0, Math.sin(t), Math.cos(t)]];
    const Ry = (t: number) => [[Math.cos(t), 0, Math.sin(t)], [0, 1, 0], [-Math.sin(t), 0, Math.cos(t)]];
    const mul = (A: number[][], B: number[][]) => A.map((row) => B[0].map((_, j) => row.reduce((s, v, k) => s + v * B[k][j], 0)));
    for (const [alpha, beta, gamma] of [[270, 90, 0], [30, 60, 0], [200, 75, 5]]) {
      const base = h(alpha, beta, gamma).headingDeg!;
      for (const roll of [90, -90, 180]) {
        const R = mul(mul(mul(Rz(alpha * rad), Rx(beta * rad)), Ry(gamma * rad)), Rz(roll * rad));
        const b = Math.asin(R[2][1]) / rad;
        const g = Math.atan2(-R[2][0], R[2][2]) / rad;
        const a = Math.atan2(-R[0][1], R[1][1]) / rad;
        expect(h(a, b, g).headingDeg!).toBeCloseTo(base, 6);
      }
    }
  });
  it('lying flat (camera pointing down) -> unavailable, never 0', () => {
    const r = h(0, 0, 0);
    expect(r.headingDeg).toBeNull();
    expect('reason' in r && r.reason).toBe('CAMERA_NEAR_VERTICAL');
  });
  it('missing angles -> unavailable', () => {
    expect(cameraHeadingFromOrientation({ alpha: 10, beta: null as never, gamma: 0 }).headingDeg).toBeNull();
    expect(cameraHeadingFromOrientation(null).headingDeg).toBeNull();
  });
});
