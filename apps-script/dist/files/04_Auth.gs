/* Road Repair Tracker - 04_Auth.js (GENERATED; paste as its own file in the Apps Script editor) */
function getSetting(key) {
  var row = Db.find('settings', function (r) { return r.key === key; });
  if (row) return row.value;
  return Object.prototype.hasOwnProperty.call(SETTINGS_DEFAULTS, key) ? SETTINGS_DEFAULTS[key] : null;
}

/** Public projection of a user row — never includes credential fields. */
function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    email: u.email,
    full_name: u.full_name,
    role: u.role,
    active: u.active === 'TRUE',
    must_change_password: u.must_change_password === 'TRUE',
    created_at: u.created_at,
    updated_at: u.updated_at
  };
}

function userById(id) {
  return Db.byId('users', id);
}

function userByEmail(email) {
  return Db.find('users', function (r) { return r.email === email; });
}

function createSession(user, userAgent) {
  var token = randomToken();
  var ttlHours = Math.min(Math.max(Number(getSetting('session_ttl_hours')) || 12, 1), 72);
  var now = new Date();
  var expires = new Date(now.getTime() + ttlHours * 3600 * 1000);
  Db.insert('sessions', [{
    token_hash: sha256Hex(token),
    user_id: user.id,
    created_at: now.toISOString(),
    expires_at: expires.toISOString(),
    revoked_at: '',
    user_agent: String(userAgent || '').slice(0, 200)
  }]);
  return { token: token, expires_at: expires.toISOString() };
}

/**
 * Resolve the bearer token to an active user. Throws UNAUTHENTICATED for a
 * missing, unknown, expired or revoked session, or a disabled account.
 */
function authenticate(token) {
  if (typeof token !== 'string' || !/^[0-9a-f]{64}$/.test(token)) fail('UNAUTHENTICATED', 'Please sign in.');
  var hash = sha256Hex(token);
  var session = Db.find('sessions', function (r) { return r.token_hash === hash; });
  if (!session || session.revoked_at || Date.parse(session.expires_at) <= Date.now()) {
    fail('UNAUTHENTICATED', 'Your session has expired. Please sign in again.');
  }
  var user = userById(session.user_id);
  if (!user || user.active !== 'TRUE' || ROLES.indexOf(user.role) < 0) fail('UNAUTHENTICATED', 'Account is disabled.');
  return { user: user, session: session };
}

function requireRole(user, roles) {
  if (roles.indexOf(user.role) < 0) fail('FORBIDDEN', 'You do not have permission for this action.');
}

/* ------------------------------------------------------------- actions */

function actionLogin(p, ctx) {
  var email = normalizeEmail(p.email);
  var password = typeof p.password === 'string' ? p.password : '';
  // Throttle by email across requests (in addition to the per-account lockout).
  var cache = CacheService.getScriptCache();
  var throttleKey = 'login:' + sha256Hex(email).slice(0, 32);
  var attempts = Number(cache.get(throttleKey) || 0);
  if (attempts >= 20) fail('RATE_LIMITED', 'Too many sign-in attempts. Try again later.');
  cache.put(throttleKey, String(attempts + 1), 900);

  return withLock(function () {
    var user = userByEmail(email);
    var genericError = function () { fail('INVALID_CREDENTIALS', 'Incorrect email or password.'); };
    if (!user) {
      hashPassword(password || 'x', '00000000000000000000000000000000'); // equalize timing
      genericError();
    }
    if (user.locked_until && Date.parse(user.locked_until) > Date.now()) {
      fail('ACCOUNT_LOCKED', 'Too many failed attempts. Try again after ' + user.locked_until + '.');
    }
    if (!verifyPassword(password, user)) {
      var failed = (Number(user.failed_logins) || 0) + 1;
      var patch = { failed_logins: failed };
      if (failed >= LIMITS.maxFailedLogins) {
        patch.locked_until = new Date(Date.now() + LIMITS.lockMinutes * 60000).toISOString();
        patch.failed_logins = 0;
      }
      Db.update('users', user, patch, ['failed_logins', 'locked_until']);
      writeAudit({ actor_id: user.id, action: 'auth.login_failed', entity_type: 'user', entity_id: user.id, details: { locked: !!patch.locked_until } });
      genericError();
    }
    if (user.active !== 'TRUE' || ROLES.indexOf(user.role) < 0) fail('ACCOUNT_DISABLED', 'This account is disabled. Contact an administrator.');
    Db.update('users', user, { failed_logins: 0, locked_until: '' }, ['failed_logins', 'locked_until']);
    var s = createSession(user, p.user_agent);
    writeAudit({ actor_id: user.id, action: 'auth.login', entity_type: 'user', entity_id: user.id, details: {} });
    return { token: s.token, expires_at: s.expires_at, user: publicUser(user) };
  });
}

function actionLogout(p, ctx) {
  return withLock(function () {
    var auth = authenticate(p.token);
    var session = Db.find('sessions', function (r) { return r.token_hash === auth.session.token_hash; });
    Db.update('sessions', session, { revoked_at: nowIso() }, ['revoked_at']);
    return { signed_out: true };
  });
}

function actionMe(p, ctx) {
  return { user: publicUser(ctx.user) };
}

function actionChangePassword(p, ctx) {
  validateNewPassword(p.new_password);
  return withLock(function () {
    var user = userById(ctx.user.id);
    if (!verifyPassword(String(p.current_password || ''), user)) fail('INVALID_CREDENTIALS', 'Current password is incorrect.');
    var h = hashPassword(p.new_password);
    Db.update('users', user, {
      password_hash: h.hash, password_salt: h.salt, password_iterations: h.iterations,
      must_change_password: 'FALSE', password_changed_at: nowIso(), updated_at: nowIso()
    }, ['password_hash', 'password_salt', 'password_iterations', 'must_change_password', 'password_changed_at', 'updated_at']);
    revokeOtherSessions(user.id, ctx.session.token_hash);
    writeAudit({ actor_id: user.id, action: 'auth.password_changed', entity_type: 'user', entity_id: user.id, details: {} });
    return { changed: true };
  });
}

function revokeOtherSessions(userId, keepTokenHash) {
  Db.filter('sessions', function (r) {
    return r.user_id === userId && !r.revoked_at && r.token_hash !== keepTokenHash;
  }).forEach(function (s) {
    Db.update('sessions', s, { revoked_at: nowIso() }, ['revoked_at']);
  });
}

/**
 * Always responds the same way whether or not the email exists, so the
 * endpoint cannot be used to enumerate accounts.
 */
function actionRequestPasswordReset(p, ctx) {
  var email = normalizeEmail(p.email);
  var cache = CacheService.getScriptCache();
  var key = 'reset:' + sha256Hex(email).slice(0, 32);
  if (cache.get(key)) return { requested: true };
  cache.put(key, '1', 120);
  withLock(function () {
    var user = userByEmail(email);
    if (!user || user.active !== 'TRUE') return;
    var code = String(parseInt(randomToken().slice(0, 12), 16) % 1000000);
    while (code.length < 6) code = '0' + code;
    var now = new Date();
    Db.insert('password_resets', [{
      id: newId(), code_hash: sha256Hex(user.id + ':' + code), user_id: user.id,
      created_at: now.toISOString(),
      expires_at: new Date(now.getTime() + LIMITS.resetCodeMinutes * 60000).toISOString(), used_at: ''
    }]);
    MailApp.sendEmail({
      to: user.email,
      subject: 'Road Repair Tracker — รหัสรีเซ็ตรหัสผ่าน / Password reset code',
      body: 'รหัสรีเซ็ตรหัสผ่านของคุณคือ / Your reset code is: ' + code + '\n\n' +
        'รหัสนี้ใช้ได้ ' + LIMITS.resetCodeMinutes + ' นาที / Valid for ' + LIMITS.resetCodeMinutes + ' minutes.\n' +
        'หากคุณไม่ได้ร้องขอ โปรดละเว้นอีเมลนี้ / If you did not request this, ignore this email.'
    });
    writeAudit({ actor_id: user.id, action: 'auth.password_reset_requested', entity_type: 'user', entity_id: user.id, details: {} });
  });
  return { requested: true };
}

function actionResetPassword(p, ctx) {
  var email = normalizeEmail(p.email);
  var code = String(p.code || '').trim();
  validateNewPassword(p.new_password);
  return withLock(function () {
    var user = userByEmail(email);
    var invalid = function () { fail('INVALID_RESET_CODE', 'The reset code is invalid or has expired.'); };
    if (!user || !/^\d{6}$/.test(code)) invalid();
    var hash = sha256Hex(user.id + ':' + code);
    var reset = Db.find('password_resets', function (r) {
      return r.user_id === user.id && !r.used_at && Date.parse(r.expires_at) > Date.now() && safeEqual(r.code_hash, hash);
    });
    if (!reset) {
      var failed = (Number(user.failed_logins) || 0) + 1;
      Db.update('users', user, { failed_logins: failed }, ['failed_logins']);
      if (failed >= LIMITS.maxFailedLogins) {
        // Burn all outstanding codes after repeated guesses.
        Db.filter('password_resets', function (r) { return r.user_id === user.id && !r.used_at; }).forEach(function (r) {
          Db.update('password_resets', r, { used_at: nowIso() }, ['used_at']);
        });
        Db.update('users', user, { failed_logins: 0 }, ['failed_logins']);
      }
      invalid();
    }
    Db.update('password_resets', reset, { used_at: nowIso() }, ['used_at']);
    var h = hashPassword(p.new_password);
    Db.update('users', user, {
      password_hash: h.hash, password_salt: h.salt, password_iterations: h.iterations,
      must_change_password: 'FALSE', failed_logins: 0, locked_until: '', password_changed_at: nowIso(), updated_at: nowIso()
    }, ['password_hash', 'password_salt', 'password_iterations', 'must_change_password', 'failed_logins', 'locked_until', 'password_changed_at', 'updated_at']);
    revokeOtherSessions(user.id, null);
    writeAudit({ actor_id: user.id, action: 'auth.password_reset', entity_type: 'user', entity_id: user.id, details: {} });
    return { reset: true };
  });
}
