/* Road Repair Tracker - 01_Util.js (GENERATED; paste as its own file in the Apps Script editor) */
/** API error with a stable machine-readable code. */
function ApiError(code, message, details) {
  this.name = 'ApiError';
  this.code = code;
  this.message = message;
  this.details = details || null;
}
ApiError.prototype = Object.create(Error.prototype);
ApiError.prototype.constructor = ApiError;

function fail(code, message, details) {
  throw new ApiError(code, message, details);
}

function nowIso() {
  return new Date().toISOString();
}

function newId() {
  return Utilities.getUuid();
}

var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(v) {
  return typeof v === 'string' && UUID_RE.test(v);
}

function toUnsignedBytes(bytes) {
  var out = new Array(bytes.length);
  for (var i = 0; i < bytes.length; i++) out[i] = bytes[i] & 0xff;
  return out;
}

function bytesToHex(bytes) {
  var s = '';
  for (var i = 0; i < bytes.length; i++) {
    var b = bytes[i] & 0xff;
    s += (b < 16 ? '0' : '') + b.toString(16);
  }
  return s;
}

function sha256Hex(input) {
  return bytesToHex(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, input, Utilities.Charset.UTF_8));
}

function sha256HexBytes(bytes) {
  return bytesToHex(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes));
}

/** 64 hex chars of randomness derived from two random UUIDs. */
function randomToken() {
  return sha256Hex(Utilities.getUuid() + ':' + Utilities.getUuid() + ':' + new Date().getTime());
}

/** Constant-time string comparison for hashes. */
function safeEqual(a, b) {
  a = String(a);
  b = String(b);
  var diff = a.length ^ b.length;
  var n = Math.max(a.length, b.length);
  for (var i = 0; i < n; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

function parseJsonSafe(text, fallback) {
  if (text === '' || text === null || text === undefined) return fallback;
  try {
    return JSON.parse(text);
  } catch (e) {
    return fallback;
  }
}

/* ---------------------------------------------------------------- input */

function reqString(obj, key, opts) {
  opts = opts || {};
  var v = obj ? obj[key] : undefined;
  if (v === undefined || v === null || v === '') {
    if (opts.optional) return '';
    fail('VALIDATION_ERROR', key + ' is required', { field: key });
  }
  if (typeof v !== 'string') fail('VALIDATION_ERROR', key + ' must be a string', { field: key });
  v = v.trim();
  var max = opts.max || LIMITS.maxShortTextLength;
  if (v.length > max) fail('VALIDATION_ERROR', key + ' is too long (max ' + max + ')', { field: key });
  if (!opts.optional && v === '') fail('VALIDATION_ERROR', key + ' is required', { field: key });
  if (opts.min && v.length < opts.min) fail('VALIDATION_ERROR', key + ' is too short (min ' + opts.min + ')', { field: key });
  if (opts.oneOf && opts.oneOf.indexOf(v) < 0) fail('VALIDATION_ERROR', key + ' has an invalid value', { field: key });
  return v;
}

/** Optional finite number (null when absent). Never coerces missing values to 0. */
function optNumber(obj, key) {
  var v = obj ? obj[key] : undefined;
  if (v === undefined || v === null || v === '') return null;
  if (typeof v !== 'number' || !isFinite(v)) fail('VALIDATION_ERROR', key + ' must be a finite number', { field: key });
  return v;
}

function optTimestamp(obj, key) {
  var v = obj ? obj[key] : undefined;
  if (v === undefined || v === null || v === '') return null;
  var ms = typeof v === 'number' ? v : Date.parse(v);
  if (!isFinite(ms)) fail('VALIDATION_ERROR', key + ' must be a timestamp', { field: key });
  return new Date(ms).toISOString();
}

function normalizeEmail(email) {
  var e = String(email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) || e.length > 254) fail('VALIDATION_ERROR', 'Invalid email address', { field: 'email' });
  return e;
}

/* ---------------------------------------------------------------- cells */

/**
 * Serialize a value for storage. Everything is stored as plain text (the
 * sheets use the "@" number format) and strings that a spreadsheet could
 * interpret as a formula are prefixed with an apostrophe.
 */
function toCell(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (typeof v === 'number') return isFinite(v) ? String(v) : '';
  if (typeof v === 'object') v = JSON.stringify(v);
  v = String(v);
  if (/^[=+\-@\t\r]/.test(v)) return "'" + v;
  return v;
}

function fromCell(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString();
  v = String(v);
  // Undo the formula-escape apostrophe if the spreadsheet kept it literally.
  if (/^'[=+\-@\t\r]/.test(v)) v = v.slice(1);
  return v;
}

/** The exact string a value reads back as after a round trip through a cell. */
function normalizedCell(v) {
  return fromCell(toCell(v));
}

function cellNumber(v) {
  if (v === '' || v === null || v === undefined) return null;
  var n = Number(v);
  return isFinite(n) ? n : null;
}

function cellBool(v) {
  if (v === 'TRUE' || v === true) return true;
  if (v === 'FALSE' || v === false) return false;
  return null;
}
