import { describe, expect, it } from 'vitest';
import { RULES_V1 } from '@verification';
import { evaluateGate } from '@/features/capture/captureGate';
import type { GeoFix } from '@/features/capture/useGeolocation';
import type { HeadingReading } from '@/features/capture/useHeading';

const NOW = Date.parse('2026-03-20T04:10:00Z');
const fix = (o: Partial<GeoFix> = {}): GeoFix => ({ latitude: 13.764318, longitude: 100.538719, accuracy: 2.4, timestamp: NOW - 800, timeSource: 'device', ...o });
const heading = (o: Partial<HeadingReading> = {}): HeadingReading => ({ headingDeg: 128, uncertaintyDeg: 2, measuredAt: NOW - 50, source: 'android_absolute_orientation', sampleCount: 5, ...o });
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
