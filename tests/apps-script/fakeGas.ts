/**
 * In-memory fake of the Google Apps Script services used by the backend.
 * It runs the GENERATED apps-script/dist/Code.gs in a Node vm context so the
 * exact code that gets deployed is what the tests exercise.
 */
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

type Cell = string;
const toSigned = (buf: Uint8Array) => Array.from(buf, (b) => (b > 127 ? b - 256 : b));
const toBuf = (input: unknown): Buffer => {
  if (typeof input === 'string') return Buffer.from(input, 'utf8');
  if (Array.isArray(input)) return Buffer.from(input.map((b: number) => b & 0xff));
  throw new Error('unsupported input');
};

class FakeRange {
  constructor(private sheet: FakeSheet, private row: number, private col: number, private nr: number, private nc: number) {}
  getValues(): Cell[][] {
    const out: Cell[][] = [];
    for (let r = 0; r < this.nr; r++) {
      const src = this.sheet.data[this.row - 1 + r] || [];
      const line: Cell[] = [];
      for (let c = 0; c < this.nc; c++) line.push(src[this.col - 1 + c] ?? '');
      out.push(line);
    }
    return out;
  }
  setValues(values: unknown[][]) {
    if (values.length !== this.nr || values.some((v) => v.length !== this.nc)) throw new Error('setValues dimension mismatch');
    for (let r = 0; r < this.nr; r++) {
      const idx = this.row - 1 + r;
      while (this.sheet.data.length <= idx) this.sheet.data.push([]);
      for (let c = 0; c < this.nc; c++) {
        const v = values[r][c];
        if (typeof v === 'string' && v.startsWith('=')) throw new Error('Formula written to sheet: ' + v);
        this.sheet.data[idx][this.col - 1 + c] = String(v);
      }
    }
    return this;
  }
  setNumberFormat() { return this; }
  setFontWeight() { return this; }
  setBackground() { return this; }
}

class FakeProtection {
  setDescription() { return this; }
  addEditor() { return this; }
  getEditors() { return []; }
  removeEditors() { return this; }
  canDomainEdit() { return false; }
  setDomainEdit() { return this; }
}

export class FakeSheet {
  data: Cell[][] = [];
  constructor(public name: string) {}
  getName() { return this.name; }
  getLastRow() {
    for (let i = this.data.length - 1; i >= 0; i--) if (this.data[i].some((c) => c !== '' && c !== undefined)) return i + 1;
    return 0;
  }
  getMaxRows() { return 1000; }
  getRange(row: number, col: number, nr = 1, nc = 1) { return new FakeRange(this, row, col, nr, nc); }
  setFrozenRows() { return this; }
  protect() { return new FakeProtection(); }
  /** Test helper: rows as objects keyed by header. */
  rows(): Record<string, string>[] {
    const [header, ...rest] = this.data;
    return rest.filter((r) => r.some((c) => c)).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
  }
  /** Test helper: simulate a manual edit made directly in the spreadsheet. */
  editCell(rowIndex0: number, column: string, value: string) {
    const col = this.data[0].indexOf(column);
    this.data[rowIndex0 + 1][col] = value;
  }
}

export class FakeSpreadsheet {
  sheets: FakeSheet[] = [new FakeSheet('ชีต1')];
  getId() { return 'fake-spreadsheet-id'; }
  getName() { return 'Iroad'; }
  getSheetByName(name: string) { return this.sheets.find((s) => s.name === name) || null; }
  insertSheet(name: string) { const s = new FakeSheet(name); this.sheets.push(s); return s; }
  getSheets() { return [...this.sheets]; }
  deleteSheet(s: FakeSheet) { this.sheets = this.sheets.filter((x) => x !== s); }
}

class FakeBlob {
  constructor(private bytes: number[], private type = 'application/octet-stream', private name = '') {}
  getBytes() { return [...this.bytes]; }
  getContentType() { return this.type; }
  getName() { return this.name; }
}

class FakeFile {
  trashed = false;
  description = '';
  constructor(public id: string, public blob: FakeBlob, public folder: FakeFolder) {}
  getId() { return this.id; }
  getBlob() { return this.blob; }
  setDescription(d: string) { this.description = d; return this; }
  setTrashed(t: boolean) { this.trashed = t; return this; }
  getThumbnail() { return null; }
}

class FakeFolder {
  folders: FakeFolder[] = [];
  files: FakeFile[] = [];
  constructor(public id: string, public name: string, private drive: FakeDrive) {}
  getId() { return this.id; }
  getUrl() { return 'https://drive.example/' + this.id; }
  createFolder(name: string) { const f = this.drive.newFolder(name); this.folders.push(f); return f; }
  getFoldersByName(name: string) {
    const list = this.folders.filter((f) => f.name === name);
    let i = 0;
    return { hasNext: () => i < list.length, next: () => list[i++] };
  }
  createFile(blob: FakeBlob) {
    const f = new FakeFile('file-' + randomUUID(), blob, this);
    this.files.push(f);
    this.drive.files.set(f.id, f);
    return f;
  }
}

class FakeDrive {
  folders = new Map<string, FakeFolder>();
  files = new Map<string, FakeFile>();
  newFolder(name: string) { const f = new FakeFolder('folder-' + randomUUID(), name, this); this.folders.set(f.id, f); return f; }
  createFolder(name: string) { return this.newFolder(name); }
  getFolderById(id: string) { const f = this.folders.get(id); if (!f) throw new Error('no folder'); return f; }
  getFileById(id: string) { const f = this.files.get(id); if (!f) throw new Error('no file'); return f; }
  activeFiles() { return [...this.files.values()].filter((f) => !f.trashed); }
}

export interface Backend {
  ctx: Record<string, any>;
  ss: FakeSpreadsheet;
  drive: FakeDrive;
  outbox: { to: string; subject: string; body: string }[];
  call: (action: string, payload?: Record<string, unknown>, token?: string) => { ok: boolean; data?: any; error?: { code: string; message: string; details?: any } };
  sheet: (name: string) => FakeSheet;
}

export function createBackend(): Backend {
  const ss = new FakeSpreadsheet();
  const drive = new FakeDrive();
  const props = new Map<string, string>();
  const cache = new Map<string, string>();
  const outbox: Backend['outbox'] = [];

  const ctx: Record<string, any> = {
    console: { log() {}, error() {}, warn() {} },
    Logger: { log() {} },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'SHA_256' },
      Charset: { UTF_8: 'UTF_8' },
      computeDigest: (_alg: string, input: unknown) => toSigned(createHash('sha256').update(toBuf(input)).digest()),
      computeHmacSha256Signature: (value: unknown, key: unknown) => toSigned(createHmac('sha256', toBuf(key)).update(toBuf(value)).digest()),
      base64Decode: (s: string) => {
        if (!/^[A-Za-z0-9+/]*={0,2}$/.test(s)) throw new Error('Could not decode string.');
        return toSigned(Buffer.from(s, 'base64'));
      },
      base64Encode: (bytes: number[]) => toBuf(bytes).toString('base64'),
      newBlob: (data: unknown, type?: string, name?: string) => new FakeBlob(toSigned(toBuf(data)), type, name),
      getUuid: () => randomUUID(),
    },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k: string) => props.get(k) ?? null, setProperty: (k: string, v: string) => props.set(k, v) }) },
    CacheService: { getScriptCache: () => ({ get: (k: string) => cache.get(k) ?? null, put: (k: string, v: string) => cache.set(k, v) }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    SpreadsheetApp: { getActiveSpreadsheet: () => ss },
    DriveApp: drive,
    ContentService: { MimeType: { JSON: 'JSON' }, createTextOutput: (s: string) => ({ setMimeType() { return this; }, getContent: () => s }) },
    MailApp: { sendEmail: (m: { to: string; subject: string; body: string }) => outbox.push(m) },
    Session: { getEffectiveUser: () => ({ getEmail: () => 'owner@example.com' }) },
  };
  vm.createContext(ctx);
  vm.runInContext(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../apps-script/dist/Code.gs'), 'utf8'), ctx, { filename: 'Code.gs' });
  vm.runInContext('LIMITS.pbkdf2Iterations = 500;', ctx); // keep tests fast; production uses 10000

  return {
    ctx,
    ss,
    drive,
    outbox,
    sheet: (name) => ss.getSheetByName(name)!,
    call: (action, payload = {}, token) => {
      // Round-trip through JSON exactly like an HTTP request would.
      const res = ctx.doPost({ postData: { contents: JSON.stringify({ action, payload, token }) } });
      return JSON.parse(res.getContent());
    },
  };
}
