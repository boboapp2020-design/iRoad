import type { VerificationRules } from '@verification';
import { call } from './client';
import type {
  AuditEntry, Job, JobDetail, JobListItem, JobStatus, Role, SubmitCaptureResult, SubmitCapturePayload, User,
} from './types';

export * from './types';
export { ApiError, NetworkError } from './client';

export interface JobInput {
  road_name: string;
  location_description?: string;
  damage_type: string;
  description?: string;
  priority: string;
  notes?: string;
  assigned_to?: string;
  planned_latitude?: number | null;
  planned_longitude?: number | null;
  planned_accuracy_m?: number | null;
}

export const api = {
  login: (email: string, password: string) =>
    call<{ token: string; expires_at: string; user: User }>('login', { email, password, user_agent: navigator.userAgent }),
  logout: () => call<{ signed_out: true }>('logout'),
  me: () => call<{ user: User }>('me'),
  changePassword: (current_password: string, new_password: string) => call<{ changed: true }>('changePassword', { current_password, new_password }),
  requestPasswordReset: (email: string) => call<{ requested: true }>('requestPasswordReset', { email }),
  resetPassword: (email: string, code: string, new_password: string) => call<{ reset: true }>('resetPassword', { email, code, new_password }),

  getSettings: () => call<{ settings: Record<string, string>; rules: VerificationRules; app_version: string }>('getSettings'),
  stats: () => call<{ counts: Record<JobStatus | 'total', number> }>('stats'),
  listJobs: (filters: { status?: string; q?: string; date_from?: string; date_to?: string; limit?: number } = {}) =>
    call<{ total: number; jobs: JobListItem[] }>('listJobs', filters),
  getJob: (id: string) => call<JobDetail>('getJob', { id }),
  createJob: (input: JobInput) => call<{ job: Job }>('createJob', input as unknown as Record<string, unknown>),
  updateJob: (id: string, input: Partial<JobInput>) => call<{ job: Job }>('updateJob', { id, ...input }),
  markRepairDone: (id: string, note?: string) => call<{ job: Job }>('markRepairDone', { id, note }),
  cancelJob: (id: string, reason: string) => call<{ job: Job }>('cancelJob', { id, reason }),
  assignJob: (id: string, assigned_to: string) => call<{ job: Job }>('assignJob', { id, assigned_to }),
  submitCapture: (p: SubmitCapturePayload) => call<SubmitCaptureResult>('submitCapture', p as unknown as Record<string, unknown>, { timeoutMs: 120_000 }),
  getPhoto: (photo_id: string, variant: 'thumb' | 'original' = 'original') =>
    call<{ photo_id: string; variant: string; mime_type: string; image_base64: string; integrity_ok?: boolean; sha256_hash?: string }>('getPhoto', { photo_id, variant }, { timeoutMs: 90_000 }),
  reviewJob: (id: string, decision: 'APPROVE' | 'REJECT' | 'REQUEST_RECAPTURE', reason: string) =>
    call<{ job: Job }>('reviewJob', { id, decision, reason }),

  listUsers: () => call<{ users: User[] }>('listUsers'),
  listInspectors: () => call<{ inspectors: { id: string; full_name: string; email: string }[] }>('listInspectors'),
  createUser: (email: string, full_name: string, role: Role) => call<{ user: User; temporary_password: string }>('createUser', { email, full_name, role }),
  updateUser: (id: string, patch: { full_name?: string; role?: Role; active?: boolean }) => call<{ user: User }>('updateUser', { id, ...patch }),
  resetUserPassword: (id: string) => call<{ temporary_password: string }>('resetUserPassword', { id }),
  updateSetting: (key: string, value: string) => call<{ key: string; value: string }>('updateSetting', { key, value }),
  listAudit: (filters: { repair_job_id?: string; limit?: number } = {}) => call<{ total: number; entries: AuditEntry[] }>('listAudit', filters),
  verifyAuditChain: () => call<{ intact: boolean; checked: number; first_broken_row?: number }>('verifyAuditChain'),
  invalidateEvidence: (photo_id: string, reason: string) => call<{ job: Job }>('invalidateEvidence', { photo_id, reason }),
  checkEvidenceIntegrity: (id: string) =>
    call<{ photos: { photo_id: string; capture_type: string; status: string; file_hash_ok: boolean; record_ok: boolean }[]; verifications: { verification_id: string; record_ok: boolean }[] }>('checkEvidenceIntegrity', { id }),
};

export interface ReportRow {
  job: import('./types').JobListItem;
  before: import('./types').Photo | null;
  after: import('./types').Photo | null;
  verification: import('./types').Verification | null;
  review: import('./types').Review | null;
}

export function reportData(filters: { status?: string; date_from?: string; date_to?: string; q?: string; job_id?: string } = {}) {
  return call<{ generated_at: string; rows: ReportRow[] }>('reportData', filters);
}
