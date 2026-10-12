import type { VerificationReason, VerificationStatus } from '@verification';

export type Role = 'admin' | 'inspector' | 'reviewer';
export type JobStatus =
  | 'DRAFT' | 'AWAITING_REPAIR' | 'AWAITING_AFTER_PHOTO' | 'PENDING_REVIEW'
  | 'APPROVED' | 'REJECTED' | 'NEEDS_RECAPTURE' | 'CANCELLED' | 'DELETED';
export const JOB_STATUSES: JobStatus[] = ['DRAFT', 'AWAITING_REPAIR', 'AWAITING_AFTER_PHOTO', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'NEEDS_RECAPTURE', 'CANCELLED', 'DELETED'];
export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
export const PRIORITIES: Priority[] = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
export type DamageType = 'POTHOLE' | 'CRACK' | 'ALLIGATOR_CRACK' | 'RUTTING' | 'EDGE_BREAK' | 'SUBSIDENCE' | 'DRAINAGE' | 'OTHER';
export const DAMAGE_TYPES: DamageType[] = ['POTHOLE', 'CRACK', 'ALLIGATOR_CRACK', 'RUTTING', 'EDGE_BREAK', 'SUBSIDENCE', 'DRAINAGE', 'OTHER'];
export type CaptureType = 'BEFORE' | 'AFTER';

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  active: boolean;
  must_change_password: boolean;
  created_at: string;
  updated_at: string;
}

export interface Job {
  id: string;
  job_code: string;
  road_name: string;
  location_description: string;
  damage_type: DamageType;
  description: string;
  priority: Priority;
  notes: string;
  status: JobStatus;
  assigned_to: string | null;
  assigned_to_name: string | null;
  created_by: string;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  cancel_reason: string | null;
  current_before_photo_id: string | null;
  current_after_photo_id: string | null;
  current_verification_id: string | null;
  after_attempts: number;
  planned_latitude: number | null;
  planned_longitude: number | null;
  planned_accuracy_m: number | null;
  deleted_at: string | null;
  deleted_by: string | null;
  deleted_by_name: string | null;
  delete_reason: string | null;
}

export interface JobListItem extends Job {
  before: { id: string; latitude: number | null; longitude: number | null; captured_at: string } | null;
  verification_status: VerificationStatus | 'PENDING';
}

export interface Photo {
  id: string;
  repair_job_id: string;
  capture_type: CaptureType;
  attempt_number: number;
  status: 'ACTIVE' | 'SUPERSEDED' | 'INVALIDATED';
  status_reason: string | null;
  storage_path: string;
  sha256_hash: string;
  mime_type: string;
  file_size_bytes: number | null;
  captured_at: string;
  location_fix_at: string | null;
  latitude: number | null;
  longitude: number | null;
  gps_accuracy_m: number | null;
  heading_degrees: number | null;
  heading_source: string | null;
  heading_measured_at: string | null;
  heading_uncertainty_deg: number | null;
  capture_method: string;
  captured_by: string;
  captured_by_name: string | null;
  device_metadata: Record<string, unknown>;
  received_at: string;
  record_intact: boolean;
}

export interface Verification {
  id: string;
  repair_job_id: string;
  before_photo_id: string;
  after_photo_id: string;
  attempt_number: number;
  measured_distance_m: number | null;
  before_accuracy_m: number | null;
  after_accuracy_m: number | null;
  heading_difference_degrees: number | null;
  gps_accuracy_pass: boolean | null;
  distance_pass: boolean | null;
  heading_pass: boolean | null;
  overall_status: VerificationStatus;
  failure_reasons: VerificationReason[];
  rules_version: string;
  thresholds: Record<string, number | null>;
  verified_at: string;
  verified_by: string | null;
  record_intact: boolean;
}

export interface Review {
  id: string;
  repair_job_id: string;
  verification_id: string;
  after_photo_id: string;
  decision: 'APPROVED' | 'REJECTED' | 'NEEDS_RECAPTURE';
  reason: string;
  reviewer_id: string;
  reviewer_name: string | null;
  created_at: string;
  record_intact: boolean;
}

export interface AuditEntry {
  id: string;
  created_at: string;
  actor_id: string | null;
  actor_name: string | null;
  repair_job_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: Record<string, unknown>;
}

export interface Correction {
  id: string;
  repair_photo_id: string;
  action: string;
  reason: string;
  details: Record<string, unknown>;
  actor_id: string;
  actor_name: string | null;
  created_at: string;
}

export interface JobDetail {
  job: Job;
  photos: Photo[];
  verifications: Verification[];
  reviews: Review[];
  corrections: Correction[];
  audit: AuditEntry[];
  permissions: { can_capture: boolean; can_review: boolean; can_cancel: boolean; can_delete: boolean };
}

export interface CaptureMeasurementPayload {
  latitude: number | null;
  longitude: number | null;
  accuracy_m: number | null;
  heading_deg: number | null;
  heading_source: string | null;
  heading_uncertainty_deg: number | null;
  captured_at: string;
  location_fix_at: string | null;
  heading_measured_at: string | null;
}

export interface SubmitCapturePayload {
  job_id: string;
  capture_type: CaptureType;
  photo_id: string;
  image_base64: string;
  mime_type: string;
  client_sha256: string;
  capture_method: 'image_capture_api' | 'video_frame_canvas';
  device_metadata: Record<string, unknown>;
  measurement: CaptureMeasurementPayload;
}

export interface SubmitCaptureResult {
  idempotent_replay: boolean;
  photo: Photo;
  verification: Verification | null;
  job: Job;
}
