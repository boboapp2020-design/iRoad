/**
 * Run once from the Apps Script editor (or the "Road Repair" menu):
 * creates the sheets, headers, protections, default settings and the
 * private Drive folder for original evidence. Safe to run again.
 */
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var props = PropertiesService.getScriptProperties();

  Object.keys(SCHEMA).forEach(function (name) {
    var cols = SCHEMA[name].columns;
    var sh = ss.getSheetByName(name) || ss.insertSheet(name);
    var existing = sh.getLastRow() >= 1 ? sh.getRange(1, 1, 1, cols.length).getValues()[0].map(fromCell) : [];
    var hasData = sh.getLastRow() >= 2;
    for (var c = 0; c < cols.length; c++) {
      if (hasData && existing[c] !== cols[c]) {
        throw new Error('Sheet "' + name + '" has data with unexpected headers; refusing to overwrite. Column ' + (c + 1) + ' should be ' + cols[c]);
      }
    }
    sh.getRange(1, 1, 1, cols.length).setValues([cols]);
    // Store every value as plain text so ISO dates / IDs are never auto-converted.
    sh.getRange(1, 1, sh.getMaxRows(), cols.length).setNumberFormat('@');
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, cols.length).setFontWeight('bold').setBackground('#e2e8f0');
    protectSheet(sh);
  });

  // Remove the default empty sheet (e.g. "Sheet1" / "ชีต1").
  ss.getSheets().forEach(function (sh) {
    if (!SCHEMA[sh.getName()] && sh.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(sh);
  });

  Db.reset();
  Object.keys(SETTINGS_DEFAULTS).forEach(function (key) {
    if (!Db.find('settings', function (r) { return r.key === key; })) {
      Db.insert('settings', [{ key: key, value: SETTINGS_DEFAULTS[key], updated_at: nowIso(), updated_by: 'setup' }]);
    }
  });

  var folderId = props.getProperty('EVIDENCE_FOLDER_ID');
  var folder = null;
  if (folderId) {
    try { folder = DriveApp.getFolderById(folderId); } catch (e) { folder = null; }
  }
  if (!folder) {
    folder = DriveApp.createFolder('Road Repair Evidence (private) - ' + ss.getName());
    props.setProperty('EVIDENCE_FOLDER_ID', folder.getId());
  }
  if (Db.all('audit_logs').length === 0) writeAudit({ action: 'system.setup', entity_type: 'system', details: { schema_version: SCHEMA_VERSION } });
  Logger.log('Setup complete. Evidence folder: ' + folder.getUrl());
  return { spreadsheet_id: ss.getId(), evidence_folder_id: folder.getId() };
}

/** Only the owner (the account the web app runs as) may edit the sheets. */
function protectSheet(sh) {
  var protection = sh.protect().setDescription('Road Repair Tracker: edit only through the app');
  var me = Session.getEffectiveUser();
  protection.addEditor(me);
  var editors = protection.getEditors();
  if (editors.length) protection.removeEditors(editors.filter(function (u) { return u.getEmail() !== me.getEmail(); }));
  if (protection.canDomainEdit()) protection.setDomainEdit(false);
}

/** Editor helper: createInitialAdmin('you@example.com', 'Your Name') — prints a one-time password. */
function createInitialAdmin(email, fullName) {
  var result = withLock(function () {
    return insertUser(normalizeEmail(email), String(fullName || 'Administrator').slice(0, 120), 'admin', '');
  });
  Logger.log('Admin created: ' + result.user.email + ' — temporary password: ' + result.tempPassword + ' (must be changed at first sign-in)');
  return { email: result.user.email, temporary_password: result.tempPassword };
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Road Repair')
    .addItem('1) ตั้งค่าระบบ / Setup', 'menuSetup')
    .addItem('2) สร้างผู้ดูแลระบบ / Create admin', 'menuCreateAdmin')
    .addItem('ตรวจสอบ audit log chain', 'menuVerifyAudit')
    .addToUi();
}

function menuSetup() {
  var r = setup();
  SpreadsheetApp.getUi().alert('ตั้งค่าเรียบร้อย / Setup complete\nEvidence folder id: ' + r.evidence_folder_id);
}

function menuCreateAdmin() {
  var ui = SpreadsheetApp.getUi();
  var email = ui.prompt('Admin email', ui.ButtonSet.OK_CANCEL);
  if (email.getSelectedButton() !== ui.Button.OK) return;
  var name = ui.prompt('Full name / ชื่อ-นามสกุล', ui.ButtonSet.OK_CANCEL);
  if (name.getSelectedButton() !== ui.Button.OK) return;
  var r = createInitialAdmin(email.getResponseText(), name.getResponseText());
  ui.alert('สร้างผู้ดูแลระบบแล้ว / Admin created\n\nEmail: ' + r.email + '\nรหัสผ่านชั่วคราว / Temporary password: ' + r.temporary_password +
    '\n\nจดไว้ตอนนี้ — จะไม่แสดงอีก / Copy it now; it will not be shown again.');
}

function menuVerifyAudit() {
  Db.reset();
  var r = actionVerifyAuditChain({}, { user: { role: 'admin' } });
  SpreadsheetApp.getUi().alert(r.intact ? 'Audit log intact (' + r.checked + ' entries)' : 'Audit log BROKEN at row ' + r.first_broken_row);
}
