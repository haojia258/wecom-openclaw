// P46 Session Manager
// 12-hour session, Remember Me support
var fs = require('fs');
var path = require('path');
var crypto = require('crypto');

var SESSIONS_FILE = path.join(__dirname, 'storage', 'web-auth', 'sessions.json');
var SESSION_TTL_MS = 12 * 60 * 60 * 1000;         // 12 hours
var REMEMBER_TTL_MS = 7 * 24 * 60 * 60 * 1000;    // 7 days

function loadSessions() {
  try { return JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8')); } catch (e) { return {}; }
}

function saveSessions(data) {
  fs.writeFileSync(SESSIONS_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

// Create a new session
function createSession(userId, rememberMe) {
  var sessions = loadSessions();
  var token = generateToken();
  var now = Date.now();

  sessions[token] = {
    userId: userId,
    created: now,
    expires: now + (rememberMe ? REMEMBER_TTL_MS : SESSION_TTL_MS),
    rememberMe: !!rememberMe,
    lastActive: now
  };

  saveSessions(sessions);
  return { token: token, expires: sessions[token].expires, userId: userId };
}

// Validate a session token
function validateSession(token) {
  var sessions = loadSessions();
  var entry = sessions[token];
  var now = Date.now();

  if (!entry) return { valid: false, reason: 'not_found' };
  if (now > entry.expires) {
    delete sessions[token];
    saveSessions(sessions);
    return { valid: false, reason: 'expired' };
  }

  // Update last active
  entry.lastActive = now;
  saveSessions(sessions);

  return { valid: true, userId: entry.userId, expires: entry.expires, rememberMe: entry.rememberMe };
}

// Destroy a session
function destroySession(token) {
  var sessions = loadSessions();
  var entry = sessions[token];
  if (entry) {
    delete sessions[token];
    saveSessions(sessions);
    return { destroyed: true, userId: entry.userId };
  }
  return { destroyed: false };
}

// Clean expired sessions
function cleanExpiredSessions() {
  var sessions = loadSessions();
  var now = Date.now();
  var count = 0;
  Object.keys(sessions).forEach(function (token) {
    if (now > sessions[token].expires) { delete sessions[token]; count++; }
  });
  if (count > 0) saveSessions(sessions);
  return count;
}

module.exports = { createSession: createSession, validateSession: validateSession, destroySession: destroySession, cleanExpiredSessions: cleanExpiredSessions, SESSION_TTL_MS: SESSION_TTL_MS, REMEMBER_TTL_MS: REMEMBER_TTL_MS };
