/**
 * Action tables are built lazily (at request time), so the order in which the
 * script files are loaded in the Apps Script editor does not matter.
 */
function publicActions() {
  return {
    login: actionLogin,
    requestPasswordReset: actionRequestPasswordReset,
    resetPassword: actionResetPassword,
    logout: actionLogout
  };
}

/** Actions requiring a valid session (role checks happen inside each action). */
function authActions() {
  return {
  me: actionMe,
  changePassword: actionChangePassword,
  getSettings: actionGetSettings,
  stats: actionStats,
  listJobs: actionListJobs,
  getJob: actionGetJob,
  reportData: actionReportData,
  createJob: actionCreateJob,
  updateJob: actionUpdateJob,
  markRepairDone: actionMarkRepairDone,
  cancelJob: actionCancelJob,
  deleteJob: actionDeleteJob,
  assignJob: actionAssignJob,
  submitCapture: actionSubmitCapture,
  getPhoto: actionGetPhoto,
  reviewJob: actionReviewJob,
  listUsers: actionListUsers,
  listInspectors: actionListInspectors,
  createUser: actionCreateUser,
  updateUser: actionUpdateUser,
  resetUserPassword: actionResetUserPassword,
  updateSetting: actionUpdateSetting,
  listAudit: actionListAudit,
  verifyAuditChain: actionVerifyAuditChain,
  invalidateEvidence: actionInvalidateEvidence,
  checkEvidenceIntegrity: actionCheckEvidenceIntegrity,
  purgeRepairData: actionPurgeRepairData
  };
}

/** Allowed while the user still has to replace a temporary password. */
var PASSWORD_CHANGE_ALLOWED = ['me', 'changePassword', 'getSettings'];

function jsonOutput(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Single entry point. The browser sends a text/plain POST (no CORS
 * preflight) with a JSON body: { action, token?, payload? }.
 * Apps Script cannot set HTTP status codes, so errors are { ok:false, error }.
 */
function handleRequest(body) {
  Db.reset();
  try {
    if (!body || typeof body !== 'object') fail('BAD_REQUEST', 'Invalid request body.');
    var action = body.action;
    var payload = body.payload && typeof body.payload === 'object' ? body.payload : {};
    if (typeof action !== 'string') fail('BAD_REQUEST', 'Missing action.');
    var data;
    var pub = publicActions();
    var priv = authActions();
    if (Object.prototype.hasOwnProperty.call(pub, action)) {
      if (action === 'logout') payload.token = body.token;
      data = pub[action](payload, {});
    } else if (Object.prototype.hasOwnProperty.call(priv, action)) {
      var auth = authenticate(body.token);
      if (auth.user.must_change_password === 'TRUE' && PASSWORD_CHANGE_ALLOWED.indexOf(action) < 0) {
        fail('PASSWORD_CHANGE_REQUIRED', 'Please set a new password before continuing.');
      }
      data = priv[action](payload, { user: auth.user, session: auth.session });
    } else {
      fail('UNKNOWN_ACTION', 'Unknown action.');
    }
    return { ok: true, data: data };
  } catch (e) {
    if (e instanceof ApiError) return { ok: false, error: { code: e.code, message: e.message, details: e.details } };
    console.error(e && e.stack ? e.stack : e);
    return { ok: false, error: { code: 'INTERNAL', message: 'Unexpected server error. Please retry.' } };
  }
}

function doPost(e) {
  var body = null;
  try {
    body = JSON.parse(e && e.postData ? e.postData.contents : '');
  } catch (err) {
    return jsonOutput({ ok: false, error: { code: 'BAD_REQUEST', message: 'Body must be JSON.' } });
  }
  return jsonOutput(handleRequest(body));
}

/** Health check only. Never returns data. */
function doGet() {
  return jsonOutput({ ok: true, data: { app: 'road-repair-tracker', version: APP_VERSION, schema: SCHEMA_VERSION, rules: RRVerify.CURRENT_RULES.version } });
}
