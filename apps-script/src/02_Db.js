/**
 * Minimal table layer over Google Sheets. Row 1 holds headers; every value
 * is stored as text. Reads are cached for the duration of one request.
 * All writes happen while the caller holds the script lock (see withLock).
 */
var Db = (function () {
  var ss_ = null;
  var cache_ = {};

  function spreadsheet() {
    if (ss_) return ss_;
    // Container-bound script: the bound spreadsheet is available in doPost too,
    // which lets the manifest request only the spreadsheets.currentonly scope.
    ss_ = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss_) fail('NOT_CONFIGURED', 'This script must be bound to the spreadsheet (Extensions > Apps Script).');
    return ss_;
  }

  function sheet(name) {
    var sh = spreadsheet().getSheetByName(name);
    if (!sh) fail('NOT_CONFIGURED', 'Missing sheet "' + name + '". Run setup() first.');
    return sh;
  }

  function columns(name) {
    if (!SCHEMA[name]) fail('INTERNAL', 'Unknown table ' + name);
    return SCHEMA[name].columns;
  }

  function all(name) {
    if (cache_[name]) return cache_[name];
    var sh = sheet(name);
    var cols = columns(name);
    var last = sh.getLastRow();
    var rows = [];
    if (last >= 2) {
      var header = sh.getRange(1, 1, 1, cols.length).getValues()[0].map(fromCell);
      for (var c = 0; c < cols.length; c++) {
        if (header[c] !== cols[c]) fail('SCHEMA_MISMATCH', 'Sheet "' + name + '" column ' + (c + 1) + ' should be "' + cols[c] + '"');
      }
      var values = sh.getRange(2, 1, last - 1, cols.length).getValues();
      for (var r = 0; r < values.length; r++) {
        var obj = { _row: r + 2 };
        for (var k = 0; k < cols.length; k++) obj[cols[k]] = fromCell(values[r][k]);
        rows.push(obj);
      }
    }
    cache_[name] = rows;
    return rows;
  }

  function find(name, predicate) {
    var rows = all(name);
    for (var i = 0; i < rows.length; i++) if (predicate(rows[i])) return rows[i];
    return null;
  }

  function filter(name, predicate) {
    return all(name).filter(predicate);
  }

  function byId(name, id) {
    if (!id) return null;
    return find(name, function (r) { return r.id === id; });
  }

  /** Append rows (array of plain objects). Returns the stored objects. */
  function insert(name, objs) {
    if (!objs.length) return [];
    var sh = sheet(name);
    var cols = columns(name);
    var start = Math.max(sh.getLastRow(), 1) + 1;
    var values = objs.map(function (o) {
      return cols.map(function (c) { return toCell(o[c]); });
    });
    sh.getRange(start, 1, values.length, cols.length).setValues(values);
    var stored = objs.map(function (o, i) {
      var row = { _row: start + i };
      cols.forEach(function (c) { row[c] = normalizedCell(o[c]); });
      return row;
    });
    if (cache_[name]) cache_[name] = cache_[name].concat(stored);
    return stored;
  }

  /**
   * Update selected columns of an existing row. `allowed` is the explicit
   * list of mutable columns — immutable evidence columns are never passed.
   */
  function update(name, row, patch, allowed) {
    var sh = sheet(name);
    var cols = columns(name);
    Object.keys(patch).forEach(function (key) {
      if (allowed.indexOf(key) < 0) fail('INTERNAL', 'Column ' + name + '.' + key + ' is not updatable');
      var c = cols.indexOf(key);
      if (c < 0) fail('INTERNAL', 'Unknown column ' + key);
      sh.getRange(row._row, c + 1, 1, 1).setValues([[toCell(patch[key])]]);
      row[key] = normalizedCell(patch[key]);
    });
    return row;
  }

  function reset() {
    cache_ = {};
    ss_ = null;
  }

  return { spreadsheet: spreadsheet, sheet: sheet, all: all, find: find, filter: filter, byId: byId, insert: insert, update: update, reset: reset };
})();

/** Run fn while holding the script-wide lock (serializes all writes). */
function withLock(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(LIMITS.lockWaitMs)) fail('BUSY', 'Server is busy, please retry.');
  try {
    Db.reset(); // re-read after acquiring the lock so decisions use fresh data
    return fn();
  } finally {
    lock.releaseLock();
  }
}

/** Hash of the immutable columns of an evidence record (tamper evidence). */
function recordHash(table, obj) {
  var cols = SCHEMA[table].hashed;
  var parts = cols.map(function (c) { return c + '=' + normalizedCell(obj[c]); });
  return sha256Hex(table + '|' + parts.join('|'));
}
