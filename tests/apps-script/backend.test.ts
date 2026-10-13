import { createHash, pbkdf2Sync } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { createBackend } from './fakeGas';
import { afterPayload, capturePayload, createJob, fakeJpeg, jobReadyForAfter, northOf, ORIGIN, setupWorld, type World } from './helpers';

describe('setup', () => {
  it('creates every sheet with headers and removes the empty default sheet', () => {
    const b = createBackend();
    b.ctx.setup();
    const names = b.ss.getSheets().map((s) => s.getName());
    expect(names).not.toContain('ชีต1');
    for (const t of ['users', 'repair_jobs', 'repair_photos', 'verification_results', 'repair_reviews', 'audit_logs', 'settings']) {
      expect(names).toContain(t);
    }
    expect(b.sheet('repair_photos').data[0].slice(0, 3)).toEqual(['id', 'repair_job_id', 'capture_type']);
    expect(b.sheet('settings').rows().map((r) => r.key).sort()).toEqual(['allow_self_approval', 'session_ttl_hours']);
    // Running it again is safe.
    b.ctx.setup();
    expect(b.sheet('settings').rows()).toHaveLength(2);
  });
});

describe('crypto', () => {
  it('PBKDF2-HMAC-SHA256 matches Node reference', () => {
    const b = createBackend();
    const salt = '00112233445566778899aabbccddeeff';
    const r = b.ctx.hashPassword('รหัสผ่าน-Test1', salt, 1000);
    expect(r.hash).toBe(pbkdf2Sync('รหัสผ่าน-Test1', Buffer.from(salt, 'hex'), 1000, 32, 'sha256').toString('hex'));
  });
  it('stores no plaintext passwords and never returns credential fields', () => {
    const w = setupWorld();
    const users = w.b.call('listUsers', {}, w.admin);
    expect(JSON.stringify(users)).not.toMatch(/password_hash|password_salt|Str0ngPassw0rd/);
    expect(JSON.stringify(w.b.sheet('users').data)).not.toContain('Str0ngPassw0rd');
  });
});

describe('authentication', () => {
  let w: World;
  beforeEach(() => { w = setupWorld(); });

  it('rejects missing and forged tokens', () => {
    expect(w.b.call('listJobs', {}).error?.code).toBe('UNAUTHENTICATED');
    expect(w.b.call('listJobs', {}, 'a'.repeat(64)).error?.code).toBe('UNAUTHENTICATED');
  });
  it('forces a temporary password to be changed before use', () => {
    const created = w.b.call('createUser', { email: 'new@example.com', full_name: 'New', role: 'inspector' }, w.admin);
    const login = w.b.call('login', { email: 'new@example.com', password: created.data.temporary_password });
    expect(login.data.user.must_change_password).toBe(true);
    expect(w.b.call('listJobs', {}, login.data.token).error?.code).toBe('PASSWORD_CHANGE_REQUIRED');
  });
  it('uses one generic error for unknown email and wrong password', () => {
    expect(w.b.call('login', { email: 'nobody@example.com', password: 'x' }).error?.code).toBe('INVALID_CREDENTIALS');
    expect(w.b.call('login', { email: 'insp1@example.com', password: 'wrong' }).error?.code).toBe('INVALID_CREDENTIALS');
  });
  it('locks the account after repeated failures', () => {
    for (let i = 0; i < 5; i++) w.b.call('login', { email: 'insp1@example.com', password: 'wrong' });
    expect(w.b.call('login', { email: 'insp1@example.com', password: 'Str0ngPassw0rd' }).error?.code).toBe('ACCOUNT_LOCKED');
  });
  it('resets a password with an emailed code without revealing whether the email exists', () => {
    expect(w.b.call('requestPasswordReset', { email: 'nobody@example.com' }).data).toEqual({ requested: true });
    expect(w.b.outbox).toHaveLength(0);
    w.b.call('requestPasswordReset', { email: 'insp1@example.com' });
    const code = w.b.outbox[0].body.match(/(\d{6})/)![1];
    expect(w.b.call('resetPassword', { email: 'insp1@example.com', code: '000000' === code ? '111111' : '000000', new_password: 'An0therPassword' }).error?.code).toBe('INVALID_RESET_CODE');
    expect(w.b.call('resetPassword', { email: 'insp1@example.com', code, new_password: 'An0therPassword' }).ok).toBe(true);
    expect(w.b.call('resetPassword', { email: 'insp1@example.com', code, new_password: 'An0therPassword2' }).error?.code).toBe('INVALID_RESET_CODE');
    expect(w.b.call('login', { email: 'insp1@example.com', password: 'An0therPassword' }).ok).toBe(true);
  });
  it('revokes sessions on logout and when an account is disabled', () => {
    const t = w.b.call('login', { email: 'insp2@example.com', password: 'Str0ngPassw0rd' }).data.token;
    w.b.call('logout', {}, t);
    expect(w.b.call('me', {}, t).error?.code).toBe('UNAUTHENTICATED');
    w.b.call('updateUser', { id: w.ids.inspector, active: false }, w.admin);
    expect(w.b.call('me', {}, w.inspector).error?.code).toBe('UNAUTHENTICATED');
  });
  it('prevents an admin from removing their own admin role', () => {
    const me = w.b.call('me', {}, w.admin).data.user;
    expect(w.b.call('updateUser', { id: me.id, role: 'inspector' }, w.admin).error?.code).toBe('FORBIDDEN');
  });
});

describe('jobs and permissions', () => {
  let w: World;
  beforeEach(() => { w = setupWorld(); });

  it('generates sequential job codes RR-YYYY-NNNNNN and starts in DRAFT', () => {
    const y = new Date().getUTCFullYear();
    expect(createJob(w)).toMatchObject({ job_code: `RR-${y}-000001`, status: 'DRAFT' });
    expect(createJob(w).job_code).toBe(`RR-${y}-000002`);
  });
  it('hides other inspectors\' jobs (list and direct access)', () => {
    const job = createJob(w);
    expect(w.b.call('listJobs', {}, w.inspector2).data.jobs).toHaveLength(0);
    expect(w.b.call('getJob', { id: job.id }, w.inspector2).error?.code).toBe('NOT_FOUND');
    expect(w.b.call('getJob', { id: job.id }, w.reviewer).ok).toBe(true);
  });
  it('refuses job creation by a reviewer and assignment by an inspector', () => {
    expect(w.b.call('createJob', { road_name: 'x', damage_type: 'POTHOLE', priority: 'LOW' }, w.reviewer).error?.code).toBe('FORBIDDEN');
    expect(w.b.call('createJob', { road_name: 'x', damage_type: 'POTHOLE', priority: 'LOW', assigned_to: w.ids.inspector2 }, w.inspector).error?.code).toBe('FORBIDDEN');
  });
  it('validates enumerations and required fields', () => {
    expect(w.b.call('createJob', { road_name: 'x', damage_type: 'LAVA', priority: 'LOW' }, w.inspector).error?.code).toBe('VALIDATION_ERROR');
    expect(w.b.call('createJob', { damage_type: 'POTHOLE', priority: 'LOW' }, w.inspector).error?.code).toBe('VALIDATION_ERROR');
  });
  it('stores formula-like text as inert text and reads it back unchanged', () => {
    const r = w.b.call('createJob', { road_name: '=IMPORTXML("http://evil","//a")', damage_type: 'POTHOLE', priority: 'LOW' }, w.inspector);
    expect(r.ok).toBe(true);
    expect(w.b.call('getJob', { id: r.data.job.id }, w.inspector).data.job.road_name).toBe('=IMPORTXML("http://evil","//a")');
  });
  it('lets an admin cancel with a reason but not without one', () => {
    const job = createJob(w);
    expect(w.b.call('cancelJob', { id: job.id }, w.admin).error?.code).toBe('VALIDATION_ERROR');
    expect(w.b.call('cancelJob', { id: job.id, reason: 'Duplicate report' }, w.admin).data.job.status).toBe('CANCELLED');
    expect(w.b.call('cancelJob', { id: job.id, reason: 'again' }, w.admin).error?.code).toBe('INVALID_TRANSITION');
  });
  it('upgrades a sheet created before newer columns were appended (no SCHEMA_MISMATCH)', () => {
    const job = createJob(w);
    const sh = w.b.sheet('repair_jobs');
    const at = sh.data[0].indexOf('deleted_at');
    for (const row of sh.data) row.length = at; // older schema: trailing columns absent
    const r = w.b.call('listJobs', {}, w.inspector);
    expect(r.ok).toBe(true);
    expect(r.data.jobs.map((j: { id: string }) => j.id)).toEqual([job.id]);
    expect(sh.data[0].slice(at)).toEqual(['deleted_at', 'deleted_by', 'delete_reason']);
    expect(w.b.call('deleteJob', { id: job.id, reason: 'Duplicate report' }, w.inspector).ok).toBe(true);
  });
  it('still refuses a sheet whose existing headers were changed', () => {
    createJob(w);
    w.b.sheet('repair_jobs').data[0][1] = 'something_else';
    expect(w.b.call('listJobs', {}, w.inspector).error?.code).toBe('SCHEMA_MISMATCH');
  });
  it('lets only an admin erase all repair records with the typed phrase; users and audit stay', () => {
    const { job } = jobReadyForAfter(w);
    w.b.call('submitCapture', afterPayload(job.id), w.inspector);
    createJob(w);
    expect(w.b.drive.activeFiles().length).toBe(2);
    expect(w.b.call('purgeRepairData', { confirm: 'ลบทั้งหมด', reason: 'เริ่มทดสอบใหม่' }, w.inspector).error?.code).toBe('FORBIDDEN');
    expect(w.b.call('purgeRepairData', { confirm: 'ลบ', reason: 'เริ่มทดสอบใหม่' }, w.admin).error?.code).toBe('VALIDATION_ERROR');
    const r = w.b.call('purgeRepairData', { confirm: 'ลบทั้งหมด', reason: 'เริ่มทดสอบใหม่' }, w.admin);
    expect(r.ok).toBe(true);
    expect(r.data.rows).toMatchObject({ repair_jobs: 2, repair_photos: 2, verification_results: 1 });
    expect(r.data.files_trashed).toBe(2);
    expect(w.b.drive.activeFiles()).toHaveLength(0);
    for (const t of ['repair_jobs', 'repair_photos', 'verification_results', 'repair_reviews']) expect(w.b.sheet(t).rows()).toHaveLength(0);
    expect(w.b.call('listJobs', {}, w.admin).data.jobs).toHaveLength(0);
    expect(w.b.call('stats', {}, w.admin).data.counts.total).toBe(0);
    expect(w.b.sheet('users').rows().length).toBeGreaterThan(0);
    expect(w.b.sheet('audit_logs').rows().some((a) => a.action === 'data.purged')).toBe(true);
    expect(w.b.call('verifyAuditChain', {}, w.admin).data.intact).toBe(true);
    // Work continues normally and codes are not reused.
    const y = new Date().getUTCFullYear();
    expect(createJob(w).job_code).toBe(`RR-${y}-000003`);
  });
  it('reports dashboard counts scoped to the caller', () => {
    createJob(w);
    createJob(w, w.inspector2);
    expect(w.b.call('stats', {}, w.inspector).data.counts).toMatchObject({ total: 1, DRAFT: 1 });
    expect(w.b.call('stats', {}, w.admin).data.counts.total).toBe(2);
  });
});

describe('Before capture', () => {
  let w: World;
  beforeEach(() => { w = setupWorld(); });

  it('stores the original bytes privately with a server-verified SHA-256', () => {
    const job = createJob(w);
    const img = fakeJpeg(5000);
    const r = w.b.call('submitCapture', capturePayload(job.id, 'BEFORE', {}, img), w.inspector);
    expect(r.ok).toBe(true);
    expect(r.data.job.status).toBe('AWAITING_REPAIR');
    expect(r.data.photo.sha256_hash).toBe(createHash('sha256').update(img).digest('hex'));
    expect(r.data.photo.file_size_bytes).toBe(img.length);
    const files = w.b.drive.activeFiles();
    expect(files).toHaveLength(1);
    expect(Buffer.from(files[0].blob.getBytes().map((x: number) => x & 0xff)).equals(img)).toBe(true);
  });
  it('accepts a Before photo taken anywhere, even with poor GPS accuracy (rules v2), with a warning', () => {
    const job = createJob(w);
    const r = w.b.call('submitCapture', capturePayload(job.id, 'BEFORE', { accuracy_m: 8.5 }), w.inspector);
    expect(r.ok).toBe(true);
    expect(r.data.photo.gps_accuracy_m).toBe(8.5);
    expect(r.data.job.status).toBe('AWAITING_REPAIR');
  });
  it('still rejects a Before photo with no position at all, and stores nothing', () => {
    const job = createJob(w);
    const r = w.b.call('submitCapture', capturePayload(job.id, 'BEFORE', { latitude: null, longitude: null }), w.inspector);
    expect(r.error?.code).toBe('CAPTURE_REJECTED');
    expect(r.error?.details.reasons.map((x: { code: string }) => x.code)).toContain('COORDINATES_MISSING');
    expect(w.b.sheet('repair_photos').rows()).toHaveLength(0);
    expect(w.b.drive.activeFiles()).toHaveLength(0);
  });
  it('rejects a missing heading (never treated as 0)', () => {
    const job = createJob(w);
    expect(w.b.call('submitCapture', capturePayload(job.id, 'BEFORE', { heading_deg: null }), w.inspector).error?.code).toBe('CAPTURE_REJECTED');
  });
  it('prevents duplicate Before evidence for the same job', () => {
    const job = createJob(w);
    expect(w.b.call('submitCapture', capturePayload(job.id, 'BEFORE'), w.inspector).ok).toBe(true);
    expect(w.b.call('submitCapture', capturePayload(job.id, 'BEFORE'), w.inspector).error?.code).toBe('DUPLICATE_BEFORE');
    expect(w.b.sheet('repair_photos').rows()).toHaveLength(1);
  });
  it('treats a repeated request (same photo_id) as an idempotent replay', () => {
    const job = createJob(w);
    const payload = capturePayload(job.id, 'BEFORE');
    const first = w.b.call('submitCapture', payload, w.inspector);
    const second = w.b.call('submitCapture', payload, w.inspector);
    expect(second.data.idempotent_replay).toBe(true);
    expect(second.data.photo.id).toBe(first.data.photo.id);
    expect(w.b.sheet('repair_photos').rows()).toHaveLength(1);
    expect(w.b.drive.activeFiles()).toHaveLength(1);
  });
  it('rejects a hash mismatch and a MIME type that does not match the bytes', () => {
    const job = createJob(w);
    const p = capturePayload(job.id, 'BEFORE');
    expect(w.b.call('submitCapture', { ...p, client_sha256: 'f'.repeat(64) }, w.inspector).error?.code).toBe('HASH_MISMATCH');
    expect(w.b.call('submitCapture', { ...capturePayload(job.id, 'BEFORE'), mime_type: 'image/png' }, w.inspector).error?.code).toBe('INVALID_IMAGE');
    const notImage = Buffer.from('hello world, definitely not an image');
    expect(w.b.call('submitCapture', capturePayload(job.id, 'BEFORE', {}, notImage), w.inspector).error?.code).toBe('INVALID_IMAGE');
    expect(w.b.drive.activeFiles()).toHaveLength(0);
  });
  it('rejects non-camera capture methods, stale submissions and future timestamps', () => {
    const job = createJob(w);
    expect(w.b.call('submitCapture', { ...capturePayload(job.id, 'BEFORE'), capture_method: 'gallery_upload' }, w.inspector).error?.code).toBe('VALIDATION_ERROR');
    const old = Date.now() - 20 * 60_000;
    const stale = capturePayload(job.id, 'BEFORE', { captured_at: new Date(old).toISOString(), location_fix_at: new Date(old).toISOString(), heading_measured_at: new Date(old).toISOString() });
    expect(w.b.call('submitCapture', stale, w.inspector).error?.code).toBe('CAPTURE_TOO_OLD');
    const fut = Date.now() + 10 * 60_000;
    const future = capturePayload(job.id, 'BEFORE', { captured_at: new Date(fut).toISOString(), location_fix_at: new Date(fut).toISOString(), heading_measured_at: new Date(fut).toISOString() });
    expect(w.b.call('submitCapture', future, w.inspector).error?.code).toBe('CLOCK_SKEW');
  });
  it('only lets the assigned inspector capture', () => {
    const job = createJob(w);
    expect(w.b.call('submitCapture', capturePayload(job.id, 'BEFORE'), w.inspector2).error?.code).toBe('NOT_FOUND');
    expect(w.b.call('submitCapture', capturePayload(job.id, 'BEFORE'), w.reviewer).error?.code).toBe('FORBIDDEN');
  });
});

describe('After capture and verification', () => {
  let w: World;
  beforeEach(() => { w = setupWorld(); });

  it('cannot capture After before a valid Before exists', () => {
    const job = createJob(w);
    expect(w.b.call('submitCapture', afterPayload(job.id), w.inspector).error?.code).toBe('BEFORE_REQUIRED');
  });
  it('cannot capture After until the repair is marked done', () => {
    const job = createJob(w);
    w.b.call('submitCapture', capturePayload(job.id, 'BEFORE'), w.inspector);
    expect(w.b.call('submitCapture', afterPayload(job.id), w.inspector).error?.code).toBe('INVALID_STATE');
  });
  it('PASS moves the job to PENDING_REVIEW and records thresholds and rules version', () => {
    const { job } = jobReadyForAfter(w);
    const r = w.b.call('submitCapture', afterPayload(job.id), w.inspector);
    expect(r.ok).toBe(true);
    expect(r.data.verification).toMatchObject({ overall_status: 'PASS', gps_accuracy_pass: true, distance_pass: true, heading_pass: true, rules_version: 'rr-verify-v4' });
    expect(r.data.verification.measured_distance_m).toBeCloseTo(0.6, 3);
    expect(r.data.verification.heading_difference_degrees).toBe(3);
    expect(r.data.verification.thresholds.max_distance_m).toBe(5);
    expect(r.data.verification.thresholds.max_gps_accuracy_m).toBeNull();
    expect(r.data.verification.thresholds.max_before_gps_accuracy_m).toBeNull();
    expect(r.data.job.status).toBe('PENDING_REVIEW');
  });
  it('FAIL keeps the evidence, moves to NEEDS_RECAPTURE and can never be approved', () => {
    const { job } = jobReadyForAfter(w);
    const r = w.b.call('submitCapture', afterPayload(job.id, northOf(ORIGIN, 8)), w.inspector);
    expect(r.data.verification.overall_status).toBe('FAIL');
    expect(r.data.verification.failure_reasons.map((x: { code: string }) => x.code)).toContain('DISTANCE_EXCEEDED');
    expect(r.data.job.status).toBe('NEEDS_RECAPTURE');
    expect(w.b.call('reviewJob', { id: job.id, decision: 'APPROVE', reason: 'looks fine' }, w.reviewer).error?.code).toBe('INVALID_STATE');
  });
  it('After GPS accuracy is recorded but is not a criterion (rules v3)', () => {
    const { job } = jobReadyForAfter(w);
    const r = w.b.call('submitCapture', afterPayload(job.id, { accuracy_m: 8 }), w.inspector);
    expect(r.data.verification.overall_status).toBe('PASS');
    expect(r.data.verification.after_accuracy_m).toBe(8);
  });
  it('a Before photo with poor accuracy still PASSes when the After matches', () => {
    const job = createJob(w);
    w.b.call('submitCapture', capturePayload(job.id, 'BEFORE', { accuracy_m: 7 }), w.inspector);
    w.b.call('markRepairDone', { id: job.id }, w.inspector);
    const r = w.b.call('submitCapture', afterPayload(job.id), w.inspector);
    expect(r.data.verification.overall_status).toBe('PASS');
  });
  it('distance limit is 5 m: 4.9 m passes, 5.3 m fails', () => {
    const { job } = jobReadyForAfter(w);
    const far = w.b.call('submitCapture', afterPayload(job.id, northOf(ORIGIN, 5.3)), w.inspector);
    expect(far.data.verification.overall_status).toBe('FAIL');
    expect(far.data.verification.failure_reasons.map((x: { code: string }) => x.code)).toContain('DISTANCE_EXCEEDED');
    const near = w.b.call('submitCapture', afterPayload(job.id, northOf(ORIGIN, 4.9)), w.inspector);
    expect(near.data.verification.overall_status).toBe('PASS');
  });
  it('heading limit is ±10°: 10° passes, 11° fails (either side)', () => {
    const { job } = jobReadyForAfter(w); // Before heading 125°
    expect(w.b.call('submitCapture', afterPayload(job.id, { heading_deg: 114 }), w.inspector).data.verification.overall_status).toBe('FAIL');
    expect(w.b.call('submitCapture', afterPayload(job.id, { heading_deg: 135 }), w.inspector).data.verification.overall_status).toBe('PASS');
  });
  it('missing After heading gives INSUFFICIENT_DATA (not PASS)', () => {
    const { job } = jobReadyForAfter(w);
    const r = w.b.call('submitCapture', afterPayload(job.id, { heading_deg: null }), w.inspector);
    expect(r.data.verification.overall_status).toBe('INSUFFICIENT_DATA');
    expect(r.data.verification.heading_pass).toBeNull();
    expect(r.data.job.status).toBe('NEEDS_RECAPTURE');
  });
  it('recapture keeps history: old attempt SUPERSEDED, both verifications retained', () => {
    const { job } = jobReadyForAfter(w);
    const first = w.b.call('submitCapture', afterPayload(job.id, { heading_deg: 140 }), w.inspector);
    expect(first.data.verification.overall_status).toBe('FAIL');
    const second = w.b.call('submitCapture', afterPayload(job.id), w.inspector);
    expect(second.data.verification.overall_status).toBe('PASS');
    expect(second.data.photo.attempt_number).toBe(2);
    const detail = w.b.call('getJob', { id: job.id }, w.inspector).data;
    expect(detail.verifications).toHaveLength(2);
    const afters = detail.photos.filter((p: { capture_type: string }) => p.capture_type === 'AFTER');
    expect(afters.map((p: { status: string }) => p.status).sort()).toEqual(['ACTIVE', 'SUPERSEDED']);
    expect(detail.job.current_after_photo_id).toBe(second.data.photo.id);
  });
  it('repeated After requests never create duplicate verification records', () => {
    const { job } = jobReadyForAfter(w);
    const payload = afterPayload(job.id);
    const a = w.b.call('submitCapture', payload, w.inspector);
    const b = w.b.call('submitCapture', payload, w.inspector);
    const c = w.b.call('submitCapture', payload, w.inspector);
    expect(b.data.verification.id).toBe(a.data.verification.id);
    expect(c.data.idempotent_replay).toBe(true);
    expect(w.b.sheet('verification_results').rows()).toHaveLength(1);
  });
  it('reusing a photo_id for different bytes is a conflict', () => {
    const { job } = jobReadyForAfter(w);
    const payload = afterPayload(job.id);
    w.b.call('submitCapture', payload, w.inspector);
    const img = fakeJpeg();
    const tampered = { ...payload, image_base64: img.toString('base64'), client_sha256: createHash('sha256').update(img).digest('hex') };
    expect(w.b.call('submitCapture', tampered, w.inspector).error?.code).toBe('CONFLICT');
  });
});

describe('review', () => {
  let w: World;
  let jobId: string;
  beforeEach(() => {
    w = setupWorld();
    const { job } = jobReadyForAfter(w);
    jobId = job.id;
    w.b.call('submitCapture', afterPayload(job.id), w.inspector);
  });

  it('only reviewers/admins review, and a reason is required', () => {
    expect(w.b.call('reviewJob', { id: jobId, decision: 'APPROVE', reason: 'ok ok' }, w.inspector).error?.code).toBe('FORBIDDEN');
    expect(w.b.call('reviewJob', { id: jobId, decision: 'APPROVE' }, w.reviewer).error?.code).toBe('VALIDATION_ERROR');
  });
  it('approves a PASS job and closes it', () => {
    const r = w.b.call('reviewJob', { id: jobId, decision: 'APPROVE', reason: 'ผิวถนนเรียบร้อย' }, w.reviewer);
    expect(r.data.job.status).toBe('APPROVED');
    expect(r.data.job.completed_at).toBeTruthy();
    expect(w.b.call('submitCapture', afterPayload(jobId), w.inspector).error?.code).toBe('INVALID_STATE');
  });
  it('rejected evidence can be recaptured without erasing history', () => {
    w.b.call('reviewJob', { id: jobId, decision: 'REJECT', reason: 'Patch edge is cracked' }, w.reviewer);
    const again = w.b.call('submitCapture', afterPayload(jobId), w.inspector);
    expect(again.data.job.status).toBe('PENDING_REVIEW');
    const detail = w.b.call('getJob', { id: jobId }, w.reviewer).data;
    expect(detail.reviews).toHaveLength(1);
    expect(detail.verifications).toHaveLength(2);
  });
  it('blocks self-approval unless the admin enables it', () => {
    // Admin creates & captures their own job, then tries to approve it.
    const job = createJob(w, w.admin);
    w.b.call('submitCapture', capturePayload(job.id, 'BEFORE'), w.admin);
    w.b.call('markRepairDone', { id: job.id }, w.admin);
    w.b.call('submitCapture', afterPayload(job.id), w.admin);
    expect(w.b.call('reviewJob', { id: job.id, decision: 'APPROVE', reason: 'mine' }, w.admin).error?.code).toBe('SELF_APPROVAL_FORBIDDEN');
    w.b.call('updateSetting', { key: 'allow_self_approval', value: 'true' }, w.admin);
    expect(w.b.call('reviewJob', { id: job.id, decision: 'APPROVE', reason: 'policy allows' }, w.admin).ok).toBe(true);
  });
  it('refuses approval when the verification is not PASS (even if the sheet was edited)', () => {
    const rows = w.b.sheet('verification_results');
    rows.editCell(0, 'overall_status', 'FAIL');
    expect(w.b.call('reviewJob', { id: jobId, decision: 'APPROVE', reason: 'ok ok' }, w.reviewer).error?.code).toBe('VERIFICATION_NOT_PASSED');
  });
  it('blocks approval when evidence rows were edited directly in the spreadsheet', () => {
    w.b.sheet('repair_photos').editCell(1, 'latitude', '13.7');
    expect(w.b.call('reviewJob', { id: jobId, decision: 'APPROVE', reason: 'ok ok' }, w.reviewer).error?.code).toBe('EVIDENCE_TAMPERED');
  });
});

describe('evidence access, corrections and audit', () => {
  let w: World;
  beforeEach(() => { w = setupWorld(); });

  it('serves photos only to users who can view the job', () => {
    const job = createJob(w);
    const before = w.b.call('submitCapture', capturePayload(job.id, 'BEFORE'), w.inspector).data.photo;
    const own = w.b.call('getPhoto', { photo_id: before.id }, w.inspector);
    expect(own.data.integrity_ok).toBe(true);
    expect(w.b.call('getPhoto', { photo_id: before.id }, w.inspector2).error?.code).toBe('NOT_FOUND');
    expect(w.b.call('getPhoto', { photo_id: before.id }, w.reviewer).ok).toBe(true);
  });
  it('has no endpoint that edits or deletes evidence; invalidation keeps the record', () => {
    const job = createJob(w);
    const before = w.b.call('submitCapture', capturePayload(job.id, 'BEFORE'), w.inspector).data.photo;
    expect(w.b.call('invalidateEvidence', { photo_id: before.id, reason: 'wrong road' }, w.inspector).error?.code).toBe('FORBIDDEN');
    const r = w.b.call('invalidateEvidence', { photo_id: before.id, reason: 'Captured on the wrong road' }, w.admin);
    expect(r.data.job.status).toBe('DRAFT');
    const detail = w.b.call('getJob', { id: job.id }, w.admin).data;
    expect(detail.photos[0].status).toBe('INVALIDATED');
    expect(detail.corrections).toHaveLength(1);
    expect(w.b.drive.activeFiles()).toHaveLength(1);
    // A new Before can now be captured.
    expect(w.b.call('submitCapture', capturePayload(job.id, 'BEFORE'), w.inspector).ok).toBe(true);
  });
  it('keeps a hash-chained audit log that detects manual edits', () => {
    const job = createJob(w);
    w.b.call('submitCapture', capturePayload(job.id, 'BEFORE'), w.inspector);
    expect(w.b.call('verifyAuditChain', {}, w.admin).data.intact).toBe(true);
    w.b.sheet('audit_logs').editCell(2, 'details', '{"edited":true}');
    expect(w.b.call('verifyAuditChain', {}, w.admin).data.intact).toBe(false);
    expect(w.b.call('verifyAuditChain', {}, w.inspector).error?.code).toBe('FORBIDDEN');
  });
  it('detects a replaced Drive file in the integrity check', () => {
    const job = createJob(w);
    w.b.call('submitCapture', capturePayload(job.id, 'BEFORE'), w.inspector);
    const file = w.b.drive.activeFiles()[0];
    file.blob = new (file.blob.constructor as any)([1, 2, 3], 'image/jpeg');
    const r = w.b.call('checkEvidenceIntegrity', { id: job.id }, w.admin);
    expect(r.data.photos[0].file_hash_ok).toBe(false);
  });
  it('does not allow editing thresholds at runtime', () => {
    expect(w.b.call('updateSetting', { key: 'max_distance_m', value: '10' }, w.admin).error?.code).toBe('VALIDATION_ERROR');
    expect(w.b.call('getSettings', {}, w.inspector).data.rules.maxDistanceM).toBe(5);
  });
  it('returns a generic error for unknown actions and malformed bodies', () => {
    expect(w.b.call('dropTables', {}, w.admin).error?.code).toBe('UNKNOWN_ACTION');
    const res = JSON.parse(w.b.ctx.doPost({ postData: { contents: 'not json' } }).getContent());
    expect(res.error.code).toBe('BAD_REQUEST');
  });
});

describe('reports', () => {
  it('returns current evidence, verification and review for visible jobs only', () => {
    const w = setupWorld();
    const { job } = jobReadyForAfter(w);
    w.b.call('submitCapture', afterPayload(job.id), w.inspector);
    w.b.call('reviewJob', { id: job.id, decision: 'APPROVE', reason: 'เรียบร้อยดี' }, w.reviewer);
    createJob(w, w.inspector2);
    const r = w.b.call('reportData', {}, w.inspector).data;
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({ job: { status: 'APPROVED' }, verification: { overall_status: 'PASS' }, review: { decision: 'APPROVED' } });
    expect(r.rows[0].before.sha256_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(w.b.call('reportData', {}, w.admin).data.rows).toHaveLength(2);
    expect(w.b.call('reportData', { job_id: job.id }, w.admin).data.rows).toHaveLength(1);
  });
});

describe('deleting a repair job (soft delete with reason)', () => {
  let w: World;
  beforeEach(() => { w = setupWorld(); });

  it('the inspector can delete their job with a reason; it is logged and hidden but evidence is kept', () => {
    const job = createJob(w);
    w.b.call('submitCapture', capturePayload(job.id, 'BEFORE'), w.inspector);
    expect(w.b.call('deleteJob', { id: job.id }, w.inspector).error?.code).toBe('VALIDATION_ERROR');
    expect(w.b.call('deleteJob', { id: job.id, reason: 'ab' }, w.inspector).error?.code).toBe('VALIDATION_ERROR');
    const r = w.b.call('deleteJob', { id: job.id, reason: 'สร้างซ้ำกับงาน RR-2026-000009' }, w.inspector);
    expect(r.data.job).toMatchObject({ status: 'DELETED', delete_reason: 'สร้างซ้ำกับงาน RR-2026-000009' });
    expect(r.data.job.deleted_at).toBeTruthy();
    expect(w.b.call('listJobs', {}, w.inspector).data.jobs).toHaveLength(0);
    expect(w.b.call('stats', {}, w.inspector).data.counts).toMatchObject({ total: 0, DELETED: 1 });
    expect(w.b.call('listJobs', { status: 'DELETED' }, w.inspector).data.jobs).toHaveLength(1);
    const detail = w.b.call('getJob', { id: job.id }, w.admin).data;
    const log = detail.audit.find((a: { action: string }) => a.action === 'job.deleted');
    expect(log.details).toMatchObject({ reason: 'สร้างซ้ำกับงาน RR-2026-000009', previous_status: 'AWAITING_REPAIR' });
    expect(log.actor_name).toBe('inspector');
    expect(detail.photos).toHaveLength(1);
    expect(w.b.drive.activeFiles()).toHaveLength(1);
    expect(w.b.call('verifyAuditChain', {}, w.admin).data.intact).toBe(true);
  });
  it('a deleted job accepts no further work', () => {
    const job = createJob(w);
    w.b.call('deleteJob', { id: job.id, reason: 'ผิดพลาดตอนสร้าง' }, w.inspector);
    expect(w.b.call('submitCapture', capturePayload(job.id, 'BEFORE'), w.inspector).error?.code).toBe('FORBIDDEN');
    expect(w.b.call('deleteJob', { id: job.id, reason: 'ลบซ้ำอีกรอบ' }, w.inspector).error?.code).toBe('INVALID_STATE');
    expect(w.b.call('cancelJob', { id: job.id, reason: 'ยกเลิกหลังลบ' }, w.admin).error?.code).toBe('INVALID_TRANSITION');
  });
  it('other inspectors and reviewers cannot delete; inspectors cannot delete approved jobs; admins can', () => {
    const { job } = jobReadyForAfter(w);
    expect(w.b.call('deleteJob', { id: job.id, reason: 'ไม่ใช่งานของฉัน' }, w.inspector2).error?.code).toBe('NOT_FOUND');
    expect(w.b.call('deleteJob', { id: job.id, reason: 'ผู้ตรวจรับลบ' }, w.reviewer).error?.code).toBe('FORBIDDEN');
    w.b.call('submitCapture', afterPayload(job.id), w.inspector);
    w.b.call('reviewJob', { id: job.id, decision: 'APPROVE', reason: 'เรียบร้อยดี' }, w.reviewer);
    expect(w.b.call('deleteJob', { id: job.id, reason: 'อยากลบงานที่อนุมัติ' }, w.inspector).error?.code).toBe('FORBIDDEN');
    expect(w.b.call('deleteJob', { id: job.id, reason: 'ผู้ดูแลลบตามคำสั่ง' }, w.admin).data.job.status).toBe('DELETED');
  });
  it('getJob reports can_delete correctly', () => {
    const job = createJob(w);
    expect(w.b.call('getJob', { id: job.id }, w.inspector).data.permissions.can_delete).toBe(true);
    expect(w.b.call('getJob', { id: job.id }, w.reviewer).data.permissions.can_delete).toBe(false);
  });
});

describe('split files (pasted one by one in the Apps Script editor)', () => {
  const orders: Record<string, (n: string[]) => string[]> = {
    sorted: (n) => n,
    reversed: (n) => [...n].reverse(),
    'verification last': (n) => [...n.filter((x) => !x.includes('verification')), ...n.filter((x) => x.includes('verification'))],
  };
  for (const [label, fileOrder] of Object.entries(orders)) {
    it(`loads and works in ${label} order, and checkInstall passes`, () => {
      const b = createBackend({ fileOrder });
      expect(b.ctx.checkInstall()).toMatch(/^OK: all \d+ parts loaded/);
      b.ctx.setup();
      const temp = b.ctx.createInitialAdmin('admin@example.com', 'Admin').temporary_password;
      const login = b.call('login', { email: 'admin@example.com', password: temp });
      expect(login.ok).toBe(true);
      expect(b.call('stats', {}, login.data.token).error?.code).toBe('PASSWORD_CHANGE_REQUIRED');
    });
  }
  it('checkInstall reports a missing / cut-off file', () => {
    const b = createBackend({ fileOrder: (n) => n.filter((x) => !x.startsWith('08_')) });
    expect(b.ctx.checkInstall()).toMatch(/MISSING.*actionReviewJob/);
  });
});
