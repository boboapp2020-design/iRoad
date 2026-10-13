/* Road Repair Tracker - verification (GENERATED; paste as its own file in the Apps Script editor) */
var RRVerify = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // shared/verification/index.ts
  var index_exports = {};
  __export(index_exports, {
    CURRENT_RULES: () => CURRENT_RULES,
    EARTH_RADIUS_M: () => EARTH_RADIUS_M,
    RULES_V1: () => RULES_V1,
    RULES_V2: () => RULES_V2,
    RULES_V3: () => RULES_V3,
    SUBMISSION_LIMITS: () => SUBMISSION_LIMITS,
    bearingDeg: () => bearingDeg,
    cameraHeadingFromOrientation: () => cameraHeadingFromOrientation,
    circularHeadingDifference: () => circularHeadingDifference,
    circularStats: () => circularStats,
    deriveStatus: () => deriveStatus,
    evaluateCapture: () => evaluateCapture,
    haversineDistanceM: () => haversineDistanceM,
    isCaptureAcceptable: () => isCaptureAcceptable,
    isFiniteNumber: () => isFiniteNumber,
    isValidAccuracy: () => isValidAccuracy,
    isValidCoordinate: () => isValidCoordinate,
    isValidHeading: () => isValidHeading,
    isValidLatitude: () => isValidLatitude,
    isValidLongitude: () => isValidLongitude,
    normalizeHeading: () => normalizeHeading,
    parseTimestampMs: () => parseTimestampMs,
    thresholdsSnapshot: () => thresholdsSnapshot,
    verifyCapturePair: () => verifyCapturePair
  });

  // shared/verification/rules.ts
  var RULES_V1 = Object.freeze({
    version: "rr-verify-v1",
    maxGpsAccuracyM: 3,
    maxBeforeGpsAccuracyM: 3,
    maxDistanceM: 3,
    maxHeadingDifferenceDeg: 10,
    maxLocationAgeMs: 1e4,
    maxHeadingAgeMs: 1e4,
    maxHeadingUncertaintyDeg: 15,
    futureToleranceMs: 1e3
  });
  var RULES_V2 = Object.freeze({
    ...RULES_V1,
    version: "rr-verify-v2",
    maxBeforeGpsAccuracyM: null
  });
  var RULES_V3 = Object.freeze({
    ...RULES_V2,
    version: "rr-verify-v3",
    maxGpsAccuracyM: null,
    maxBeforeGpsAccuracyM: null,
    maxDistanceM: 1
  });
  var CURRENT_RULES = RULES_V3;
  var SUBMISSION_LIMITS = Object.freeze({
    /** Captures older than this when they reach the server are rejected (ms). */
    maxSubmissionDelayMs: 15 * 6e4,
    /** Captures timestamped further than this in the future are rejected (ms). */
    maxClockSkewMs: 2 * 6e4,
    maxFileSizeBytes: 25 * 1024 * 1024,
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"]
  });
  function thresholdsSnapshot(rules) {
    return {
      max_gps_accuracy_m: rules.maxGpsAccuracyM,
      max_before_gps_accuracy_m: rules.maxBeforeGpsAccuracyM,
      max_distance_m: rules.maxDistanceM,
      max_heading_difference_deg: rules.maxHeadingDifferenceDeg,
      max_location_age_ms: rules.maxLocationAgeMs,
      max_heading_age_ms: rules.maxHeadingAgeMs,
      max_heading_uncertainty_deg: rules.maxHeadingUncertaintyDeg
    };
  }

  // shared/verification/geo.ts
  var EARTH_RADIUS_M = 63710088e-1;
  function isFiniteNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
  }
  function isValidLatitude(lat) {
    return isFiniteNumber(lat) && lat >= -90 && lat <= 90;
  }
  function isValidLongitude(lng) {
    return isFiniteNumber(lng) && lng >= -180 && lng <= 180;
  }
  function isValidCoordinate(p) {
    return !!p && isValidLatitude(p.latitude) && isValidLongitude(p.longitude);
  }
  function isValidAccuracy(accuracy) {
    return isFiniteNumber(accuracy) && accuracy > 0;
  }
  var toRad = (deg) => deg * Math.PI / 180;
  function haversineDistanceM(a, b) {
    if (!isValidCoordinate(a) || !isValidCoordinate(b)) return null;
    const dLat = toRad(b.latitude - a.latitude);
    const dLng = toRad(b.longitude - a.longitude);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
    return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  function bearingDeg(a, b) {
    if (!isValidCoordinate(a) || !isValidCoordinate(b)) return null;
    if (a.latitude === b.latitude && a.longitude === b.longitude) return null;
    const φ1 = toRad(a.latitude);
    const φ2 = toRad(b.latitude);
    const Δλ = toRad(b.longitude - a.longitude);
    const y = Math.sin(Δλ) * Math.cos(φ2);
    const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
    const θ = Math.atan2(y, x) * 180 / Math.PI;
    return (θ % 360 + 360) % 360;
  }

  // shared/verification/heading.ts
  function isValidHeading(value) {
    return isFiniteNumber(value) && value >= 0 && value <= 360;
  }
  function normalizeHeading(value) {
    if (!isFiniteNumber(value)) return null;
    const n = (value % 360 + 360) % 360;
    return n === 0 ? 0 : n;
  }
  function circularHeadingDifference(before, after) {
    if (!isValidHeading(before) || !isValidHeading(after)) return null;
    const d = after - before + 180;
    const mod = (d % 360 + 360) % 360;
    return Math.abs(mod - 180);
  }
  function circularStats(samples) {
    const valid = samples.filter(isValidHeading);
    if (valid.length === 0) return null;
    let s = 0;
    let c = 0;
    for (const h of valid) {
      const r = h * Math.PI / 180;
      s += Math.sin(r);
      c += Math.cos(r);
    }
    s /= valid.length;
    c /= valid.length;
    const R = Math.min(1, Math.sqrt(s * s + c * c));
    if (R < 1e-9) return null;
    const mean = normalizeHeading(Math.atan2(s, c) * 180 / Math.PI);
    const spread = Math.sqrt(-2 * Math.log(R)) * 180 / Math.PI;
    return { meanDeg: mean, spreadDeg: spread };
  }
  function cameraHeadingFromOrientation(o, minHorizontalComponent = 0.15) {
    if (!o || !isFiniteNumber(o.alpha) || !isFiniteNumber(o.beta) || !isFiniteNumber(o.gamma)) {
      return { headingDeg: null, reason: "ORIENTATION_MISSING" };
    }
    const r = Math.PI / 180;
    const ca = Math.cos(o.alpha * r), sa = Math.sin(o.alpha * r);
    const cb = Math.cos(o.beta * r), sb = Math.sin(o.beta * r);
    const cg = Math.cos(o.gamma * r), sg = Math.sin(o.gamma * r);
    const vx = -(ca * sg + sa * sb * cg);
    const vy = -(sa * sg - ca * sb * cg);
    const vz = -(cb * cg);
    const horizontal = Math.hypot(vx, vy);
    if (horizontal < minHorizontalComponent) {
      return { headingDeg: null, reason: "CAMERA_NEAR_VERTICAL" };
    }
    const heading = normalizeHeading(Math.atan2(vx, vy) * 180 / Math.PI);
    const tilt = Math.atan2(vz, horizontal) * 180 / Math.PI;
    return { headingDeg: heading, tiltFromHorizontalDeg: tilt };
  }

  // shared/verification/verify.ts
  function parseTimestampMs(value) {
    if (isFiniteNumber(value)) return value;
    if (typeof value === "string" && value.trim() !== "") {
      const ms = Date.parse(value);
      return Number.isFinite(ms) ? ms : null;
    }
    return null;
  }
  function reason(code, severity, message, extra = {}) {
    return { code, severity, message, ...extra };
  }
  function evaluateCapture(m, capture, rules) {
    const reasons = [];
    if (!m) {
      reasons.push(reason("EVIDENCE_MISSING", "INSUFFICIENT_DATA", `${capture} evidence record is missing.`, { capture }));
      return { capture, locationUsable: false, accuracyPass: null, headingUsable: false, headingDeg: null, reasons };
    }
    const capturedAt = parseTimestampMs(m.capturedAt);
    if (capturedAt === null) {
      reasons.push(reason("CAPTURE_TIME_MISSING", "INSUFFICIENT_DATA", `${capture} capture time is missing or invalid.`, { capture }));
    }
    let coordsValid = false;
    if (m.latitude == null || m.longitude == null) {
      reasons.push(reason("COORDINATES_MISSING", "INSUFFICIENT_DATA", `${capture} coordinates are missing.`, { capture }));
    } else if (!isValidLatitude(m.latitude) || !isValidLongitude(m.longitude)) {
      reasons.push(reason("COORDINATES_INVALID", "INSUFFICIENT_DATA", `${capture} coordinates are out of range.`, { capture }));
    } else {
      coordsValid = true;
    }
    let locationFresh = false;
    const fixAt = parseTimestampMs(m.locationFixAt);
    if (fixAt === null) {
      reasons.push(reason("LOCATION_TIMESTAMP_MISSING", "INSUFFICIENT_DATA", `${capture} GPS fix time is missing.`, { capture }));
    } else if (capturedAt !== null) {
      const age = capturedAt - fixAt;
      if (age > rules.maxLocationAgeMs || age < -rules.futureToleranceMs) {
        reasons.push(
          reason("LOCATION_STALE", "INSUFFICIENT_DATA", `${capture} GPS fix was ${(age / 1e3).toFixed(1)} s from capture (limit ${rules.maxLocationAgeMs / 1e3} s).`, {
            capture,
            value: age,
            threshold: rules.maxLocationAgeMs
          })
        );
      } else {
        locationFresh = true;
      }
    }
    const locationUsable = coordsValid && locationFresh;
    const accuracyLimit = capture === "BEFORE" ? rules.maxBeforeGpsAccuracyM : rules.maxGpsAccuracyM;
    let accuracyPass = null;
    if (accuracyLimit === null && rules.maxGpsAccuracyM === null) {
      if (m.accuracyM != null && !isValidAccuracy(m.accuracyM)) {
        reasons.push(reason("ACCURACY_INVALID", "WARNING", `${capture} GPS accuracy value is invalid (not used as a criterion).`, { capture, value: m.accuracyM }));
      }
      accuracyPass = locationUsable ? true : null;
    } else if (m.accuracyM == null) {
      reasons.push(reason("ACCURACY_MISSING", "INSUFFICIENT_DATA", `${capture} GPS accuracy is missing.`, { capture }));
    } else if (!isValidAccuracy(m.accuracyM)) {
      reasons.push(reason("ACCURACY_INVALID", "INSUFFICIENT_DATA", `${capture} GPS accuracy value is invalid.`, { capture, value: m.accuracyM }));
    } else if (accuracyLimit !== null && m.accuracyM > accuracyLimit) {
      accuracyPass = false;
      reasons.push(
        reason("ACCURACY_EXCEEDED", "FAIL", `${capture} GPS accuracy ${m.accuracyM} m exceeds ${accuracyLimit} m.`, {
          capture,
          value: m.accuracyM,
          threshold: accuracyLimit
        })
      );
    } else {
      if (accuracyLimit === null && rules.maxGpsAccuracyM !== null && m.accuracyM > rules.maxGpsAccuracyM) {
        reasons.push(
          reason("REFERENCE_ACCURACY_LOW", "WARNING", `${capture} reference position is only accurate to ${m.accuracyM} m.`, {
            capture,
            value: m.accuracyM,
            threshold: rules.maxGpsAccuracyM
          })
        );
      }
      accuracyPass = locationUsable ? true : null;
    }
    let headingDeg = null;
    let headingUsable = false;
    if (m.headingDeg == null) {
      reasons.push(reason("HEADING_MISSING", "INSUFFICIENT_DATA", `${capture} heading is unavailable.`, { capture }));
    } else if (!isValidHeading(m.headingDeg)) {
      reasons.push(reason("HEADING_INVALID", "INSUFFICIENT_DATA", `${capture} heading value is invalid.`, { capture, value: m.headingDeg }));
    } else {
      let ok = true;
      if (!m.headingSource || typeof m.headingSource !== "string") {
        ok = false;
        reasons.push(reason("HEADING_SOURCE_MISSING", "INSUFFICIENT_DATA", `${capture} heading source is unknown.`, { capture }));
      }
      const headingAt = parseTimestampMs(m.headingMeasuredAt);
      if (headingAt === null) {
        ok = false;
        reasons.push(reason("HEADING_TIMESTAMP_MISSING", "INSUFFICIENT_DATA", `${capture} heading sample time is missing.`, { capture }));
      } else if (capturedAt !== null) {
        const age = capturedAt - headingAt;
        if (age > rules.maxHeadingAgeMs || age < -rules.futureToleranceMs) {
          ok = false;
          reasons.push(
            reason("HEADING_STALE", "INSUFFICIENT_DATA", `${capture} heading sample was ${(age / 1e3).toFixed(1)} s from capture.`, {
              capture,
              value: age,
              threshold: rules.maxHeadingAgeMs
            })
          );
        }
      } else {
        ok = false;
      }
      if (m.headingUncertaintyDeg != null) {
        if (!isFiniteNumber(m.headingUncertaintyDeg) || m.headingUncertaintyDeg < 0) {
          ok = false;
          reasons.push(reason("HEADING_UNRELIABLE", "INSUFFICIENT_DATA", `${capture} heading uncertainty is invalid.`, { capture }));
        } else if (m.headingUncertaintyDeg > rules.maxHeadingUncertaintyDeg) {
          ok = false;
          reasons.push(
            reason("HEADING_UNRELIABLE", "INSUFFICIENT_DATA", `${capture} heading uncertainty ±${m.headingUncertaintyDeg.toFixed(1)}° is too high; calibrate the compass.`, {
              capture,
              value: m.headingUncertaintyDeg,
              threshold: rules.maxHeadingUncertaintyDeg
            })
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
  function combine(...values) {
    if (values.some((v) => v === false)) return false;
    if (values.some((v) => v === null)) return null;
    return true;
  }
  function deriveStatus(checks, reasons) {
    const { gpsAccuracyPass, distancePass, headingPass } = checks;
    if (gpsAccuracyPass === false || distancePass === false || headingPass === false || reasons.some((r) => r.severity === "FAIL")) {
      return "FAIL";
    }
    if (gpsAccuracyPass === null || distancePass === null || headingPass === null || reasons.some((r) => r.severity === "INSUFFICIENT_DATA")) {
      return "INSUFFICIENT_DATA";
    }
    return "PASS";
  }
  function verifyCapturePair(before, after, rules) {
    const b = evaluateCapture(before, "BEFORE", rules);
    const a = evaluateCapture(after, "AFTER", rules);
    const reasons = [...b.reasons, ...a.reasons];
    const bAt = parseTimestampMs(before == null ? void 0 : before.capturedAt);
    const aAt = parseTimestampMs(after == null ? void 0 : after.capturedAt);
    if (bAt !== null && aAt !== null && aAt <= bAt) {
      reasons.push(reason("CAPTURE_ORDER_INVALID", "INSUFFICIENT_DATA", "After photo is not timestamped later than the Before photo."));
    }
    const gpsAccuracyPass = combine(b.accuracyPass, a.accuracyPass);
    let measuredDistanceM = null;
    let distancePass = null;
    if (b.locationUsable && a.locationUsable) {
      measuredDistanceM = haversineDistanceM(before, after);
    }
    if (measuredDistanceM === null) {
      reasons.push(reason("DISTANCE_NOT_COMPUTABLE", "INSUFFICIENT_DATA", "Distance cannot be computed from reliable coordinates."));
    } else {
      distancePass = measuredDistanceM <= rules.maxDistanceM;
      if (!distancePass) {
        reasons.push(
          reason("DISTANCE_EXCEEDED", "FAIL", `After location is ${measuredDistanceM.toFixed(2)} m from Before (limit ${rules.maxDistanceM} m).`, {
            value: measuredDistanceM,
            threshold: rules.maxDistanceM
          })
        );
      }
    }
    let headingDifferenceDeg = null;
    let headingPass = null;
    if (b.headingUsable && a.headingUsable) {
      headingDifferenceDeg = circularHeadingDifference(b.headingDeg, a.headingDeg);
    }
    if (headingDifferenceDeg === null) {
      reasons.push(reason("HEADING_NOT_COMPUTABLE", "INSUFFICIENT_DATA", "Heading difference cannot be computed from reliable headings."));
    } else {
      headingPass = headingDifferenceDeg <= rules.maxHeadingDifferenceDeg;
      if (!headingPass) {
        reasons.push(
          reason("HEADING_DIFFERENCE_EXCEEDED", "FAIL", `Heading differs by ${headingDifferenceDeg.toFixed(1)}° (limit ${rules.maxHeadingDifferenceDeg}°).`, {
            value: headingDifferenceDeg,
            threshold: rules.maxHeadingDifferenceDeg
          })
        );
      }
      if ((before == null ? void 0 : before.headingSource) && (after == null ? void 0 : after.headingSource) && before.headingSource !== after.headingSource) {
        reasons.push(
          reason("HEADING_SOURCE_MISMATCH", "WARNING", `Heading sources differ (${before.headingSource} vs ${after.headingSource}); compare with care.`)
        );
      }
    }
    const checks = { gpsAccuracyPass, distancePass, headingPass };
    return {
      overallStatus: deriveStatus(checks, reasons),
      ...checks,
      measuredDistanceM,
      headingDifferenceDeg,
      beforeAccuracyM: isValidAccuracy(before == null ? void 0 : before.accuracyM) ? before.accuracyM : null,
      afterAccuracyM: isValidAccuracy(after == null ? void 0 : after.accuracyM) ? after.accuracyM : null,
      reasons,
      rulesVersion: rules.version,
      thresholds: thresholdsSnapshot(rules)
    };
  }
  function isCaptureAcceptable(e) {
    return e.locationUsable && e.accuracyPass === true && e.headingUsable && !e.reasons.some((r) => r.severity !== "WARNING");
  }
  return __toCommonJS(index_exports);
})();
