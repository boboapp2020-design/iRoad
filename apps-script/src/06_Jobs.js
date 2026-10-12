/* ---------------------------------------------------------- permissions */

function canViewJob(user, job) {
  if (!job) return false;
  if (user.role === 'admin' || user.role === 'reviewer') return true;
  return user.role === 'inspector' && (job.assigned_to === user.id || job.created_by === user.id);
}

/** Capture / mark-repaired / edit: the assigned inspector, or an admin. */
function canWorkOnJob(user, job) {
  if (!job || job.status === JOB_STATUS.DELETED) return false;
  if (user.role === 'admin') return true;
  return user.role === 'inspector' && job.assigned_to === user.id;
}

function loadJobForUser(user, jobId) {
  if (!isUuid(jobId)) fail('VALIDATION_ERROR', 'Invalid job id');
  var job = Db.byId('repair_jobs', jobId);
  // Same error for "missing" and "not allowed" so job ids cannot be probed.
  if (!job || !canViewJob(user, job)) fail('NOT_FOUND', 'Repair job not found.');
  return job;
}

function isTerminal(status) {
  return status === JOB_STATUS.APPROVED || status === JOB_STATUS.CANCELLED || status === JOB_STATUS.DELETED;
}

/** Inspectors may delete their own (assigned or created) jobs unless approved; admins any job. */
function canDeleteJob(user, job) {
  if (!job || job.status === JOB_STATUS.DELETED) return false;
  if (user.role === 'admin') return true;
  return user.role === 'inspector' && (job.assigned_to === user.id || job.created_by === user.id) &&
    job.status !== JOB_STATUS.APPROVED;
}

/** The only place a job status changes. Enforces JOB_TRANSITIONS. */
function transitionJob(job, to, actorId, reason, extraPatch) {
  var from = job.status;
  var allowed = JOB_TRANSITIONS[from] || [];
  if (allowed.indexOf(to) < 0) fail('INVALID_TRANSITION', 'Cannot change status from ' + from + ' to ' + to + '.', { from: from, to: to });
  var patch = extraPatch || {};
  patch.status = to;
  patch.updated_at = nowIso();
  Db.update('repair_jobs', job, patch, Object.keys(patch));
  writeAudit({
    actor_id: actorId, repair_job_id: job.id, action: 'job.status_changed', entity_type: 'repair_job', entity_id: job.id,
    details: { from: from, to: to, reason: reason || null }
  });
  return job;
}

function nextJobCode() {
  var year = new Date().getUTCFullYear();
  var key = 'job_code:' + year;
  var row = Db.find('counters', function (r) { return r.key === key; });
  var value;
  if (row) {
    value = (Number(row.value) || 0) + 1;
    Db.update('counters', row, { value: value }, ['value']);
  } else {
    value = 1;
    Db.insert('counters', [{ key: key, value: value }]);
  }
  var n = String(value);
  while (n.length < 6) n = '0' + n;
  var code = 'RR-' + year + '-' + n;
  if (Db.find('repair_jobs', function (r) { return r.job_code === code; })) fail('CONFLICT', 'Job code collision, please retry.');
  return code;
}

/* ---------------------------------------------------------- projections */

function userNameMap() {
  var m = {};
  Db.all('users').forEach(function (u) { m[u.id] = { id: u.id, full_name: u.full_name, email: u.email, role: u.role }; });
  return m;
}

function publicJob(j, names) {
  names = names || {};
  return {
    id: j.id, job_code: j.job_code, road_name: j.road_name, location_description: j.location_description,
    damage_type: j.damage_type, description: j.description, priority: j.priority, notes: j.notes, status: j.status,
    assigned_to: j.assigned_to || null, assigned_to_name: names[j.assigned_to] ? names[j.assigned_to].full_name : null,
    created_by: j.created_by, created_by_name: names[j.created_by] ? names[j.created_by].full_name : null,
    created_at: j.created_at, updated_at: j.updated_at, completed_at: j.completed_at || null,
    cancel_reason: j.cancel_reason || null,
    current_before_photo_id: j.current_before_photo_id || null,
    current_after_photo_id: j.current_after_photo_id || null,
    current_verification_id: j.current_verification_id || null,
    after_attempts: Number(j.after_attempts) || 0,
    planned_latitude: cellNumber(j.planned_latitude), planned_longitude: cellNumber(j.planned_longitude),
    planned_accuracy_m: cellNumber(j.planned_accuracy_m),
    deleted_at: j.deleted_at || null,
    deleted_by: j.deleted_by || null,
    deleted_by_name: names[j.deleted_by] ? names[j.deleted_by].full_name : null,
    delete_reason: j.delete_reason || null
  };
}

function publicPhoto(p, names) {
  names = names || {};
  return {
    id: p.id, repair_job_id: p.repair_job_id, capture_type: p.capture_type, attempt_number: Number(p.attempt_number) || 1,
    status: p.status, status_reason: p.status_reason || null, storage_path: p.storage_path, sha256_hash: p.sha256_hash,
    mime_type: p.mime_type, file_size_bytes: cellNumber(p.file_size_bytes), captured_at: p.captured_at,
    location_fix_at: p.location_fix_at || null, latitude: cellNumber(p.latitude), longitude: cellNumber(p.longitude),
    gps_accuracy_m: cellNumber(p.gps_accuracy_m), heading_degrees: cellNumber(p.heading_degrees),
    heading_source: p.heading_source || null, heading_measured_at: p.heading_measured_at || null,
    heading_uncertainty_deg: cellNumber(p.heading_uncertainty_deg), capture_method: p.capture_method,
    captured_by: p.captured_by, captured_by_name: names[p.captured_by] ? names[p.captured_by].full_name : null,
    device_metadata: parseJsonSafe(p.device_metadata, {}), received_at: p.received_at,
    record_intact: p.record_hash === recordHash('repair_photos', p)
  };
}

function publicVerification(v, names) {
  names = names || {};
  return {
    id: v.id, repair_job_id: v.repair_job_id, before_photo_id: v.before_photo_id, after_photo_id: v.after_photo_id,
    attempt_number: Number(v.attempt_number) || 1,
    measured_distance_m: cellNumber(v.measured_distance_m), before_accuracy_m: cellNumber(v.before_accuracy_m),
    after_accuracy_m: cellNumber(v.after_accuracy_m), heading_difference_degrees: cellNumber(v.heading_difference_degrees),
    gps_accuracy_pass: cellBool(v.gps_accuracy_pass), distance_pass: cellBool(v.distance_pass), heading_pass: cellBool(v.heading_pass),
    overall_status: v.overall_status, failure_reasons: parseJsonSafe(v.failure_reasons, []), rules_version: v.rules_version,
    thresholds: parseJsonSafe(v.thresholds, {}), verified_at: v.verified_at, verified_by: v.verified_by || null,
    record_intact: v.record_hash === recordHash('verification_results', v)
  };
}

function publicReview(r, names) {
  names = names || {};
  return {
    id: r.id, repair_job_id: r.repair_job_id, verification_id: r.verification_id, after_photo_id: r.after_photo_id,
    decision: r.decision, reason: r.reason, reviewer_id: r.reviewer_id,
    reviewer_name: names[r.reviewer_id] ? names[r.reviewer_id].full_name : null, created_at: r.created_at,
    record_intact: r.record_hash === recordHash('repair_reviews', r)
  };
}

/* ---------------------------------------------------------------- actions */

function readJobFields(p, partial) {
  var out = {};
  var spec = {
    road_name: { max: LIMITS.maxShortTextLength },
    location_description: { max: LIMITS.maxTextLength, optional: true },
    damage_type: { oneOf: DAMAGE_TYPES },
    description: { max: LIMITS.maxTextLength, optional: true },
    priority: { oneOf: PRIORITIES },
    notes: { max: LIMITS.maxTextLength, optional: true }
  };
  Object.keys(spec).forEach(function (k) {
    if (partial && !(k in p)) return;
    out[k] = reqString(p, k, spec[k]);
  });
  return out;
}

function actionCreateJob(p, ctx) {
  requireRole(ctx.user, ['admin', 'inspector']);
  var fields = readJobFields(p, false);
  var assignedTo = ctx.user.id;
  if (p.assigned_to && p.assigned_to !== ctx.user.id) {
    if (ctx.user.role !== 'admin') fail('FORBIDDEN', 'Only an administrator can assign a job to someone else.');
    assignedTo = p.assigned_to;
  }
  var lat = optNumber(p, 'planned_latitude');
  var lng = optNumber(p, 'planned_longitude');
  var acc = optNumber(p, 'planned_accuracy_m');
  if ((lat !== null && (lat < -90 || lat > 90)) || (lng !== null && (lng < -180 || lng > 180)) || (acc !== null && acc <= 0)) {
    fail('VALIDATION_ERROR', 'Invalid planned location');
  }
  return withLock(function () {
    if (ctx.user.role === 'admin' && assignedTo !== ctx.user.id) {
      var assignee = userById(assignedTo);
      if (!assignee || assignee.role !== 'inspector' || assignee.active !== 'TRUE') fail('VALIDATION_ERROR', 'Assigned user must be an active inspector.');
    }
    var now = nowIso();
    var job = {
      id: newId(), job_code: nextJobCode(), status: JOB_STATUS.DRAFT, assigned_to: assignedTo, created_by: ctx.user.id,
      created_at: now, updated_at: now, completed_at: '', cancel_reason: '', current_before_photo_id: '',
      current_after_photo_id: '', current_verification_id: '', after_attempts: 0,
      planned_latitude: lat, planned_longitude: lng, planned_accuracy_m: acc,
      deleted_at: '', deleted_by: '', delete_reason: ''
    };
    Object.keys(fields).forEach(function (k) { job[k] = fields[k]; });
    var stored = Db.insert('repair_jobs', [job])[0];
    writeAudit({ actor_id: ctx.user.id, repair_job_id: job.id, action: 'job.created', entity_type: 'repair_job', entity_id: job.id, details: { job_code: job.job_code } });
    return { job: publicJob(stored, userNameMap()) };
  });
}

function actionUpdateJob(p, ctx) {
  var fields = readJobFields(p, true);
  return withLock(function () {
    var job = loadJobForUser(ctx.user, p.id);
    if (!canWorkOnJob(ctx.user, job)) fail('FORBIDDEN', 'You cannot edit this job.');
    if (isTerminal(job.status)) fail('INVALID_STATE', 'A closed job cannot be edited.');
    var before = {};
    Object.keys(fields).forEach(function (k) { before[k] = job[k]; });
    fields.updated_at = nowIso();
    Db.update('repair_jobs', job, fields, Object.keys(fields));
    writeAudit({ actor_id: ctx.user.id, repair_job_id: job.id, action: 'job.updated', entity_type: 'repair_job', entity_id: job.id, details: { before: before } });
    return { job: publicJob(job, userNameMap()) };
  });
}

function actionMarkRepairDone(p, ctx) {
  return withLock(function () {
    var job = loadJobForUser(ctx.user, p.id);
    if (!canWorkOnJob(ctx.user, job)) fail('FORBIDDEN', 'Only the assigned inspector can update this job.');
    if (job.status !== JOB_STATUS.AWAITING_REPAIR) fail('INVALID_STATE', 'Job is not awaiting repair.');
    transitionJob(job, JOB_STATUS.AWAITING_AFTER_PHOTO, ctx.user.id, reqString(p, 'note', { optional: true, max: LIMITS.maxTextLength }) || null);
    return { job: publicJob(job, userNameMap()) };
  });
}

function actionCancelJob(p, ctx) {
  var reason = reqString(p, 'reason', { min: 3, max: LIMITS.maxTextLength });
  return withLock(function () {
    var job = loadJobForUser(ctx.user, p.id);
    var creatorEarly = ctx.user.role === 'inspector' && job.created_by === ctx.user.id &&
      (job.status === JOB_STATUS.DRAFT || job.status === JOB_STATUS.AWAITING_REPAIR);
    if (ctx.user.role !== 'admin' && !creatorEarly) fail('FORBIDDEN', 'You cannot cancel this job.');
    transitionJob(job, JOB_STATUS.CANCELLED, ctx.user.id, reason, { cancel_reason: reason });
    return { job: publicJob(job, userNameMap()) };
  });
}

function actionAssignJob(p, ctx) {
  requireRole(ctx.user, ['admin']);
  return withLock(function () {
    var job = loadJobForUser(ctx.user, p.id);
    if (isTerminal(job.status)) fail('INVALID_STATE', 'A closed job cannot be reassigned.');
    var assignee = userById(p.assigned_to);
    if (!assignee || assignee.role !== 'inspector' || assignee.active !== 'TRUE') fail('VALIDATION_ERROR', 'Assigned user must be an active inspector.');
    var from = job.assigned_to;
    Db.update('repair_jobs', job, { assigned_to: assignee.id, updated_at: nowIso() }, ['assigned_to', 'updated_at']);
    writeAudit({ actor_id: ctx.user.id, repair_job_id: job.id, action: 'job.assigned', entity_type: 'repair_job', entity_id: job.id, details: { from: from, to: assignee.id } });
    return { job: publicJob(job, userNameMap()) };
  });
}

function visibleJobs(user, includeDeleted) {
  return Db.filter('repair_jobs', function (j) {
    return canViewJob(user, j) && (includeDeleted || j.status !== JOB_STATUS.DELETED);
  });
}

/**
 * Soft delete with a mandatory reason. Nothing is removed: the job row, photos,
 * Drive files, verifications and reviews stay for audit; the job disappears from
 * lists and counts. Logged as job.deleted (and the status change).
 */
function actionDeleteJob(p, ctx) {
  var reason = reqString(p, 'reason', { min: 5, max: LIMITS.maxTextLength });
  return withLock(function () {
    var job = loadJobForUser(ctx.user, p.id);
    if (job.status === JOB_STATUS.DELETED) fail('INVALID_STATE', 'This job is already deleted.');
    if (!canDeleteJob(ctx.user, job)) fail('FORBIDDEN', 'You cannot delete this job.');
    var previous = job.status;
    var now = nowIso();
    transitionJob(job, JOB_STATUS.DELETED, ctx.user.id, reason, { deleted_at: now, deleted_by: ctx.user.id, delete_reason: reason });
    writeAudit({
      actor_id: ctx.user.id, repair_job_id: job.id, action: 'job.deleted', entity_type: 'repair_job', entity_id: job.id,
      details: { job_code: job.job_code, reason: reason, previous_status: previous }
    });
    return { job: publicJob(job, userNameMap()) };
  });
}

function actionListJobs(p, ctx) {
  var names = userNameMap();
  var status = p.status ? reqString(p, 'status', { oneOf: Object.keys(JOB_STATUS) }) : '';
  var q = p.q ? reqString(p, 'q', { max: 100 }).toLowerCase() : '';
  var from = p.date_from ? Date.parse(p.date_from) : null;
  var to = p.date_to ? Date.parse(p.date_to) : null;
  var photos = {};
  Db.all('repair_photos').forEach(function (ph) { photos[ph.id] = ph; });
  var verifications = {};
  Db.all('verification_results').forEach(function (v) { verifications[v.id] = v; });

  // Deleted jobs are only listed when explicitly filtered by status DELETED.
  var jobs = visibleJobs(ctx.user, status === JOB_STATUS.DELETED).filter(function (j) {
    if (status && j.status !== status) return false;
    if (q && [j.job_code, j.road_name, j.location_description].join(' ').toLowerCase().indexOf(q) < 0) return false;
    var created = Date.parse(j.created_at);
    if (from !== null && isFinite(from) && created < from) return false;
    if (to !== null && isFinite(to) && created > to) return false;
    return true;
  });
  jobs.sort(function (a, b) { return a.created_at < b.created_at ? 1 : -1; });
  var limit = Math.min(Number(p.limit) || 500, 1000);
  return {
    total: jobs.length,
    jobs: jobs.slice(0, limit).map(function (j) {
      var out = publicJob(j, names);
      var before = photos[j.current_before_photo_id];
      out.before = before ? { id: before.id, latitude: cellNumber(before.latitude), longitude: cellNumber(before.longitude), captured_at: before.captured_at } : null;
      var v = verifications[j.current_verification_id];
      out.verification_status = v ? v.overall_status : 'PENDING';
      return out;
    })
  };
}

function actionGetJob(p, ctx) {
  var job = loadJobForUser(ctx.user, p.id);
  var names = userNameMap();
  var byJob = function (r) { return r.repair_job_id === job.id; };
  var audit = (ctx.user.role === 'admin' || ctx.user.role === 'reviewer' || canViewJob(ctx.user, job))
    ? Db.filter('audit_logs', byJob).map(publicAudit) : [];
  return {
    job: publicJob(job, names),
    photos: Db.filter('repair_photos', byJob).map(function (x) { return publicPhoto(x, names); }),
    verifications: Db.filter('verification_results', byJob).map(function (x) { return publicVerification(x, names); }),
    reviews: Db.filter('repair_reviews', byJob).map(function (x) { return publicReview(x, names); }),
    corrections: Db.filter('evidence_corrections', byJob).map(function (c) {
      return { id: c.id, repair_photo_id: c.repair_photo_id, action: c.action, reason: c.reason, details: parseJsonSafe(c.details, {}), actor_id: c.actor_id, actor_name: names[c.actor_id] ? names[c.actor_id].full_name : null, created_at: c.created_at };
    }),
    audit: audit.map(function (a) { a.actor_name = a.actor_id && names[a.actor_id] ? names[a.actor_id].full_name : null; return a; }),
    permissions: {
      can_capture: canWorkOnJob(ctx.user, job),
      can_review: (ctx.user.role === 'reviewer' || ctx.user.role === 'admin') && job.status === JOB_STATUS.PENDING_REVIEW,
      can_delete: canDeleteJob(ctx.user, job),
      can_cancel: !isTerminal(job.status) && (ctx.user.role === 'admin' ||
        (ctx.user.role === 'inspector' && job.created_by === ctx.user.id && (job.status === 'DRAFT' || job.status === 'AWAITING_REPAIR')))
    }
  };
}

function actionStats(p, ctx) {
  var counts = { total: 0 };
  Object.keys(JOB_STATUS).forEach(function (s) { counts[s] = 0; });
  visibleJobs(ctx.user, true).forEach(function (j) {
    if (counts[j.status] !== undefined) counts[j.status]++;
    if (j.status !== JOB_STATUS.DELETED) counts.total++;
  });
  return { counts: counts };
}

/** Everything a report needs in one call: jobs + current evidence + verification + latest review. */
function actionReportData(p, ctx) {
  var names = userNameMap();
  var listed = actionListJobs(p, ctx).jobs;
  var only = p.job_id ? String(p.job_id) : '';
  var photos = {};
  Db.all('repair_photos').forEach(function (ph) { photos[ph.id] = ph; });
  var verifications = {};
  Db.all('verification_results').forEach(function (v) { verifications[v.id] = v; });
  var reviewsByJob = {};
  Db.all('repair_reviews').forEach(function (r) { reviewsByJob[r.repair_job_id] = r; }); // rows are chronological: last wins
  return {
    generated_at: nowIso(),
    rows: listed.filter(function (j) { return !only || j.id === only; }).map(function (j) {
      var before = photos[j.current_before_photo_id];
      var after = photos[j.current_after_photo_id];
      var v = verifications[j.current_verification_id];
      var r = reviewsByJob[j.id];
      return {
        job: j,
        before: before ? publicPhoto(before, names) : null,
        after: after ? publicPhoto(after, names) : null,
        verification: v ? publicVerification(v, names) : null,
        review: r ? publicReview(r, names) : null
      };
    })
  };
}
