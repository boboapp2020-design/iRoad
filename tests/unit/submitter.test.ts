import { describe, expect, it, vi } from 'vitest';
import { ApiError, NetworkError, type SubmitCapturePayload, type SubmitCaptureResult } from '@/lib/api';
import { createSubmitter, type SubmissionState } from '@/features/capture/submitter';

const payload = (id = 'p1') => ({ photo_id: id }) as unknown as SubmitCapturePayload;
const passResult = { idempotent_replay: false, verification: { overall_status: 'PASS' } } as unknown as SubmitCaptureResult;

describe('capture submitter', () => {
  it('ignores repeated taps while a request is in flight (single request)', async () => {
    let resolve!: (r: SubmitCaptureResult) => void;
    const send = vi.fn(() => new Promise<SubmitCaptureResult>((r) => (resolve = r)));
    const s = createSubmitter(send, () => {});
    const first = s.submit(payload());
    s.submit(payload());
    s.submit(payload());
    resolve(passResult);
    await first;
    expect(send).toHaveBeenCalledTimes(1);
    expect(s.state.kind).toBe('success');
  });

  it('a network failure never yields success/PASS and retry resends the identical payload', async () => {
    const states: SubmissionState[] = [];
    const send = vi.fn().mockRejectedValueOnce(new NetworkError('offline')).mockResolvedValueOnce(passResult);
    const s = createSubmitter(send, (st) => states.push(st));
    await s.submit(payload('original'));
    expect(s.state.kind).toBe('unknown');
    expect(states.some((x) => x.kind === 'success')).toBe(false);
    await s.submit(payload('different-photo'));
    expect(send).toHaveBeenNthCalledWith(2, expect.objectContaining({ photo_id: 'original' }));
    expect(s.state.kind).toBe('success');
  });

  it('non-API exceptions are treated as unknown outcomes, not success', async () => {
    const s = createSubmitter(vi.fn().mockRejectedValue(new TypeError('Failed to fetch')), () => {});
    await s.submit(payload());
    expect(s.state.kind).toBe('unknown');
  });

  it('a server rejection is reported as rejected and a new capture may be submitted', async () => {
    const send = vi.fn().mockRejectedValueOnce(new ApiError('CAPTURE_REJECTED', 'no')).mockResolvedValueOnce(passResult);
    const s = createSubmitter(send, () => {});
    await s.submit(payload('a'));
    expect(s.state.kind).toBe('rejected');
    await s.submit(payload('b'));
    expect(send).toHaveBeenLastCalledWith(expect.objectContaining({ photo_id: 'b' }));
  });

  it('does not submit again after success', async () => {
    const send = vi.fn().mockResolvedValue(passResult);
    const s = createSubmitter(send, () => {});
    await s.submit(payload());
    await s.submit(payload('x'));
    expect(send).toHaveBeenCalledTimes(1);
  });
});
