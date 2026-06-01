// P46 WeCom Verify Code Manager
// 6-digit code, 5-min expiry, 5 attempts, 15-min lockout
var fs = require('fs');
var path = require('path');
var crypto = require('crypto');

var CODES_FILE = path.join(__dirname, 'storage', 'web-auth', 'verify-codes.json');
var CODE_LENGTH = 6;
var CODE_EXPIRY_MS = 5 * 60 * 1000;       // 5 minutes
var MAX_ATTEMPTS = 5;
var LOCKOUT_MS = 15 * 60 * 1000;           // 15 minutes

function loadCodes() {
  try { return JSON.parse(fs.readFileSync(CODES_FILE, 'utf8')); } catch (e) { return {}; }
}

function saveCodes(data) {
  fs.writeFileSync(CODES_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function generateCode() {
  var code = '';
  for (var i = 0; i < CODE_LENGTH; i++) { code += Math.floor(Math.random() * 10); }
  return code;
}

// Generate and store a verification code for a user
function createCode(userId) {
  var codes = loadCodes();
  var entry = codes[userId];
  var now = Date.now();

  // Check if locked
  if (entry && entry.lockedUntil && now < entry.lockedUntil) {
    var remaining = Math.ceil((entry.lockedUntil - now) / 1000 / 60);
    return { error: 'locked', message: 'Account locked. Try again in ' + remaining + ' minutes.', lockedUntil: entry.lockedUntil };
  }

  var code = generateCode();
  codes[userId] = {
    code: code,
    created: now,
    expires: now + CODE_EXPIRY_MS,
    attempts: 0,
    lockedUntil: null
  };
  saveCodes(codes);

  return { success: true, code: code, expires: codes[userId].expires, message: 'Verification code sent to WeCom' };
}

// Verify code against stored entry
function verifyCode(userId, inputCode) {
  var codes = loadCodes();
  var entry = codes[userId];
  var now = Date.now();

  if (!entry) {
    return { verified: false, reason: 'no_code', message: 'No verification code found. Please request a new one.' };
  }

  // Check lockout
  if (entry.lockedUntil && now < entry.lockedUntil) {
    var remaining = Math.ceil((entry.lockedUntil - now) / 1000 / 60);
    return { verified: false, reason: 'locked', message: 'Account locked. Try again in ' + remaining + ' minutes.' };
  }

  // Check expiry
  if (now > entry.expires) {
    // Clear expired code
    delete codes[userId];
    saveCodes(codes);
    return { verified: false, reason: 'expired', message: 'Verification code expired. Please request a new one.' };
  }

  // Check code
  if (entry.code !== inputCode) {
    entry.attempts++;

    // Lock if exceeded max attempts
    if (entry.attempts >= MAX_ATTEMPTS) {
      entry.lockedUntil = now + LOCKOUT_MS;
      saveCodes(codes);
      return { verified: false, reason: 'locked', message: 'Too many failed attempts. Account locked for 15 minutes.', attempts: entry.attempts };
    }

    saveCodes(codes);
    var remaining = MAX_ATTEMPTS - entry.attempts;
    return { verified: false, reason: 'wrong_code', message: 'Invalid code. ' + remaining + ' attempts remaining.', attempts: entry.attempts };
  }

  // Success — clear the code
  delete codes[userId];
  saveCodes(codes);

  return { verified: true, message: 'Verification successful' };
}

// Reset lockout for a user (admin action)
function resetLockout(userId) {
  var codes = loadCodes();
  if (codes[userId]) {
    codes[userId].attempts = 0;
    codes[userId].lockedUntil = null;
    saveCodes(codes);
  }
}

module.exports = { createCode: createCode, verifyCode: verifyCode, resetLockout: resetLockout, CODE_EXPIRY_MS: CODE_EXPIRY_MS, MAX_ATTEMPTS: MAX_ATTEMPTS, LOCKOUT_MS: LOCKOUT_MS };
