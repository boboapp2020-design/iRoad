import type { Job, JobStatus, User } from './api';

/** The five stages a repair goes through, in order. */
export const STAGES = ['created', 'before', 'repair', 'after', 'review'] as const;
export type Stage = (typeof STAGES)[number];

/**
 * Index of the stage the job is currently in (0–4), or 5 when everything is
 * finished. Stopped jobs (cancelled / deleted) return null.
 */
export function currentStage(status: JobStatus): number | null {
  switch (status) {
    case 'DRAFT': return 1;
    case 'AWAITING_REPAIR': return 2;
    case 'AWAITING_AFTER_PHOTO':
    case 'NEEDS_RECAPTURE':
    case 'REJECTED': return 3;
    case 'PENDING_REVIEW': return 4;
    case 'APPROVED': return 5;
    default: return null;
  }
}

export interface NextAction {
  /** i18n key for the button / hint. */
  label: string;
  /** Where the action happens; null = nothing for this user to do now (waiting on someone else). */
  to: string | null;
  kind: 'capture-before' | 'mark-repaired' | 'capture-after' | 'review' | 'wait';
}

/** What this user should do next on this job, if anything. Mirrors the server's permission rules. */
export function nextAction(job: Pick<Job, 'id' | 'status' | 'assigned_to'>, user: Pick<User, 'id' | 'role'> | null): NextAction | null {
  if (!user) return null;
  const works = user.role === 'admin' || (user.role === 'inspector' && job.assigned_to === user.id);
  const reviews = user.role === 'admin' || user.role === 'reviewer';
  switch (job.status) {
    case 'DRAFT':
      return works ? { kind: 'capture-before', label: 'next.before', to: `/jobs/${job.id}/capture/BEFORE` } : { kind: 'wait', label: 'next.waitBefore', to: null };
    case 'AWAITING_REPAIR':
      return works ? { kind: 'mark-repaired', label: 'next.markRepaired', to: `/jobs/${job.id}` } : { kind: 'wait', label: 'next.waitRepair', to: null };
    case 'AWAITING_AFTER_PHOTO':
      return works ? { kind: 'capture-after', label: 'next.after', to: `/jobs/${job.id}/capture/AFTER` } : { kind: 'wait', label: 'next.waitAfter', to: null };
    case 'NEEDS_RECAPTURE':
    case 'REJECTED':
      return works ? { kind: 'capture-after', label: 'next.recapture', to: `/jobs/${job.id}/capture/AFTER` } : { kind: 'wait', label: 'next.waitAfter', to: null };
    case 'PENDING_REVIEW':
      return reviews ? { kind: 'review', label: 'next.review', to: `/jobs/${job.id}` } : { kind: 'wait', label: 'next.waitReview', to: null };
    default:
      return null;
  }
}

/**
 * Signed turn from the current heading to the target heading in degrees,
 * in (-180, 180]: positive = turn right (clockwise), negative = turn left.
 */
export function turnDelta(currentDeg: number, targetDeg: number): number {
  const d = ((((targetDeg - currentDeg) % 360) + 540) % 360) - 180;
  return d === -180 ? 180 : d;
}
