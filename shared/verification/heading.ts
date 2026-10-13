import { isFiniteNumber } from './geo.ts';

/**
 * A heading is valid when it is a finite number in [0, 360]. 360 is accepted
 * and normalized to 0. Missing headings are NEVER replaced with 0.
 */
export function isValidHeading(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0 && value <= 360;
}

/** Normalize any finite angle to [0, 360). Returns null for non-finite input. */
export function normalizeHeading(value: unknown): number | null {
  if (!isFiniteNumber(value)) return null;
  const n = ((value % 360) + 360) % 360;
  // Guard against -0 and floating artefacts like 359.99999999999994 -> keep as is.
  return n === 0 ? 0 : n;
}

/**
 * Circular difference in degrees, range [0, 180].
 *   difference = abs(((after - before + 180) mod 360) - 180)
 * using a true (always non-negative) modulo so negative inputs behave.
 * Returns null when either heading is missing or invalid.
 */
export function circularHeadingDifference(before: unknown, after: unknown): number | null {
  if (!isValidHeading(before) || !isValidHeading(after)) return null;
  const d = after - before + 180;
  const mod = ((d % 360) + 360) % 360;
  return Math.abs(mod - 180);
}

/**
 * Circular mean and spread of heading samples (degrees). `spreadDeg` is the
 * circular standard deviation — used as a heading uncertainty estimate when
 * the platform does not report one. Returns null for an empty/invalid set.
 */
export function circularStats(samples: readonly number[]): { meanDeg: number; spreadDeg: number } | null {
  const valid = samples.filter(isValidHeading);
  if (valid.length === 0) return null;
  let s = 0;
  let c = 0;
  for (const h of valid) {
    const r = (h * Math.PI) / 180;
    s += Math.sin(r);
    c += Math.cos(r);
  }
  s /= valid.length;
  c /= valid.length;
  const R = Math.min(1, Math.sqrt(s * s + c * c));
  if (R < 1e-9) return null; // perfectly opposed samples: no meaningful mean
  const mean = normalizeHeading((Math.atan2(s, c) * 180) / Math.PI)!;
  const spread = (Math.sqrt(-2 * Math.log(R)) * 180) / Math.PI;
  return { meanDeg: mean, spreadDeg: spread };
}

export interface OrientationAngles {
  alpha: number;
  beta: number;
  gamma: number;
}

/**
 * Compass heading of the REAR CAMERA optical axis (device -Z axis) from an
 * ABSOLUTE DeviceOrientation reading (W3C Z-X'-Y'' intrinsic Tait-Bryan
 * angles, earth frame x=East, y=North, z=Up).
 *
 * The device -Z axis does not depend on screen orientation, so the result is
 * the same in portrait and landscape. When the camera points nearly straight
 * up/down the horizontal component vanishes and the heading is undefined:
 * returns null with `reason: 'CAMERA_NEAR_VERTICAL'`.
 *
 * This is the direction the device back faces; it approximates — but is not
 * guaranteed to equal — the lens optical axis.
 */
export function cameraHeadingFromOrientation(
  o: Partial<OrientationAngles> | null | undefined,
  minHorizontalComponent = 0.15,
): { headingDeg: number; tiltFromHorizontalDeg: number } | { headingDeg: null; reason: string } {
  if (!o || !isFiniteNumber(o.alpha) || !isFiniteNumber(o.beta) || !isFiniteNumber(o.gamma)) {
    return { headingDeg: null, reason: 'ORIENTATION_MISSING' };
  }
  const r = Math.PI / 180;
  const ca = Math.cos(o.alpha * r), sa = Math.sin(o.alpha * r);
  const cb = Math.cos(o.beta * r), sb = Math.sin(o.beta * r);
  const cg = Math.cos(o.gamma * r), sg = Math.sin(o.gamma * r);
  // v = R * (0, 0, -1) = -(third column of R)
  const vx = -(ca * sg + sa * sb * cg);
  const vy = -(sa * sg - ca * sb * cg);
  const vz = -(cb * cg);
  const horizontal = Math.hypot(vx, vy);
  if (horizontal < minHorizontalComponent) {
    return { headingDeg: null, reason: 'CAMERA_NEAR_VERTICAL' };
  }
  const heading = normalizeHeading((Math.atan2(vx, vy) * 180) / Math.PI)!;
  const tilt = (Math.atan2(vz, horizontal) * 180) / Math.PI;
  return { headingDeg: heading, tiltFromHorizontalDeg: tilt };
}
