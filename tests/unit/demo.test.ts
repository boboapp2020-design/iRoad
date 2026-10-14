import { createHash, createHmac, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { hmacSha256, sha256 } from '@/demo/sha256';
import { DEMO_PASSWORD, demoTransport } from '@/demo/demoBackend';

const hex = (u: Uint8Array) => Buffer.from(u).toString('hex');

describe('sync SHA-256 used by demo mode', () => {
  it('matches Node for many lengths (incl. block boundaries)', () => {
    for (const n of [0, 1, 55, 56, 63, 64, 65, 119, 120, 1000, 100_000]) {
      const d = randomBytes(n);
      expect(hex(sha256(d))).toBe(createHash('sha256').update(d).digest('hex'));
    }
  });
  it('HMAC matches Node (short and long keys)', () => {
    for (const k of [randomBytes(16), randomBytes(64), randomBytes(100)]) {
      const m = randomBytes(77);
      expect(hex(hmacSha256(k, m))).toBe(createHmac('sha256', k).update(m).digest('hex'));
    }
  });
});

describe('demo backend', () => {
  it('runs the generated Code.gs in-browser with seeded demo accounts', async () => {
    const call = async (action: string, payload: object, token?: string) => JSON.parse(await demoTransport(JSON.stringify({ action, payload, token })));
    const login = await call('login', { email: 'inspector@demo.local', password: DEMO_PASSWORD });
    expect(login.ok).toBe(true);
    expect(login.data.user.role).toBe('inspector');
    const job = await call('createJob', { road_name: 'ถ.ทดลอง', damage_type: 'POTHOLE', priority: 'LOW' }, login.data.token);
    expect(job.data.job.job_code).toMatch(/^RR-\d{4}-000001$/);
    expect((await call('login', { email: 'inspector@demo.local', password: 'wrong' })).error.code).toBe('INVALID_CREDENTIALS');
  });
});
