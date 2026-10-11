/**
 * Append-only, hash-chained audit log. Each row's hash covers the previous
 * row's hash, so editing or deleting a row directly in the spreadsheet is
 * detectable with actionVerifyAuditChain. (It cannot stop the spreadsheet
 * owner from rewriting the whole chain — see docs/LIMITATIONS.)
 */
function auditRowHash(row) {
  return sha256Hex([
    row.prev_hash, row.id, row.created_at, row.actor_id, row.repair_job_id, row.action,
    row.entity_type, row.entity_id, row.details
  ].map(normalizedCell).join('|'));
}

function writeAudit(entry) {
  var rows = Db.all('audit_logs');
  var prev = rows.length ? rows[rows.length - 1].row_hash : 'GENESIS';
  var row = {
    id: newId(),
    created_at: nowIso(),
    actor_id: entry.actor_id || '',
    repair_job_id: entry.repair_job_id || '',
    action: entry.action,
    entity_type: entry.entity_type || '',
    entity_id: entry.entity_id || '',
    details: JSON.stringify(entry.details || {}),
    prev_hash: prev
  };
  row.row_hash = auditRowHash(row);
  Db.insert('audit_logs', [row]);
  return row;
}

function publicAudit(r) {
  return {
    id: r.id, created_at: r.created_at, actor_id: r.actor_id || null, repair_job_id: r.repair_job_id || null,
    action: r.action, entity_type: r.entity_type, entity_id: r.entity_id || null, details: parseJsonSafe(r.details, {})
  };
}
