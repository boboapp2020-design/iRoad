import { describe, expect, it } from 'vitest';
import { currentStage, nextAction, turnDelta } from '@/lib/workflow';

const job = (status: string, assigned_to = 'insp') => ({ id: 'j1', status: status as never, assigned_to });
const inspector = { id: 'insp', role: 'inspector' as const };
const other = { id: 'x', role: 'inspector' as const };
const reviewer = { id: 'r', role: 'reviewer' as const };

describe('workflow helpers', () => {
  it('maps statuses to the five stages', () => {
    expect(currentStage('DRAFT')).toBe(1);
    expect(currentStage('AWAITING_REPAIR')).toBe(2);
    expect(currentStage('NEEDS_RECAPTURE')).toBe(3);
    expect(currentStage('PENDING_REVIEW')).toBe(4);
    expect(currentStage('APPROVED')).toBe(5);
    expect(currentStage('DELETED')).toBeNull();
  });
  it('tells the assigned inspector the next step', () => {
    expect(nextAction(job('DRAFT'), inspector)).toMatchObject({ kind: 'capture-before', to: '/jobs/j1/capture/BEFORE' });
    expect(nextAction(job('AWAITING_REPAIR'), inspector)?.kind).toBe('mark-repaired');
    expect(nextAction(job('REJECTED'), inspector)).toMatchObject({ kind: 'capture-after', label: 'next.recapture' });
    expect(nextAction(job('PENDING_REVIEW'), inspector)?.kind).toBe('wait');
  });
  it('mirrors permissions: others wait, reviewers review', () => {
    expect(nextAction(job('DRAFT'), other)?.kind).toBe('wait');
    expect(nextAction(job('PENDING_REVIEW'), reviewer)?.kind).toBe('review');
    expect(nextAction(job('APPROVED'), inspector)).toBeNull();
  });
  it('turnDelta gives the shortest signed turn', () => {
    expect(turnDelta(115, 125)).toBe(10); // turn right
    expect(turnDelta(130, 125)).toBe(-5); // turn left
    expect(turnDelta(355, 5)).toBe(10);
    expect(turnDelta(5, 355)).toBe(-10);
    expect(turnDelta(0, 180)).toBe(180);
  });
});
