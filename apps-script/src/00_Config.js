/**
 * Road Repair Tracker — Google Apps Script backend.
 *
 * The web app executes as the spreadsheet owner. The spreadsheet and the
 * evidence Drive folder must NOT be shared with anyone else: every read and
 * write goes through this API, which enforces authentication, roles, status
 * transitions and append-only evidence rules.
 */
var APP_VERSION = '0.1.0';
var SCHEMA_VERSION = 1;

var ROLES = ['admin', 'inspector', 'reviewer'];
var CAPTURE_TYPES = ['BEFORE', 'AFTER'];
var PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
var DAMAGE_TYPES = ['POTHOLE', 'CRACK', 'ALLIGATOR_CRACK', 'RUTTING', 'EDGE_BREAK', 'SUBSIDENCE', 'DRAINAGE', 'OTHER'];

var JOB_STATUS = {
  DRAFT: 'DRAFT',
  AWAITING_REPAIR: 'AWAITING_REPAIR',
  AWAITING_AFTER_PHOTO: 'AWAITING_AFTER_PHOTO',
  PENDING_REVIEW: 'PENDING_REVIEW',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  NEEDS_RECAPTURE: 'NEEDS_RECAPTURE',
  CANCELLED: 'CANCELLED',
  DELETED: 'DELETED'
};

/** Allowed status transitions. Anything not listed is refused. */
var JOB_TRANSITIONS = {
  DRAFT: ['AWAITING_REPAIR', 'CANCELLED', 'DELETED'],
  AWAITING_REPAIR: ['AWAITING_AFTER_PHOTO', 'DRAFT', 'CANCELLED', 'DELETED'],
  AWAITING_AFTER_PHOTO: ['PENDING_REVIEW', 'NEEDS_RECAPTURE', 'DRAFT', 'CANCELLED', 'DELETED'],
  NEEDS_RECAPTURE: ['PENDING_REVIEW', 'NEEDS_RECAPTURE', 'DRAFT', 'CANCELLED', 'DELETED'],
  PENDING_REVIEW: ['APPROVED', 'REJECTED', 'NEEDS_RECAPTURE', 'DRAFT', 'CANCELLED', 'DELETED'],
  REJECTED: ['PENDING_REVIEW', 'NEEDS_RECAPTURE', 'DRAFT', 'CANCELLED', 'DELETED'],
  // Only an administrator may delete an approved or cancelled job (checked in actionDeleteJob).
  APPROVED: ['DELETED'],
  CANCELLED: ['DELETED'],
  // Soft delete: the job, its photos and verifications are kept; nothing follows.
  DELETED: []
};

/** Job statuses from which an After photo may be submitted. */
var AFTER_CAPTURE_STATUSES = ['AWAITING_AFTER_PHOTO', 'NEEDS_RECAPTURE', 'REJECTED'];

var LIMITS = {
  maxImageBytes: 20 * 1024 * 1024,
  maxTextLength: 2000,
  maxShortTextLength: 200,
  minPasswordLength: 10,
  maxFailedLogins: 5,
  lockMinutes: 15,
  resetCodeMinutes: 30,
  pbkdf2Iterations: 10000,
  lockWaitMs: 30000
};

/** Default values for admin-editable settings (see updateSetting). */
var SETTINGS_DEFAULTS = {
  allow_self_approval: 'false',
  session_ttl_hours: '12'
};

/**
 * Sheet schema. Column order is fixed: setup() writes these headers and
 * the Db layer maps rows by header name. `immutable` lists columns that may
 * never change after insert; `hashed` columns form the record hash used to
 * detect manual edits made directly in the spreadsheet.
 */
var SCHEMA = {
  users: {
    columns: ['id', 'email', 'full_name', 'role', 'active', 'password_hash', 'password_salt', 'password_iterations',
      'must_change_password', 'failed_logins', 'locked_until', 'password_changed_at', 'created_at', 'updated_at'],
    secret: ['password_hash', 'password_salt', 'password_iterations', 'failed_logins', 'locked_until']
  },
  sessions: {
    columns: ['token_hash', 'user_id', 'created_at', 'expires_at', 'revoked_at', 'user_agent']
  },
  password_resets: {
    columns: ['id', 'code_hash', 'user_id', 'created_at', 'expires_at', 'used_at']
  },
  repair_jobs: {
    columns: ['id', 'job_code', 'road_name', 'location_description', 'damage_type', 'description', 'priority', 'notes',
      'status', 'assigned_to', 'created_by', 'created_at', 'updated_at', 'completed_at', 'cancel_reason',
      'current_before_photo_id', 'current_after_photo_id', 'current_verification_id', 'after_attempts',
      'planned_latitude', 'planned_longitude', 'planned_accuracy_m', 'deleted_at', 'deleted_by', 'delete_reason']
  },
  repair_photos: {
    columns: ['id', 'repair_job_id', 'capture_type', 'attempt_number', 'status', 'status_reason', 'drive_file_id',
      'storage_path', 'sha256_hash', 'mime_type', 'file_size_bytes', 'captured_at', 'location_fix_at', 'latitude',
      'longitude', 'gps_accuracy_m', 'heading_degrees', 'heading_source', 'heading_measured_at',
      'heading_uncertainty_deg', 'capture_method', 'captured_by', 'device_metadata', 'received_at', 'record_hash'],
    hashed: ['id', 'repair_job_id', 'capture_type', 'attempt_number', 'drive_file_id', 'storage_path', 'sha256_hash',
      'mime_type', 'file_size_bytes', 'captured_at', 'location_fix_at', 'latitude', 'longitude', 'gps_accuracy_m',
      'heading_degrees', 'heading_source', 'heading_measured_at', 'heading_uncertainty_deg', 'capture_method',
      'captured_by', 'device_metadata', 'received_at']
  },
  verification_results: {
    columns: ['id', 'repair_job_id', 'before_photo_id', 'after_photo_id', 'attempt_number', 'measured_distance_m',
      'before_accuracy_m', 'after_accuracy_m', 'heading_difference_degrees', 'gps_accuracy_pass', 'distance_pass',
      'heading_pass', 'overall_status', 'failure_reasons', 'rules_version', 'thresholds', 'verified_at', 'verified_by',
      'record_hash'],
    hashed: ['id', 'repair_job_id', 'before_photo_id', 'after_photo_id', 'attempt_number', 'measured_distance_m',
      'before_accuracy_m', 'after_accuracy_m', 'heading_difference_degrees', 'gps_accuracy_pass', 'distance_pass',
      'heading_pass', 'overall_status', 'failure_reasons', 'rules_version', 'thresholds', 'verified_at', 'verified_by']
  },
  repair_reviews: {
    columns: ['id', 'repair_job_id', 'verification_id', 'after_photo_id', 'decision', 'reason', 'reviewer_id',
      'created_at', 'record_hash'],
    hashed: ['id', 'repair_job_id', 'verification_id', 'after_photo_id', 'decision', 'reason', 'reviewer_id', 'created_at']
  },
  evidence_corrections: {
    columns: ['id', 'repair_photo_id', 'repair_job_id', 'action', 'reason', 'details', 'actor_id', 'created_at']
  },
  audit_logs: {
    columns: ['id', 'created_at', 'actor_id', 'repair_job_id', 'action', 'entity_type', 'entity_id', 'details',
      'prev_hash', 'row_hash']
  },
  settings: {
    columns: ['key', 'value', 'updated_at', 'updated_by']
  },
  counters: {
    columns: ['key', 'value']
  }
};
