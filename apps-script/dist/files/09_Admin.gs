/* Road Repair Tracker - 09_Admin.js (GENERATED; paste as its own file in the Apps Script editor) */
/* ------------------------------------------------------------- users */

function actionListUsers(p, ctx) {
  requireRole(ctx.user, ['admin']);
  return { users: Db.all('users').map(publicUser) };
}

/** Inspectors list for assignment dropdowns (admin only). */
function actionListInspectors(p, ctx) {
  requireRole(ctx.user, ['admin']);
  return {
    inspectors: Db.filter('users', function (u) { return u.role === 'inspector' && u.active === 'TRUE'; })
      .map(function (u) { return { id: u.id, full_name: u.full_name, email: u.email }; })
  };
}

function insertUser(email, fullName, role, actorId) {
  if (userByEmail(email)) fail('CONFLICT', 'A user with this email already exists.');
  var temp = generateTempPassword();
  var h = hashPassword(temp);
  var now = nowIso();
  var user = {
    id: newId(), email: email, full_name: fullName, role: role, active: 'TRUE', password_hash: h.hash,
    password_salt: h.salt, password_iterations: h.iterations, must_change_password: 'TRUE', failed_logins: 0,
    locked_until: '', password_changed_at: '', created_at: now, updated_at: now
  };
  Db.insert('users', [user]);
  writeAudit({ actor_id: actorId || '', action: 'user.created', entity_type: 'user', entity_id: user.id, details: { email: email, role: role } });
  return { user: user, tempPassword: temp };
}

function actionCreateUser(p, ctx) {
  requireRole(ctx.user, ['admin']);
  var email = normalizeEmail(p.email);
  var fullName = reqString(p, 'full_name', { max: 120 });
  var role = reqString(p, 'role', { oneOf: ROLES });
  return withLock(function () {
    var r = insertUser(email, fullName, role, ctx.user.id);
    // The temporary password is shown once to the admin and must be changed at first sign-in.
    return { user: publicUser(r.user), temporary_password: r.tempPassword };
  });
}

function actionUpdateUser(p, ctx) {
  requireRole(ctx.user, ['admin']);
  return withLock(function () {
    var user = isUuid(p.id) ? userById(p.id) : null;
    if (!user) fail('NOT_FOUND', 'User not found.');
    var patch = {};
    if (p.full_name !== undefined) patch.full_name = reqString(p, 'full_name', { max: 120 });
    if (p.role !== undefined) patch.role = reqString(p, 'role', { oneOf: ROLES });
    if (p.active !== undefined) {
      if (typeof p.active !== 'boolean') fail('VALIDATION_ERROR', 'active must be boolean');
      patch.active = p.active ? 'TRUE' : 'FALSE';
    }
    if (user.id === ctx.user.id && ((patch.role && patch.role !== 'admin') || patch.active === 'FALSE')) {
      fail('FORBIDDEN', 'You cannot remove your own administrator access.');
    }
    var before = { full_name: user.full_name, role: user.role, active: user.active };
    patch.updated_at = nowIso();
    Db.update('users', user, patch, ['full_name', 'role', 'active', 'updated_at']);
    if ((patch.role && patch.role !== before.role) || patch.active === 'FALSE') revokeOtherSessions(user.id, null);
    writeAudit({ actor_id: ctx.user.id, action: 'user.updated', entity_type: 'user', entity_id: user.id, details: { before: before, after: { full_name: user.full_name, role: user.role, active: user.active } } });
    return { user: publicUser(user) };
  });
}

function actionResetUserPassword(p, ctx) {
  requireRole(ctx.user, ['admin']);
  return withLock(function () {
    var user = isUuid(p.id) ? userById(p.id) : null;
    if (!user) fail('NOT_FOUND', 'User not found.');
    var temp = generateTempPassword();
    var h = hashPassword(temp);
    Db.update('users', user, {
      password_hash: h.hash, password_salt: h.salt, password_iterations: h.iterations, must_change_password: 'TRUE',
      failed_logins: 0, locked_until: '', updated_at: nowIso()
    }, ['password_hash', 'password_salt', 'password_iterations', 'must_change_password', 'failed_logins', 'locked_until', 'updated_at']);
    revokeOtherSessions(user.id, null);
    writeAudit({ actor_id: ctx.user.id, action: 'user.password_reset_by_admin', entity_type: 'user', entity_id: user.id, details: {} });
    return { temporary_password: temp };
  });
}

/* ---------------------------------------------------------- settings */

var EDITABLE_SETTINGS = {
  allow_self_approval: function (v) { if (v !== 'true' && v !== 'false') fail('VALIDATION_ERROR', 'allow_self_approval must be true or false'); return v; },
  session_ttl_hours: function (v) { var n = Number(v); if (!(n >= 1 && n <= 72) || Math.floor(n) !== n) fail('VALIDATION_ERROR', 'session_ttl_hours must be 1-72'); return String(n); }
};

function actionGetSettings(p, ctx) {
  var settings = {};
  Object.keys(SETTINGS_DEFAULTS).forEach(function (k) { settings[k] = getSetting(k); });
  return {
    settings: settings,
    // Verification thresholds are fixed per rules version and are not editable at runtime.
    rules: RRVerify.CURRENT_RULES,
    submission_limits: RRVerify.SUBMISSION_LIMITS,
    app_version: APP_VERSION,
    schema_version: SCHEMA_VERSION
  };
}

function actionUpdateSetting(p, ctx) {
  requireRole(ctx.user, ['admin']);
  var key = reqString(p, 'key', { oneOf: Object.keys(EDITABLE_SETTINGS) });
  var value = EDITABLE_SETTINGS[key](String(p.value));
  return withLock(function () {
    var row = Db.find('settings', function (r) { return r.key === key; });
    var old = row ? row.value : SETTINGS_DEFAULTS[key];
    if (row) Db.update('settings', row, { value: value, updated_at: nowIso(), updated_by: ctx.user.id }, ['value', 'updated_at', 'updated_by']);
    else Db.insert('settings', [{ key: key, value: value, updated_at: nowIso(), updated_by: ctx.user.id }]);
    writeAudit({ actor_id: ctx.user.id, action: 'settings.updated', entity_type: 'setting', details: { key: key, from: old, to: value } });
    return { key: key, value: value };
  });
}

/* ------------------------------------------------------------- purge */

/** Confirmation phrase the admin must type to erase every repair record. */
var PURGE_CONFIRM_PHRASES = ['ลบทั้งหมด', 'DELETE ALL'];
var PURGE_TABLES = ['repair_jobs', 'repair_photos', 'verification_results', 'repair_reviews'];

/**
 * Admin only: erase every repair job, photo record, verification and review,
 * and move the evidence files to the Drive trash (recoverable there for 30
 * days). Users, settings and the audit log are kept; the purge itself is
 * written to the audit log. Job codes keep counting up so old codes are never
 * reused.
 */
function actionPurgeRepairData(p, ctx) {
  requireRole(ctx.user, ['admin']);
  var confirm = reqString(p, 'confirm', { max: 50 });
  if (PURGE_CONFIRM_PHRASES.indexOf(confirm.trim()) < 0) fail('VALIDATION_ERROR', 'Type the confirmation phrase exactly.');
  var reason = reqString(p, 'reason', { min: 5, max: LIMITS.maxTextLength });
  return withLock(function () {
    var trashed = 0;
    var trashFailed = 0;
    Db.all('repair_photos').forEach(function (ph) {
      if (!ph.drive_file_id) return;
      try { DriveApp.getFileById(ph.drive_file_id).setTrashed(true); trashed++; } catch (e) { trashFailed++; }
    });
    var counts = {};
    PURGE_TABLES.forEach(function (t) { counts[t] = Db.clearAll(t); });
    writeAudit({
      actor_id: ctx.user.id, action: 'data.purged', entity_type: 'system',
      details: { reason: reason, rows: counts, files_trashed: trashed, files_not_trashed: trashFailed }
    });
    return { rows: counts, files_trashed: trashed, files_not_trashed: trashFailed };
  });
}

/* ------------------------------------------------------------- audit */

function actionListAudit(p, ctx) {
  requireRole(ctx.user, ['admin']);
  var names = userNameMap();
  var rows = Db.all('audit_logs').slice();
  if (p.repair_job_id) rows = rows.filter(function (r) { return r.repair_job_id === p.repair_job_id; });
  if (p.action_prefix) rows = rows.filter(function (r) { return r.action.indexOf(String(p.action_prefix)) === 0; });
  rows.reverse();
  var limit = Math.min(Number(p.limit) || 200, 1000);
  return {
    total: rows.length,
    entries: rows.slice(0, limit).map(function (r) {
      var a = publicAudit(r);
      a.actor_name = a.actor_id && names[a.actor_id] ? names[a.actor_id].full_name : null;
      return a;
    })
  };
}

function actionVerifyAuditChain(p, ctx) {
  requireRole(ctx.user, ['admin']);
  var rows = Db.all('audit_logs');
  var prev = 'GENESIS';
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (r.prev_hash !== prev || auditRowHash(r) !== r.row_hash) {
      return { intact: false, checked: i, first_broken_row: r._row, entry_id: r.id };
    }
    prev = r.row_hash;
  }
  return { intact: true, checked: rows.length };
}

/* ---------------------------------------------------------- evidence */

/**
 * Explicit correction process: evidence is never edited or deleted. An admin
 * may INVALIDATE a photo with a reason; the record and the file are kept,
 * the correction is logged, and the job moves to the state that requires new
 * evidence.
 */
function actionInvalidateEvidence(p, ctx) {
  requireRole(ctx.user, ['admin']);
  var reason = reqString(p, 'reason', { min: 5, max: LIMITS.maxTextLength });
  return withLock(function () {
    var photo = isUuid(p.photo_id) ? Db.byId('repair_photos', p.photo_id) : null;
    if (!photo) fail('NOT_FOUND', 'Photo not found.');
    if (photo.status !== 'ACTIVE') fail('INVALID_STATE', 'Only active evidence can be invalidated.');
    var job = Db.byId('repair_jobs', photo.repair_job_id);
    if (isTerminal(job.status)) fail('INVALID_STATE', 'Evidence of a closed job cannot be invalidated.');

    Db.update('repair_photos', photo, { status: 'INVALIDATED', status_reason: reason }, ['status', 'status_reason']);
    Db.insert('evidence_corrections', [{
      id: newId(), repair_photo_id: photo.id, repair_job_id: job.id, action: 'INVALIDATE', reason: reason,
      details: JSON.stringify({ capture_type: photo.capture_type, previous_status: 'ACTIVE' }), actor_id: ctx.user.id, created_at: nowIso()
    }]);
    writeAudit({ actor_id: ctx.user.id, repair_job_id: job.id, action: 'photo.invalidated', entity_type: 'repair_photo', entity_id: photo.id, details: { reason: reason } });

    if (photo.capture_type === 'BEFORE') {
      Db.filter('repair_photos', function (r) { return r.repair_job_id === job.id && r.capture_type === 'AFTER' && r.status === 'ACTIVE'; })
        .forEach(function (a) {
          Db.update('repair_photos', a, { status: 'SUPERSEDED', status_reason: 'Before evidence invalidated' }, ['status', 'status_reason']);
        });
      transitionJob(job, JOB_STATUS.DRAFT, ctx.user.id, reason, { current_before_photo_id: '', current_after_photo_id: '', current_verification_id: '' });
    } else if (job.current_after_photo_id === photo.id) {
      transitionJob(job, JOB_STATUS.NEEDS_RECAPTURE, ctx.user.id, reason, { current_after_photo_id: '', current_verification_id: '' });
    }
    return { job: publicJob(job, userNameMap()) };
  });
}

function actionCheckEvidenceIntegrity(p, ctx) {
  requireRole(ctx.user, ['admin']);
  var job = loadJobForUser(ctx.user, p.id);
  var results = Db.filter('repair_photos', function (r) { return r.repair_job_id === job.id; }).map(function (ph) {
    var fileOk = null;
    try {
      fileOk = sha256HexBytes(DriveApp.getFileById(ph.drive_file_id).getBlob().getBytes()) === ph.sha256_hash;
    } catch (e) {
      fileOk = false;
    }
    return { photo_id: ph.id, capture_type: ph.capture_type, status: ph.status, file_hash_ok: fileOk, record_ok: ph.record_hash === recordHash('repair_photos', ph) };
  });
  var verifications = Db.filter('verification_results', function (r) { return r.repair_job_id === job.id; }).map(function (v) {
    return { verification_id: v.id, record_ok: v.record_hash === recordHash('verification_results', v) };
  });
  writeAuditLocked({ actor_id: ctx.user.id, repair_job_id: job.id, action: 'evidence.integrity_checked', entity_type: 'repair_job', entity_id: job.id,
    details: { all_ok: results.every(function (r) { return r.file_hash_ok && r.record_ok; }) && verifications.every(function (v) { return v.record_ok; }) } });
  return { photos: results, verifications: verifications };
}

function writeAuditLocked(entry) {
  return withLock(function () { return writeAudit(entry); });
}
