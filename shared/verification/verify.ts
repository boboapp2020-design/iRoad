import {
  haversineDistanceM,
  isFiniteNumber,
  isValidAccuracy,
  isValidLatitude,
  isValidLongitude,
} from './geo.ts';
import { circularHeadingDifference, isValidHeading, normalizeHeading } from './heading.ts';
import { thresholdsSnapshot, type VerificationRules } from './rules.ts';

export type CaptureType = 'BEFORE' | 'AFTER';
export type VerificationStatus = 'PASS' | 'FAIL' | 'INSUFFICIENT_DATA';
/** PENDING is a job/UI state meaning no authoritative verification exists yet. */
export type DisplayVerificationStatus = VerificationStatus | 'PENDING';
export type ReasonSeverity = 'FAIL' | 'INSUFFICIENT_DATA' | 'WARNING';

export type ReasonCode =
  | 'EVIDENCE_MISSING'
  | 'CAPTURE_TIME_MISSING'
  | 'COORDINATES_MISSING'
  | 'COORDINATES_INVALID'
  | 'LOCATION_TIMESTAMP_MISSING'
  | 'LOCATION_STALE'
  | 'ACCURACY_MISSING'
  | 'ACCURACY_INVALID'
  | 'ACCURACY_EXCEEDED'
  | 'REFERENCE_ACCURACY_LOW'
  | 'DISTANCE_NOT_COMPUTABLE'
  | 'DISTANCE_EXCEEDED'
  | 'HEADING_MISSING'
  | 'HEADING_INVALID'
  | 'HEADING_SOURCE_MISSING'
  | 'HEADING_TIMESTAMP_MISSING'
  | 'HEADING_STALE'
  | 'HEADING_UNRELIABLE'
  | 'HEADING_NOT_COMPUTABLE'
  | 'HEADING_DIFFERENCE_EXCEEDED'
  | 'CAPTURE_ORDER_INVALID'
  | 'HEADING_SOURCE_MISMATCH';

export interface VerificationReason {
  code: ReasonCode;
  severity: ReasonSeverity;
  capture?: CaptureType;
  value?: number | string | null;
  threshold?: number;
  message: string;
}

/** Raw measurement attached to one photograph. Every field may be missing. */
export interface CaptureMeasurement {
  latitude?: number | null;
  longitude?: number | null;
  accuracyM?: number | null;
  headingDeg?: number | null;
  headingSource?: string | null;
  /** Estimated heading uncertainty (degrees), if known. */
  headingUncertaintyDeg?: number | null;
  /** When the photo was captured (ISO string or epoch ms). */
  capturedAt?: string | number | null;
  /** Timestamp of the GPS fix used (ISO string or epoch ms). */
  locationFixAt?: string | number | null;
  /** Timestamp of the heading sample used (ISO string or epoch ms). */
  headingMeasuredAt?: string | number | null;
}

export interface SingleCaptureEvaluation {
  capture: CaptureType;
  /** Coordinates valid AND fix fresh relative to capture time. */
  locationUsable: boolean;
  /** true = within threshold, false = valid but exceeds, null = cannot evaluate. */
  accuracyPass: boolean | null;
  headingUsable: boolean;
  /** Normalized heading in [0, 360) when usable, else null. */
  headingDeg: number | null;
  reasons: VerificationReason[];
}

export interface VerificationOutcome {
  overallStatus: VerificationStatus;
  gpsAccuracyPass: boolean | null;
  distancePass: boolean | null;
  headingPass: boolean | null;
  measuredDistanceM: number | null;
  headingDifferenceDeg: number | null;
  beforeAccuracyM: number | null;
  afterAccuracyM: number | null;
  /** All FAIL and INSUFFICIENT_DATA reasons, plus WARNINGs. Never truncated. */
  reasons: VerificationReason[];
  rulesVersion: string;
  thresholds: ReturnType<typeof thresholdsSnapshot>;
}

export function parseTimestampMs(value: unknown): number | null {
  if (isFiniteNumber(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
}

function reason(
  code: ReasonCode,
  severity: ReasonSeverity,
  message: string,
  extra: Partial<VerificationReason> = {},
): VerificationReason {
  return { code, severity, message, ...extra };
}

/**
 * Evaluate a single capture's own measurements (coordinates, freshness, GPS
 * accuracy, heading). Used for Before acceptance, the live After capture gate
 * and as the first stage of pair verification.
 */
export function evaluateCapture(
  m: CaptureMeasurement | null | undefined,
  capture: CaptureType,
  rules: VerificationRules,
): SingleCaptureEvaluation {
  const reasons: VerificationReason[] = [];
  if (!m) {
    reasons.push(reason('EVIDENCE_MISSING', 'INSUFFICIENT_DATA', `${capture} evidence record is missing.`, { capture }));
    return { capture, locationUsable: false, accuracyPass: null, headingUsable: false, headingDeg: null, reasons };
  }

  const capturedAt = parseTimestampMs(m.capturedAt);
  if (capturedAt === null) {
    reasons.push(reason('CAPTURE_TIME_MISSING', 'INSUFFICIENT_DATA', `${capture} capture time is missing or invalid.`, { capture }));
  }

  // --- Coordinates -------------------------------------------------------
  let coordsValid = false;
  if (m.latitude == null || m.longitude == null) {
    reasons.push(reason('COORDINATES_MISSING', 'INSUFFICIENT_DATA', `${capture} coordinates are missing.`, { capture }));
  } else if (!isValidLatitude(m.latitude) || !isValidLongitude(m.longitude)) {
    reasons.push(reason('COORDINATES_INVALID', 'INSUFFICIENT_DATA', `${capture} coordinates are out of range.`, { capture }));
  } else {
    coordsValid = true;
  }

  // --- Location freshness -------------------------------------------------
  let locationFresh = false;
  const fixAt = parseTimestampMs(m.locationFixAt);
  if (fixAt === null) {
    reasons.push(reason('LOCATION_TIMESTAMP_MISSING', 'INSUFFICIENT_DATA', `${capture} GPS fix time is missing.`, { capture }));
  } else if (capturedAt !== null) {
    const age = capturedAt - fixAt;
    if (age > rules.maxLocationAgeMs || age < -rules.futureToleranceMs) {
      reasons.push(
        reason('LOCATION_STALE', 'INSUFFICIENT_DATA', `${capture} GPS fix was ${(age / 1000).toFixed(1)} s from capture (limit ${rules.maxLocationAgeMs / 1000} s).`, {
          capture,
          value: age,
          threshold: rules.maxLocationAgeMs,
        }),
      );
    } else {
      locationFresh = true;
    }
  }
  const locationUsable = coordsValid && locationFresh;

  // --- GPS accuracy --------------------------------------------------------
  // The After capture always uses maxGpsAccuracyM. The Before capture uses
  // maxBeforeGpsAccuracyM; when that is null it is a recorded reference only.
  const accuracyLimit = capture === 'BEFORE' ? rules.maxBeforeGpsAccuracyM : rules.maxGpsAccuracyM;
  let accuracyPass: boolean | null = null;
  if (m.accuracyM == null) {
    reasons.push(reason('ACCURACY_MISSING', 'INSUFFICIENT_DATA', `${capture} GPS accuracy is missing.`, { capture }));
  } else if (!isValidAccuracy(m.accuracyM)) {
    reasons.push(reason('ACCURACY_INVALID', 'INSUFFICIENT_DATA', `${capture} GPS accuracy value is invalid.`, { capture, value: m.accuracyM as number }));
  } else if (accuracyLimit !== null && m.accuracyM > accuracyLimit) {
    // A valid measurement worse than the limit is a definitive failure even if other data is missing.
    accuracyPass = false;
    reasons.push(
      reason('ACCURACY_EXCEEDED', 'FAIL', `${capture} GPS accuracy ${m.accuracyM} m exceeds ${accuracyLimit} m.`, {
        capture,
        value: m.accuracyM,
        threshold: accuracyLimit,
      }),
    );
  } else {
    if (accuracyLimit === null && m.accuracyM > rules.maxGpsAccuracyM) {
      reasons.push(
        reason('REFERENCE_ACCURACY_LOW', 'WARNING', `${capture} reference position is only accurate to ${m.accuracyM} m.`, {
          capture,
          value: m.accuracyM,
          threshold: rules.maxGpsAccuracyM,
        }),
      );
    }
    accuracyPass = locationUsable ? true : null;
  }

  // --- Heading ---------------------------------------------------------------
  let headingDeg: number | null = null;
  let headingUsable = false;
  if (m.headingDeg == null) {
    reasons.push(reason('HEADING_MISSING', 'INSUFFICIENT_DATA', `${capture} heading is unavailable.`, { capture }));
  } else if (!isValidHeading(m.headingDeg)) {
    reasons.push(reason('HEADING_INVALID', 'INSUFFICIENT_DATA', `${capture} heading value is invalid.`, { capture, value: m.headingDeg as number }));
  } else {
    let ok = true;
    if (!m.headingSource || typeof m.headingSource !== 'string') {
      ok = false;
      reasons.push(reason('HEADING_SOURCE_MISSING', 'INSUFFICIENT_DATA', `${capture} heading source is unknown.`, { capture }));
    }
    const headingAt = parseTimestampMs(m.headingMeasuredAt);
    if (headingAt === null) {
      ok = false;
      reasons.push(reason('HEADING_TIMESTAMP_MISSING', 'INSUFFICIENT_DATA', `${capture} heading sample time is missing.`, { capture }));
    } else if (capturedAt !== null) {
      const age = capturedAt - headingAt;
      if (age > rules.maxHeadingAgeMs || age < -rules.futureToleranceMs) {
        ok = false;
        reasons.push(
          reason('HEADING_STALE', 'INSUFFICIENT_DATA', `${capture} heading sample was ${(age / 1000).toFixed(1)} s from capture.`, {
            capture,
            value: age,
            threshold: rules.maxHeadingAgeMs,
          }),
        );
      }
    } else {
      ok = false;
    }
    if (m.headingUncertaintyDeg != null) {
      if (!isFiniteNumber(m.headingUncertaintyDeg) || m.headingUncertaintyDeg < 0) {
        ok = false;
        reasons.push(reason('HEADING_UNRELIABLE', 'INSUFFICIENT_DATA', `${capture} heading uncertainty is invalid.`, { capture }));
      } else if (m.headingUncertaintyDeg > rules.maxHeadingUncertaintyDeg) {
        ok = false;
        reasons.push(
          reason('HEADING_UNRELIABLE', 'INSUFFICIENT_DATA', `${capture} heading uncertainty ±${m.headingUncertaintyDeg.toFixed(1)}° is too high; calibrate the compass.`, {
            capture,
            value: m.headingUncertaintyDeg,
            threshold: rules.maxHeadingUncertaintyDeg,
          }),
        );
      }
    }
    if (ok) {
      headingUsable = true;
      headingDeg = normalizeHeading(m.headingDeg);
    }
  }

  return { capture, locationUsable, accuracyPass, headingUsable, headingDeg, reasons };
}

function combine(...values: (boolean | null)[]): boolean | null {
  if (values.some((v) => v === false)) return false;
  if (values.some((v) => v === null)) return null;
  return true;
}

/**
 * Status precedence (documented in docs/VERIFICATION.md):
 *  1. Any valid measurement that violates a threshold      -> FAIL
 *  2. Otherwise, any missing / invalid / unreliable value   -> INSUFFICIENT_DATA
 *  3. Otherwise (every mandatory check true)                -> PASS
 * All detected reasons are kept regardless of the final status.
 */
export function deriveStatus(
  checks: { gpsAccuracyPass: boolean | null; distancePass: boolean | null; headingPass: boolean | null },
  reasons: readonly VerificationReason[],
): VerificationStatus {
  const { gpsAccuracyPass, distancePass, headingPass } = checks;
  if (gpsAccuracyPass === false || distancePass === false || headingPass === false || reasons.some((r) => r.severity === 'FAIL')) {
    return 'FAIL';
  }
  if (gpsAccuracyPass === null || distancePass === null || headingPass === null || reasons.some((r) => r.severity === 'INSUFFICIENT_DATA')) {
    return 'INSUFFICIENT_DATA';
  }
  return 'PASS';
}

/** Full Before/After verification. Pure and deterministic. */
export function verifyCapturePair(
  before: CaptureMeasurement | null | undefined,
  after: CaptureMeasurement | null | undefined,
  rules: VerificationRules,
): VerificationOutcome {
  const b = evaluateCapture(before, 'BEFORE', rules);
  const a = evaluateCapture(after, 'AFTER', rules);
  const reasons: VerificationReason[] = [...b.reasons, ...a.reasons];

  const bAt = parseTimestampMs(before?.capturedAt);
  const aAt = parseTimestampMs(after?.capturedAt);
  if (bAt !== null && aAt !== null && aAt <= bAt) {
    reasons.push(reason('CAPTURE_ORDER_INVALID', 'INSUFFICIENT_DATA', 'After photo is not timestamped later than the Before photo.'));
  }

  const gpsAccuracyPass = combine(b.accuracyPass, a.accuracyPass);

  let measuredDistanceM: number | null = null;
  let distancePass: boolean | null = null;
  if (b.locationUsable && a.locationUsable) {
    measuredDistanceM = haversineDistanceM(before!, after!);
  }
  if (measuredDistanceM === null) {
    reasons.push(reason('DISTANCE_NOT_COMPUTABLE', 'INSUFFICIENT_DATA', 'Distance cannot be computed from reliable coordinates.'));
  } else {
    distancePass = measuredDistanceM <= rules.maxDistanceM;
    if (!distancePass) {
      reasons.push(
        reason('DISTANCE_EXCEEDED', 'FAIL', `After location is ${measuredDistanceM.toFixed(2)} m from Before (limit ${rules.maxDistanceM} m).`, {
          value: measuredDistanceM,
          threshold: rules.maxDistanceM,
        }),
      );
    }
  }

  let headingDifferenceDeg: number | null = null;
  let headingPass: boolean | null = null;
  if (b.headingUsable && a.headingUsable) {
    headingDifferenceDeg = circularHeadingDifference(b.headingDeg, a.headingDeg);
  }
  if (headingDifferenceDeg === null) {
    reasons.push(reason('HEADING_NOT_COMPUTABLE', 'INSUFFICIENT_DATA', 'Heading difference cannot be computed from reliable headings.'));
  } else {
    headingPass = headingDifferenceDeg <= rules.maxHeadingDifferenceDeg;
    if (!headingPass) {
      reasons.push(
        reason('HEADING_DIFFERENCE_EXCEEDED', 'FAIL', `Heading differs by ${headingDifferenceDeg.toFixed(1)}° (limit ${rules.maxHeadingDifferenceDeg}°).`, {
          value: headingDifferenceDeg,
          threshold: rules.maxHeadingDifferenceDeg,
        }),
      );
    }
    if (before?.headingSource && after?.headingSource && before.headingSource !== after.headingSource) {
      reasons.push(
        reason('HEADING_SOURCE_MISMATCH', 'WARNING', `Heading sources differ (${before.headingSource} vs ${after.headingSource}); compare with care.`),
      );
    }
  }

  const checks = { gpsAccuracyPass, distancePass, headingPass };
  return {
    overallStatus: deriveStatus(checks, reasons),
    ...checks,
    measuredDistanceM,
    headingDifferenceDeg,
    beforeAccuracyM: isValidAccuracy(before?.accuracyM) ? before!.accuracyM! : null,
    afterAccuracyM: isValidAccuracy(after?.accuracyM) ? after!.accuracyM! : null,
    reasons,
    rulesVersion: rules.version,
    thresholds: thresholdsSnapshot(rules),
  };
}

/** A Before capture is acceptable only when every own-measurement check passes. */
export function isCaptureAcceptable(e: SingleCaptureEvaluation): boolean {
  return e.locationUsable && e.accuracyPass === true && e.headingUsable && !e.reasons.some((r) => r.severity !== 'WARNING');
}
