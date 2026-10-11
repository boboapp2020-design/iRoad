import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, NetworkError, call, configureAuth, fetchTransport, setTransport } from '@/lib/api/client';
import { csvCell, toCsv } from '@/lib/csv';

afterEach(() => setTransport(fetchTransport));

describe('API client', () => {
  it('returns data on ok responses and sends the session token', async () => {
    const t = vi.fn(async (body: string) => {
      expect(JSON.parse(body)).toMatchObject({ action: 'me', token: 'tok' });
      return JSON.stringify({ ok: true, data: { x: 1 } });
    });
    setTransport(t);
    configureAuth(() => 'tok', () => {});
    await expect(call('me')).resolves.toEqual({ x: 1 });
  });
  it('maps server errors to ApiError and clears the session on UNAUTHENTICATED', async () => {
    const expired = vi.fn();
    configureAuth(() => 'tok', expired);
    setTransport(async () => JSON.stringify({ ok: false, error: { code: 'UNAUTHENTICATED', message: 'x' } }));
    await expect(call('me')).rejects.toBeInstanceOf(ApiError);
    expect(expired).toHaveBeenCalled();
  });
  it('treats HTML / garbage responses as NetworkError (never success)', async () => {
    setTransport(async () => '<html>Sign in</html>');
    await expect(call('submitCapture')).rejects.toBeInstanceOf(NetworkError);
    setTransport(async () => JSON.stringify({ hello: 1 }));
    await expect(call('submitCapture')).rejects.toBeInstanceOf(NetworkError);
  });
  it('treats transport failures and timeouts as NetworkError', async () => {
    setTransport(async () => { throw new TypeError('Failed to fetch'); });
    await expect(call('x')).rejects.toBeInstanceOf(NetworkError);
    setTransport((_b, signal) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))));
    await expect(call('x', {}, { timeoutMs: 10 })).rejects.toBeInstanceOf(NetworkError);
  });
});

describe('CSV export', () => {
  it('escapes quotes, commas and newlines', () => {
    expect(csvCell('a,"b"\nc')).toBe('"a,""b""\nc"');
  });
  it('neutralizes spreadsheet formulas', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('-12.5')).toBe("'-12.5");
    expect(csvCell(-12.5)).toBe('-12.5');
  });
  it('builds CRLF rows', () => {
    expect(toCsv(['a', 'b'], [[1, null]])).toBe('a,b\r\n1,\r\n');
  });
});
