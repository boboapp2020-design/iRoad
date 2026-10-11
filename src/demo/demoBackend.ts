/**
 * DEMO MODE — runs the real generated Apps Script backend (apps-script/dist/Code.gs)
 * inside the browser with in-memory Google Sheets / Drive fakes persisted to
 * IndexedDB on this device only. For trying the app before Apps Script is
 * deployed. Nothing here is real evidence and nothing leaves the device.
 */
import code from '../../apps-script/dist/Code.gs?raw';
import { hmacSha256, sha256 } from './sha256';

export const DEMO_ACCOUNTS = [
  { email: 'admin@demo.local', role: 'admin', name: 'ผู้ดูแลระบบ (ทดลอง)' },
  { email: 'inspector@demo.local', role: 'inspector', name: 'ผู้ตรวจสอบ (ทดลอง)' },
  { email: 'reviewer@demo.local', role: 'reviewer', name: 'ผู้ตรวจรับงาน (ทดลอง)' },
] as const;
export const DEMO_PASSWORD = 'Demo123456';

const enc = new TextEncoder();
const signed = (u: Uint8Array) => Array.from(u, (b) => (b > 127 ? b - 256 : b));
const unsigned = (input: unknown): Uint8Array => {
  if (typeof input === 'string') return enc.encode(input);
  if (Array.isArray(input)) return Uint8Array.from(input, (b: number) => b & 0xff);
  if (input instanceof Uint8Array) return input;
  throw new Error('Unsupported byte input');
};
function b64encode(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

interface State {
  sheets: Record<string, string[][]>;
  sheetOrder: string[];
  files: Record<string, { bytes: Uint8Array; type: string; name: string; folder: string; trashed: boolean }>;
  folders: Record<string, { name: string; parent: string | null }>;
  props: Record<string, string>;
}

function emptyState(): State {
  return { sheets: { 'ชีต1': [] }, sheetOrder: ['ชีต1'], files: {}, folders: {}, props: {} };
}

function buildRuntime(state: State, cache: Map<string, string>) {
  class Range {
    constructor(private sheet: string, private row: number, private col: number, private nr: number, private nc: number) {}
    getValues() {
      const data = state.sheets[this.sheet];
      return Array.from({ length: this.nr }, (_, r) => Array.from({ length: this.nc }, (_, c) => data[this.row - 1 + r]?.[this.col - 1 + c] ?? ''));
    }
    setValues(values: unknown[][]) {
      const data = state.sheets[this.sheet];
      values.forEach((line, r) => {
        const idx = this.row - 1 + r;
        while (data.length <= idx) data.push([]);
        line.forEach((v, c) => (data[idx][this.col - 1 + c] = String(v)));
      });
      return this;
    }
    setNumberFormat() { return this; }
    setFontWeight() { return this; }
    setBackground() { return this; }
  }
  const protection = { setDescription() { return protection; }, addEditor() { return protection; }, getEditors: () => [], removeEditors() { return protection; }, canDomainEdit: () => false, setDomainEdit() { return protection; } };
  const sheetApi = (name: string) => ({
    getName: () => name,
    getLastRow: () => {
      const d = state.sheets[name];
      for (let i = d.length - 1; i >= 0; i--) if (d[i].some((c) => c !== '' && c !== undefined)) return i + 1;
      return 0;
    },
    getMaxRows: () => 1000,
    getRange: (r: number, c: number, nr = 1, nc = 1) => new Range(name, r, c, nr, nc),
    setFrozenRows() {},
    protect: () => protection,
  });
  const spreadsheet = {
    getId: () => 'demo',
    getName: () => 'Iroad (demo)',
    getSheetByName: (n: string) => (state.sheets[n] ? sheetApi(n) : null),
    insertSheet: (n: string) => { state.sheets[n] = []; state.sheetOrder.push(n); return sheetApi(n); },
    getSheets: () => state.sheetOrder.map(sheetApi),
    deleteSheet: (s: { getName: () => string }) => { delete state.sheets[s.getName()]; state.sheetOrder = state.sheetOrder.filter((x) => x !== s.getName()); },
  };
  const blob = (bytes: Uint8Array, type = 'application/octet-stream', name = '') => ({ getBytes: () => signed(bytes), getContentType: () => type, getName: () => name, _bytes: bytes });
  const fileApi = (id: string) => {
    const f = state.files[id];
    if (!f) throw new Error('File not found');
    return { getId: () => id, getBlob: () => blob(f.bytes, f.type, f.name), setDescription() { return this; }, setTrashed(t: boolean) { f.trashed = t; return this; }, getThumbnail: () => null };
  };
  const folderApi = (id: string): Record<string, unknown> => ({
    getId: () => id,
    getUrl: () => 'demo://folder/' + id,
    createFolder: (name: string) => { const fid = crypto.randomUUID(); state.folders[fid] = { name, parent: id }; return folderApi(fid); },
    getFoldersByName: (name: string) => {
      const list = Object.entries(state.folders).filter(([, f]) => f.parent === id && f.name === name).map(([fid]) => fid);
      let i = 0;
      return { hasNext: () => i < list.length, next: () => folderApi(list[i++]) };
    },
    createFile: (b: ReturnType<typeof blob>) => { const fid = crypto.randomUUID(); state.files[fid] = { bytes: b._bytes, type: b.getContentType(), name: b.getName(), folder: id, trashed: false }; return fileApi(fid); },
  });
  return {
    console: { log() {}, warn() {}, error: (...a: unknown[]) => console.error('[demo backend]', ...a) },
    Logger: { log() {} },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'SHA_256' },
      Charset: { UTF_8: 'UTF_8' },
      computeDigest: (_a: string, input: unknown) => signed(sha256(unsigned(input))),
      computeHmacSha256Signature: (value: unknown, key: unknown) => signed(hmacSha256(unsigned(key), unsigned(value))),
      base64Decode: (s: string) => { const bin = atob(s); return signed(Uint8Array.from(bin, (ch) => ch.charCodeAt(0))); },
      base64Encode: (bytes: number[]) => b64encode(unsigned(bytes)),
      newBlob: (data: unknown, type?: string, name?: string) => blob(unsigned(data), type, name),
      getUuid: () => crypto.randomUUID(),
    },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k: string) => state.props[k] ?? null, setProperty: (k: string, v: string) => { state.props[k] = v; } }) },
    CacheService: { getScriptCache: () => ({ get: (k: string) => cache.get(k) ?? null, put: (k: string, v: string) => cache.set(k, v) }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    SpreadsheetApp: { getActiveSpreadsheet: () => spreadsheet },
    DriveApp: {
      createFolder: (name: string) => { const fid = crypto.randomUUID(); state.folders[fid] = { name, parent: null }; return folderApi(fid); },
      getFolderById: (id: string) => { if (!state.folders[id]) throw new Error('Folder not found'); return folderApi(id); },
      getFileById: (id: string) => fileApi(id),
    },
    ContentService: { MimeType: { JSON: 'JSON' }, createTextOutput: (s: string) => ({ setMimeType() { return this; }, getContent: () => s }) },
    MailApp: { sendEmail: (m: { to: string; subject: string; body: string }) => setTimeout(() => window.alert(`[โหมดทดลอง: อีเมลจำลองถึง ${m.to}]\n\n${m.body}`), 0) },
    Session: { getEffectiveUser: () => ({ getEmail: () => 'owner@demo.local' }) },
  };
}

/* ------------------------------------------------------------ persistence */
const DB = 'rr-demo';
function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('kv');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function load(): Promise<State | null> {
  try {
    const db = await idb();
    return await new Promise((resolve) => {
      const r = db.transaction('kv').objectStore('kv').get('state');
      r.onsuccess = () => resolve((r.result as State) ?? null);
      r.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}
async function save(state: State) {
  try {
    const db = await idb();
    db.transaction('kv', 'readwrite').objectStore('kv').put(state, 'state');
  } catch {
    /* demo data then lives only until reload */
  }
}

/* ---------------------------------------------------------------- runtime */
type Runtime = { doPost: (e: unknown) => { getContent: () => string }; [k: string]: unknown };
let runtime: Promise<{ rt: Runtime; state: State }> | null = null;

function instantiate(state: State): Runtime {
  const env = buildRuntime(state, new Map());
  const names = Object.keys(env);
  // The generated bundle declares globals with `function`/`var`; expose the ones we need.
  const factory = new Function(...names, `${code}\nLIMITS.pbkdf2Iterations = 2000;\nreturn { doPost, setup, createInitialAdmin, handleRequest };`);
  return factory(...names.map((n) => (env as Record<string, unknown>)[n])) as Runtime;
}

function seed(rt: Runtime) {
  (rt.setup as () => void)();
  const call = (action: string, payload: Record<string, unknown>, token?: string) =>
    JSON.parse(rt.doPost({ postData: { contents: JSON.stringify({ action, payload, token }) } }).getContent());
  const adminTemp = (rt.createInitialAdmin as (e: string, n: string) => { temporary_password: string })(DEMO_ACCOUNTS[0].email, DEMO_ACCOUNTS[0].name).temporary_password;
  const admin = call('login', { email: DEMO_ACCOUNTS[0].email, password: adminTemp }).data.token;
  call('changePassword', { current_password: adminTemp, new_password: DEMO_PASSWORD }, admin);
  for (const acc of DEMO_ACCOUNTS.slice(1)) {
    const r = call('createUser', { email: acc.email, full_name: acc.name, role: acc.role }, admin).data;
    const tok = call('login', { email: acc.email, password: r.temporary_password }).data.token;
    call('changePassword', { current_password: r.temporary_password, new_password: DEMO_PASSWORD }, tok);
  }
}

function ensure() {
  if (!runtime) {
    runtime = (async () => {
      const stored = await load();
      const state = stored ?? emptyState();
      const rt = instantiate(state);
      if (!stored) {
        seed(rt);
        await save(state);
      }
      return { rt, state };
    })();
  }
  return runtime;
}

/** Transport compatible with src/lib/api/client.ts. */
export async function demoTransport(body: string): Promise<string> {
  const { rt, state } = await ensure();
  await new Promise((r) => setTimeout(r, 150)); // feel like a network call
  const out = rt.doPost({ postData: { contents: body } }).getContent();
  await save(state);
  return out;
}

export async function resetDemo() {
  runtime = null;
  try {
    const db = await idb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').delete('state');
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    /* ignore */
  }
}
