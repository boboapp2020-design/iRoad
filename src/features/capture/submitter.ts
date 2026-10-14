import { ApiError, NetworkError, type SubmitCapturePayload, type SubmitCaptureResult } from '@/lib/api';

export type SubmissionState =
  | { kind: 'idle' }
  | { kind: 'uploading' }
  | { kind: 'success'; result: SubmitCaptureResult }
  | { kind: 'rejected'; error: ApiError }
  | { kind: 'unknown'; error: NetworkError };

/**
 * Wraps a capture submission so that:
 *  - repeated taps while a request is in flight are ignored (single request);
 *  - a network failure becomes `unknown` (never success, never PASS) and the
 *    retry re-sends the IDENTICAL payload (same photo_id), which the server
 *    treats as an idempotent replay;
 *  - only a server response produces `success` or `rejected`.
 */
export function createSubmitter(send: (p: SubmitCapturePayload) => Promise<SubmitCaptureResult>, onChange: (s: SubmissionState) => void) {
  let inFlight = false;
  let payload: SubmitCapturePayload | null = null;
  let state: SubmissionState = { kind: 'idle' };
  const set = (s: SubmissionState) => {
    state = s;
    onChange(s);
  };

  async function submit(p?: SubmitCapturePayload): Promise<SubmissionState> {
    if (inFlight) return state;
    if (state.kind === 'success') return state; // never submit twice after success
    // Once a payload has been sent with an unknown outcome, only that exact payload may be re-sent.
    if (p && (payload === null || state.kind === 'idle' || state.kind === 'rejected')) payload = p;
    if (!payload) throw new Error('No payload to submit');
    inFlight = true;
    set({ kind: 'uploading' });
    try {
      const result = await send(payload);
      set({ kind: 'success', result });
    } catch (e) {
      if (e instanceof ApiError) set({ kind: 'rejected', error: e });
      else set({ kind: 'unknown', error: e instanceof NetworkError ? e : new NetworkError('Request failed', e) });
    } finally {
      inFlight = false;
    }
    return state;
  }

  return {
    submit,
    retry: () => submit(),
    get state() {
      return state;
    },
    get payload() {
      return payload;
    },
  };
}
