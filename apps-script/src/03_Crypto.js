/**
 * PBKDF2-HMAC-SHA256 implemented on Utilities.computeHmacSha256Signature
 * (Apps Script has no native PBKDF2). Byte arrays from Apps Script are
 * signed Java bytes; values are masked to 0..255 where it matters.
 */
function pbkdf2Sha256(passwordBytes, saltBytes, iterations, dkLen) {
  dkLen = dkLen || 32;
  var blocks = Math.ceil(dkLen / 32);
  var out = [];
  for (var block = 1; block <= blocks; block++) {
    var msg = saltBytes.concat([(block >>> 24) & 0xff, (block >>> 16) & 0xff, (block >>> 8) & 0xff, block & 0xff]);
    var u = Utilities.computeHmacSha256Signature(toSignedBytes(msg), toSignedBytes(passwordBytes));
    var t = toUnsignedBytes(u);
    for (var i = 1; i < iterations; i++) {
      u = Utilities.computeHmacSha256Signature(u, toSignedBytes(passwordBytes));
      for (var j = 0; j < t.length; j++) t[j] ^= u[j] & 0xff;
    }
    out = out.concat(t);
  }
  return out.slice(0, dkLen);
}

function toSignedBytes(bytes) {
  return bytes.map(function (b) { b = b & 0xff; return b > 127 ? b - 256 : b; });
}

function utf8Bytes(str) {
  return toUnsignedBytes(Utilities.newBlob(String(str)).getBytes());
}

function hexToBytes(hex) {
  var out = [];
  for (var i = 0; i < hex.length; i += 2) out.push(parseInt(hex.substr(i, 2), 16));
  return out;
}

function hashPassword(password, saltHex, iterations) {
  saltHex = saltHex || randomToken().slice(0, 32);
  iterations = iterations || LIMITS.pbkdf2Iterations;
  var dk = pbkdf2Sha256(utf8Bytes(password), hexToBytes(saltHex), iterations, 32);
  return { hash: bytesToHex(dk), salt: saltHex, iterations: iterations };
}

function verifyPassword(password, user) {
  if (!user.password_hash || !user.password_salt) return false;
  var iterations = Number(user.password_iterations) || LIMITS.pbkdf2Iterations;
  var h = hashPassword(password, user.password_salt, iterations);
  return safeEqual(h.hash, user.password_hash);
}

function validateNewPassword(password) {
  if (typeof password !== 'string' || password.length < LIMITS.minPasswordLength) {
    fail('WEAK_PASSWORD', 'Password must be at least ' + LIMITS.minPasswordLength + ' characters.');
  }
  if (password.length > 256) fail('WEAK_PASSWORD', 'Password is too long.');
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    fail('WEAK_PASSWORD', 'Password must contain letters and numbers.');
  }
}

/** Human-friendly random temporary password (letters + digits). */
function generateTempPassword() {
  var alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  var bytes = hexToBytes(randomToken());
  var s = '';
  for (var i = 0; i < 14; i++) s += alphabet[bytes[i] % alphabet.length];
  return s.slice(0, 7) + '-' + s.slice(7) + '7';
}
