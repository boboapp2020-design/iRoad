var REVIEW_DECISIONS = { APPROVE: 'APPROVED', REJECT: 'REJECTED', REQUEST_RECAPTURE: 'NEEDS_RECAPTURE' };

/**
 * Human acceptance, kept separate from the technical verification. A job can
 * only be APPROVED when its current verification is PASS and the evidence
 * records are intact; the reviewer must give an explicit reason.
 */
function actionReviewJob(p, ctx) {
  requireRole(ctx.user, ['reviewer', 'admin']);
  var decision = reqString(p, 'decision', { oneOf: Object.keys(REVIEW_DECISIONS) });
  var reason = reqString(p, 'reason', { min: 3, max: LIMITS.maxTextLength });
  return withLock(function () {
    var job = loadJobForUser(ctx.user, p.id);
    if (job.status !== JOB_STATUS.PENDING_REVIEW) fail('INVALID_STATE', 'Job is not pending review.');
    var v = Db.byId('verification_results', job.current_verification_id);
    var after = Db.byId('repair_photos', job.current_after_photo_id);
    var before = Db.byId('repair_photos', job.current_before_photo_id);
    if (!v || !after || !before || v.after_photo_id !== after.id || v.before_photo_id !== before.id ||
        after.status !== 'ACTIVE' || before.status !== 'ACTIVE') {
      fail('INVALID_STATE', 'Current evidence is incomplete; it cannot be reviewed.');
    }
    if (decision === 'APPROVE') {
      if (v.overall_status !== 'PASS') fail('VERIFICATION_NOT_PASSED', 'A job whose verification is ' + v.overall_status + ' cannot be approved.');
      if (v.record_hash !== recordHash('verification_results', v) || after.record_hash !== recordHash('repair_photos', after) ||
          before.record_hash !== recordHash('repair_photos', before)) {
        fail('EVIDENCE_TAMPERED', 'Evidence records were modified outside the application. Approval is blocked.');
      }
      var self = after.captured_by === ctx.user.id || before.captured_by === ctx.user.id || job.assigned_to === ctx.user.id;
      if (self && getSetting('allow_self_approval') !== 'true') fail('SELF_APPROVAL_FORBIDDEN', 'You cannot approve a job you captured or are assigned to.');
    }
    var review = {
      id: newId(), repair_job_id: job.id, verification_id: v.id, after_photo_id: after.id, decision: REVIEW_DECISIONS[decision],
      reason: reason, reviewer_id: ctx.user.id, created_at: nowIso()
    };
    review.record_hash = recordHash('repair_reviews', review);
    var stored = Db.insert('repair_reviews', [review])[0];
    writeAudit({ actor_id: ctx.user.id, repair_job_id: job.id, action: 'review.' + decision.toLowerCase(), entity_type: 'repair_review', entity_id: review.id, details: { reason: reason } });
    var extra = decision === 'APPROVE' ? { completed_at: nowIso() } : {};
    transitionJob(job, REVIEW_DECISIONS[decision], ctx.user.id, reason, extra);
    var names = userNameMap();
    return { review: publicReview(stored, names), job: publicJob(job, names) };
  });
}
