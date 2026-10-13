import { describe, expect, it } from 'vitest';
import { RULES_V1, RULES_V2, RULES_V3 } from '@verification';
import { evaluateGate } from '@/features/capture/captureGate';
import type { GeoFix } from '@/features/capture/useGeolocation';
import type { HeadingReading } from '@/features/capture/useHeading';

const NOW = Date.parse('2026-03-20T04:10:00Z');
const fix = (o: Partial<GeoFix> = {}): GeoFix => ({ latitude: 13.764318, longitude: 100.538719, accuracy: 2.4, timestamp: NOW - 800, timeSource: 'device', sampleCount: 1, ...o });
const heading = (o: Partial<HeadingReading> = {}): HeadingReading => ({ headingDeg: 128, uncertaintyDeg: 2, measuredAt: NOW - 50, source: 'android_absolute_orientation', sampleCount: 5, platformAccuracyDeg: null, ...o });
const before = {
  latitude: 13.764321, longitude: 100.538721, gps_accuracy_m: 2.1, heading_degrees: 125, heading_source: 'android_absolute_orientation',
  heading_uncertainty_deg: 2, captured_at: '2026-03-12T03:24:00Z', location_fix_at: '2026-03-12T03:23:58.500Z', heading_measured_at: '2026-03-12T03:23:59.900Z',
};

describe('capture gate (Before)', () => {
  it('is ready with an accurate fresh fix and a stable heading', () => {
    const g = evaluateGate({ mode: 'BEFORE', fix: fix(), heading: heading(), headingStatus: 'ok', now: NOW, rules: RULES_V1 });
    expect(g.ready).toBe(true);
  });
  it('waits for GPS when there is no fix', () => {
    const g = evaluateGate({ mode: 'BEFORE', fix: null, heading: heading(), headingStatus: 'ok', now: NOW, rules: RULES_V1 });
    expect(g.ready).toBe(false);
    expect(g.checks[0]).toMatchObject({ key: 'gps', state: 'waiting', message: 'capture.waitingGps' });
  });
  it('blocks accuracy above 3 m with a clear message', () => {
    const g = evaluateGate({ mode: 'BEFORE', fix: fix({ accuracy: 4.2 }), heading: heading(), headingStatus: 'ok', now: NOW, rules: RULES_V1 });
    expect(g.ready).toBe(false);
    expect(g.checks[0]).toMatchObject({ state: 'bad', params: { v: '4.2', t: 3 } });
  });
  it('blocks a stale fix', () => {
    const g = evaluateGate({ mode: 'BEFORE', fix: fix({ timestamp: NOW - 11_000 }), heading: heading(), headingStatus: 'ok', now: NOW, rules: RULES_V1 });
    expect(g.ready).toBe(false);
  });
  it('never lets an unsupported heading sensor bypass the requirement', () => {
    for (const status of ['unavailable', 'denied', 'needs-permission', 'vertical'] as const) {
      const g = evaluateGate({ mode: 'BEFORE', fix: fix(), heading: null, headingStatus: status, now: NOW, rules: RULES_V1 });
      expect(g.ready).toBe(false);
    }
  });
  it('blocks an unstable heading', () => {
    const g = evaluateGate({ mode: 'BEFORE', fix: fix(), heading: heading({ uncertaintyDeg: 20 }), headingStatus: 'ok', now: NOW, rules: RULES_V1 });
    expect(g.ready).toBe(false);
  });
});

describe('capture gate (After)', () => {
  it('is ready within 3 m and 10°', () => {
    const g = evaluateGate({ mode: 'AFTER', fix: fix(), heading: heading(), headingStatus: 'ok', now: NOW, rules: RULES_V1, before });
    expect(g.ready).toBe(true);
    expect(g.distanceM!).toBeLessThan(1);
    expect(g.headingDiffDeg).toBe(3);
  });
  it('tells the user to move closer when more than 3 m away', () => {
    const g = evaluateGate({ mode: 'AFTER', fix: fix({ latitude: 13.764321 + 4.2 / 111195 }), heading: heading(), headingStatus: 'ok', now: NOW, rules: RULES_V1, before });
    expect(g.ready).toBe(false);
    expect(g.checks.find((c) => c.key === 'distance')).toMatchObject({ state: 'bad', message: 'capture.distanceBad', params: { v: '4.2' } });
  });
  it('tells the user to rotate when heading differs by more than 10°', () => {
    const g = evaluateGate({ mode: 'AFTER', fix: fix(), heading: heading({ headingDeg: 137 }), headingStatus: 'ok', now: NOW, rules: RULES_V1, before });
    expect(g.ready).toBe(false);
    expect(g.checks.find((c) => c.key === 'heading')).toMatchObject({ state: 'bad', message: 'capture.headingBad', params: { d: 12, target: 125 } });
  });
  it('is not ready without Before evidence', () => {
    expect(evaluateGate({ mode: 'AFTER', fix: fix(), heading: heading(), headingStatus: 'ok', now: NOW, rules: RULES_V1, before: null }).ready).toBe(false);
  });
  it('is not ready when the Before record lacks a heading', () => {
    expect(evaluateGate({ mode: 'AFTER', fix: fix(), heading: heading(), headingStatus: 'ok', now: NOW, rules: RULES_V1, before: { ...before, heading_degrees: null } }).ready).toBe(false);
  });
});

describe('capture gate with rules v2', () => {
  it('lets the Before photo be taken with poor accuracy (reference only)', () => {
    const g = evaluateGate({ mode: 'BEFORE', fix: fix({ accuracy: 9.3 }), heading: heading(), headingStatus: 'ok', now: NOW, rules: RULES_V2 });
    expect(g.ready).toBe(true);
    expect(g.checks[0]).toMatchObject({ state: 'ok', message: 'capture.gpsReferenceWeak', params: { v: '9.3' } });
  });
  it('still waits for a GPS fix and a heading for the Before photo', () => {
    expect(evaluateGate({ mode: 'BEFORE', fix: null, heading: heading(), headingStatus: 'ok', now: NOW, rules: RULES_V2 }).ready).toBe(false);
    expect(evaluateGate({ mode: 'BEFORE', fix: fix(), heading: null, headingStatus: 'unavailable', now: NOW, rules: RULES_V2 }).ready).toBe(false);
  });
  it('keeps the 3 m accuracy requirement for the After photo', () => {
    const g = evaluateGate({ mode: 'AFTER', fix: fix({ accuracy: 4 }), heading: heading(), headingStatus: 'ok', now: NOW, rules: RULES_V2, before: { ...before, gps_accuracy_m: 9 } });
    expect(g.ready).toBe(false);
    expect(g.checks[0]).toMatchObject({ state: 'bad', message: 'capture.gpsBad' });
  });
  it('After can be ready against a weak Before reference', () => {
    expect(evaluateGate({ mode: 'AFTER', fix: fix(), heading: heading(), headingStatus: 'ok', now: NOW, rules: RULES_V2, before: { ...before, gps_accuracy_m: 9 } }).ready).toBe(true);
  });
});

describe('capture gate with rules v3', () => {
  it('After ignores accuracy and needs ≤ 1 m and ≤ 10°', () => {
    const ok = evaluateGate({ mode: 'AFTER', fix: fix({ accuracy: 6 }), heading: heading(), headingStatus: 'ok', now: NOW, rules: RULES_V3, before });
    expect(ok.ready).toBe(true); // fix() is ~0.37 m from Before
    expect(ok.checks[0]).toMatchObject({ state: 'ok', message: 'capture.gpsInfo' });
    const far = evaluateGate({ mode: 'AFTER', fix: fix({ latitude: 13.764321 + 1.5 / 111195 }), heading: heading(), headingStatus: 'ok', now: NOW, rules: RULES_V3, before });
    expect(far.ready).toBe(false);
    expect(far.checks.find((c) => c.key === 'distance')).toMatchObject({ state: 'bad', params: { v: '1.5' } });
  });
  it('Before ignores accuracy', () => {
    const g = evaluateGate({ mode: 'BEFORE', fix: fix({ accuracy: 25 }), heading: heading(), headingStatus: 'ok', now: NOW, rules: RULES_V3 });
    expect(g.ready).toBe(true);
    expect(g.checks[0].message).toBe('capture.gpsReference');
  });
});

describe('GPS smoothing (jitter tolerance)', () => {
  it('averages readings from the last 5 s, weighting accurate ones more, and keeps the newest timestamp', async () => {
    const { smoothFixes } = await import('@/features/capture/useGeolocation');
    const base = { timeSource: 'device' as const, sampleCount: 1 };
    const m = 1 / 111195; // ~1 m in degrees latitude
    const s = smoothFixes([
      { ...base, latitude: 13 + 1.0 * m, longitude: 100, accuracy: 4, timestamp: 1000 },
      { ...base, latitude: 13 - 1.0 * m, longitude: 100, accuracy: 4, timestamp: 2000 },
      { ...base, latitude: 13 + 0.2 * m, longitude: 100, accuracy: 4, timestamp: 3000 },
    ])!;
    expect(Math.abs(s.latitude - 13) / m).toBeLessThan(0.1); // ±1 m jitter averages out
    expect(s).toMatchObject({ timestamp: 3000, sampleCount: 3, accuracy: 4 });
  });
  it('drops readings older than 5 s', async () => {
    const { smoothFixes } = await import('@/features/capture/useGeolocation');
    const base = { timeSource: 'device' as const, sampleCount: 1, longitude: 100, accuracy: 3 };
    const s = smoothFixes([{ ...base, latitude: 14, timestamp: 0 }, { ...base, latitude: 13, timestamp: 6000 }])!;
    expect(s).toMatchObject({ latitude: 13, sampleCount: 1 });
  });
  it('gives jittery but correctly placed readings a stable PASS against a 1 m limit', async () => {
    const { smoothFixes } = await import('@/features/capture/useGeolocation');
    const { RULES_V3 } = await import('@verification');
    const m = 1 / 111195;
    const jitter = [1.4, -1.2, 0.9, -1.1, 1.3, -0.8, 0.6, -1.3]; // single readings up to 1.4 m off
    const raw = jitter.map((d, i) => ({ latitude: 13.764321 + d * m, longitude: 100.538721, accuracy: 4, timestamp: NOW - 4200 + i * 600, timeSource: 'device' as const, sampleCount: 1 }));
    const smoothed = smoothFixes(raw)!;
    const g = evaluateGate({ mode: 'AFTER', fix: smoothed, heading: heading({ headingDeg: 125 }), headingStatus: 'ok', now: NOW, rules: RULES_V3, before: { ...before, latitude: 13.764321, longitude: 100.538721 } });
    expect(g.distanceM!).toBeLessThan(0.5);
    expect(g.ready).toBe(true);
  });
});
