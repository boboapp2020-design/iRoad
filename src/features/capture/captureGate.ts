import {
  circularHeadingDifference,
  evaluateCapture,
  haversineDistanceM,
  isCaptureAcceptable,
  verifyCapturePair,
  type CaptureMeasurement,
  type VerificationRules,
} from '@verification';
import type { CaptureMeasurementPayload, Photo } from '@/lib/api';
import type { GeoFix } from './useGeolocation';
import type { HeadingReading, HeadingStatus } from './useHeading';

export type CheckState = 'ok' | 'bad' | 'waiting';
export interface GateCheck {
  key: 'gps' | 'distance' | 'heading';
  state: CheckState;
  /** i18n key + params for the live guidance message. */
  message: string;
  params?: Record<string, string | number>;
}

export interface GateResult {
  ready: boolean;
  checks: GateCheck[];
  measurement: CaptureMeasurement;
  distanceM: number | null;
  headingDiffDeg: number | null;
}

export interface GateInput {
  mode: 'BEFORE' | 'AFTER';
  fix: GeoFix | null;
  heading: HeadingReading | null;
  headingStatus: HeadingStatus;
  now: number;
  rules: VerificationRules;
  before?: Pick<Photo, 'latitude' | 'longitude' | 'gps_accuracy_m' | 'heading_degrees' | 'heading_source' | 'heading_uncertainty_deg' | 'captured_at' | 'location_fix_at' | 'heading_measured_at'> | null;
}

export function measurementFrom(fix: GeoFix | null, heading: HeadingReading | null, capturedAt: number): CaptureMeasurement {
  return {
    latitude: fix?.latitude ?? null,
    longitude: fix?.longitude ?? null,
    accuracyM: fix?.accuracy ?? null,
    locationFixAt: fix?.timestamp ?? null,
    headingDeg: heading?.headingDeg ?? null,
    headingSource: heading?.source ?? null,
    headingUncertaintyDeg: heading?.uncertaintyDeg ?? null,
    headingMeasuredAt: heading?.measuredAt ?? null,
    capturedAt,
  };
}

export function photoMeasurement(p: NonNullable<GateInput['before']>): CaptureMeasurement {
  return {
    latitude: p.latitude,
    longitude: p.longitude,
    accuracyM: p.gps_accuracy_m,
    headingDeg: p.heading_degrees,
    headingSource: p.heading_source,
    headingUncertaintyDeg: p.heading_uncertainty_deg,
    capturedAt: p.captured_at,
    locationFixAt: p.location_fix_at,
    headingMeasuredAt: p.heading_measured_at,
  };
}

export function toPayload(m: CaptureMeasurement): CaptureMeasurementPayload {
  const iso = (v: string | number | null | undefined) => (v === null || v === undefined ? null : new Date(v).toISOString());
  return {
    latitude: m.latitude ?? null,
    longitude: m.longitude ?? null,
    accuracy_m: m.accuracyM ?? null,
    heading_deg: m.headingDeg ?? null,
    heading_source: m.headingSource ?? null,
    heading_uncertainty_deg: m.headingUncertaintyDeg ?? null,
    captured_at: iso(m.capturedAt)!,
    location_fix_at: iso(m.locationFixAt),
    heading_measured_at: iso(m.headingMeasuredAt),
  };
}

const r1 = (v: number) => v.toFixed(1);

/**
 * Live capture gate. Uses the SAME shared verification code as the server,
 * so the shutter is enabled only when the server would accept the capture
 * (Before) or compute PASS (After) for the current readings.
 */
export function evaluateGate(input: GateInput): GateResult {
  const { mode, fix, heading, headingStatus, now, rules } = input;
  const measurement = measurementFrom(fix, heading, now);
  const checks: GateCheck[] = [];

  // GPS accuracy + freshness
  if (!fix) checks.push({ key: 'gps', state: 'waiting', message: 'capture.waitingGps' });
  else if (now - fix.timestamp > rules.maxLocationAgeMs) checks.push({ key: 'gps', state: 'waiting', message: 'capture.gpsStale' });
  else if (fix.accuracy > rules.maxGpsAccuracyM) checks.push({ key: 'gps', state: 'bad', message: 'capture.gpsBad', params: { v: r1(fix.accuracy), t: rules.maxGpsAccuracyM } });
  else checks.push({ key: 'gps', state: 'ok', message: 'capture.gpsOk', params: { v: r1(fix.accuracy) } });

  // Distance (After only)
  let distanceM: number | null = null;
  if (mode === 'AFTER') {
    distanceM = input.before && fix ? haversineDistanceM(fix, { latitude: input.before.latitude, longitude: input.before.longitude }) : null;
    if (distanceM === null) checks.push({ key: 'distance', state: 'waiting', message: 'capture.waitingGps' });
    else if (distanceM > rules.maxDistanceM) checks.push({ key: 'distance', state: 'bad', message: 'capture.distanceBad', params: { v: r1(distanceM) } });
    else checks.push({ key: 'distance', state: 'ok', message: 'capture.distanceOk', params: { v: r1(distanceM) } });
  }

  // Heading
  let headingDiffDeg: number | null = null;
  if (headingStatus === 'unavailable' || headingStatus === 'denied') {
    checks.push({ key: 'heading', state: 'bad', message: 'capture.headingUnavailable' });
  } else if (headingStatus === 'needs-permission') {
    checks.push({ key: 'heading', state: 'waiting', message: 'capture.headingPermission' });
  } else if (headingStatus === 'vertical') {
    checks.push({ key: 'heading', state: 'bad', message: 'capture.headingVertical' });
  } else if (!heading) {
    checks.push({ key: 'heading', state: 'waiting', message: 'capture.headingNow', params: { v: '—' } });
  } else if (heading.uncertaintyDeg > rules.maxHeadingUncertaintyDeg) {
    checks.push({ key: 'heading', state: 'bad', message: 'capture.headingUnstable', params: { v: r1(heading.uncertaintyDeg) } });
  } else if (mode === 'AFTER') {
    headingDiffDeg = circularHeadingDifference(input.before?.heading_degrees ?? null, heading.headingDeg);
    const target = input.before?.heading_degrees;
    if (headingDiffDeg === null) checks.push({ key: 'heading', state: 'bad', message: 'capture.headingUnavailable' });
    else if (headingDiffDeg > rules.maxHeadingDifferenceDeg) {
      checks.push({ key: 'heading', state: 'bad', message: 'capture.headingBad', params: { d: Math.round(headingDiffDeg), target: target != null ? Math.round(target) : '—' } });
    } else {
      checks.push({ key: 'heading', state: 'ok', message: 'capture.headingOk', params: { v: Math.round(heading.headingDeg), d: Math.round(headingDiffDeg) } });
    }
  } else {
    checks.push({ key: 'heading', state: 'ok', message: 'capture.headingNow', params: { v: Math.round(heading.headingDeg) } });
  }

  // Authoritative decision: identical logic to the server.
  let ready: boolean;
  if (mode === 'BEFORE') {
    ready = isCaptureAcceptable(evaluateCapture(measurement, 'BEFORE', rules));
  } else {
    ready = !!input.before && verifyCapturePair(photoMeasurement(input.before), measurement, rules).overallStatus === 'PASS';
  }
  ready = ready && checks.every((c) => c.state === 'ok');
  return { ready, checks, measurement, distanceM, headingDiffDeg };
}
