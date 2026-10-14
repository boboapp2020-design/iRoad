import { env } from '../env';

/** Error returned by the server (a definitive answer). */
export class ApiError extends Error {
  constructor(public code: string, message: string, public details: unknown = null) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * The request may or may not have reached the server (offline, timeout,
 * malformed response). Callers must NOT assume success or failure; retrying
 * idempotent requests (same photo_id) is safe.
 */
export class NetworkError extends Error {
  constructor(message: string, public cause?: unknown) {
    super(message);
    this.name = 'NetworkError';
  }
}

export type Transport = (body: string, signal: AbortSignal) => Promise<string>;

/** Default transport: text/plain POST avoids a CORS preflight against Apps Script. */
export const fetchTransport: Transport = async (body, signal) => {
  if (!env.apiUrl) throw new ApiError('NOT_CONFIGURED', 'VITE_APPS_SCRIPT_URL is not set.');
  const res = await fetch(env.apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body,
    redirect: 'follow',
    cache: 'no-store',
    credentials: 'omit',
    signal,
  });
  if (!res.ok) throw new NetworkError(`HTTP ${res.status}`);
  return res.text();
};

let transport: Transport = fetchTransport;
export function setTransport(t: Transport) {
  transport = t;
}

let tokenProvider: () => string | null = () => null;
let onUnauthenticated: () => void = () => {};
export function configureAuth(getToken: () => string | null, onExpired: () => void) {
  tokenProvider = getToken;
  onUnauthenticated = onExpired;
}

export async function call<T>(action: string, payload: Record<string, unknown> = {}, opts: { timeoutMs?: number } = {}): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? env.requestTimeoutMs);
  let text: string;
  try {
    text = await transport(JSON.stringify({ action, payload, token: tokenProvider() }), controller.signal);
  } catch (e) {
    if (e instanceof ApiError || e instanceof NetworkError) throw e;
    throw new NetworkError(controller.signal.aborted ? 'Request timed out' : 'Network request failed', e);
  } finally {
    clearTimeout(timer);
  }
  let parsed: { ok?: boolean; data?: T; error?: { code: string; message: string; details?: unknown } };
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    // e.g. a Google sign-in HTML page when the web app is not deployed for "Anyone".
    throw new NetworkError('Unexpected response from server', e);
  }
  if (parsed && parsed.ok === true) return parsed.data as T;
  if (parsed && parsed.ok === false && parsed.error && typeof parsed.error.code === 'string') {
    if (parsed.error.code === 'UNAUTHENTICATED') onUnauthenticated();
    throw new ApiError(parsed.error.code, parsed.error.message, parsed.error.details ?? null);
  }
  throw new NetworkError('Malformed response from server');
}
