import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createBackend, type Backend } from './fakeGas';

export const ORIGIN = { latitude: 13.764321, longitude: 100.538721 };
const M_PER_DEG_LAT = (6_371_008.8 * Math.PI) / 180;

export function northOf(p: { latitude: number; longitude: number }, meters: number) {
  return { latitude: p.latitude + meters / M_PER_DEG_LAT, longitude: p.longitude };
}

export function fakeJpeg(size = 2048): Buffer {
  return Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), randomBytes(size), Buffer.from([0xff, 0xd9])]);
}

export function measurement(overrides: Record<string, unknown> = {}) {
  const now = Date.now();
  return {
    latitude: ORIGIN.latitude,
    longitude: ORIGIN.longitude,
    accuracy_m: 2.1,
    heading_deg: 125,
    heading_source: 'android_absolute_orientation',
    heading_uncertainty_deg: 2,
    captured_at: new Date(now).toISOString(),
    location_fix_at: new Date(now - 1500).toISOString(),
    heading_measured_at: new Date(now - 100).toISOString(),
    ...overrides,
  };
}

export function capturePayload(jobId: string, captureType: 'BEFORE' | 'AFTER', m: Record<string, unknown> = {}, image = fakeJpeg()) {
  return {
    job_id: jobId,
    capture_type: captureType,
    photo_id: randomUUID(),
    image_base64: image.toString('base64'),
    mime_type: 'image/jpeg',
    client_sha256: createHash('sha256').update(image).digest('hex'),
    capture_method: 'image_capture_api',
    device_metadata: { user_agent: 'vitest' },
    measurement: measurement(m),
  };
}

export interface World {
  b: Backend;
  admin: string;
  inspector: string;
  inspector2: string;
  reviewer: string;
  ids: Record<string, string>;
}

/** Sign in a freshly created user and replace the temporary password. */
function activate(b: Backend, email: string, temp: string): string {
  const login = b.call('login', { email, password: temp });
  if (!login.ok) throw new Error('login failed: ' + JSON.stringify(login.error));
  const token = login.data.token;
  const changed = b.call('changePassword', { current_password: temp, new_password: 'Str0ngPassw0rd' }, token);
  if (!changed.ok) throw new Error('change failed: ' + JSON.stringify(changed.error));
  return token;
}

export function setupWorld(): World {
  const b = createBackend();
  b.ctx.setup();
  const adminTemp = b.ctx.createInitialAdmin('admin@example.com', 'Admin').temporary_password;
  const admin = activate(b, 'admin@example.com', adminTemp);
  const ids: Record<string, string> = {};
  const tokens: Record<string, string> = {};
  for (const [key, email, role] of [
    ['inspector', 'insp1@example.com', 'inspector'],
    ['inspector2', 'insp2@example.com', 'inspector'],
    ['reviewer', 'rev@example.com', 'reviewer'],
  ] as const) {
    const r = b.call('createUser', { email, full_name: key, role }, admin);
    if (!r.ok) throw new Error(JSON.stringify(r.error));
    ids[key] = r.data.user.id;
    tokens[key] = activate(b, email, r.data.temporary_password);
  }
  return { b, admin, inspector: tokens.inspector, inspector2: tokens.inspector2, reviewer: tokens.reviewer, ids };
}

export function createJob(w: World, token = w.inspector) {
  const r = w.b.call('createJob', { road_name: 'ถ.สุขุมวิท กม.12', damage_type: 'POTHOLE', priority: 'MEDIUM', description: 'หลุมลึก 50 ซม.' }, token);
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.data.job as { id: string; job_code: string; status: string };
}

/** Job with valid Before evidence, marked repaired (status AWAITING_AFTER_PHOTO). */
export function jobReadyForAfter(w: World) {
  const job = createJob(w);
  const before = w.b.call('submitCapture', capturePayload(job.id, 'BEFORE'), w.inspector);
  if (!before.ok) throw new Error(JSON.stringify(before.error));
  const done = w.b.call('markRepairDone', { id: job.id }, w.inspector);
  if (!done.ok) throw new Error(JSON.stringify(done.error));
  return { job, before: before.data.photo };
}

export function afterPayload(jobId: string, m: Record<string, unknown> = {}) {
  return capturePayload(jobId, 'AFTER', { ...northOf(ORIGIN, 1.8), accuracy_m: 2.4, heading_deg: 128, ...m });
}
