// P46 Auth Gate Middleware
// Redirect unauthenticated users to /login
var sessionManager = require('./session-manager');
var url = require('url');

// Public paths that don't require authentication
var PUBLIC_PATHS = [
  '/login',
  '/login.html',
  '/api/auth/request-code',
  '/api/auth/verify-code',
  '/api/auth/me',
  '/api/auth/logout',
  '/api/status'
];

function isPublicPath(pathname) {
  for (var i = 0; i < PUBLIC_PATHS.length; i++) {
    if (pathname === PUBLIC_PATHS[i]) return true;
  }
  // Also allow static assets and api/auth/*
  if (pathname.indexOf('/api/auth/') === 0) return true;
  return false;
}

// Extract session token from cookies
function getTokenFromCookies(req) {
  var cookieHeader = req.headers.cookie;
  if (!cookieHeader) return null;
  var cookies = cookieHeader.split(';');
  for (var i = 0; i < cookies.length; i++) {
    var parts = cookies[i].trim().split('=');
    if (parts[0] === 'wcom_session') return parts[1];
  }
  return null;
}

// Auth middleware — returns { allowed: true } or { allowed: false, redirect: '...' }
function gatekeeper(req) {
  var pathname = url.parse(req.url).pathname;

  // Allow public paths
  if (isPublicPath(pathname)) return { allowed: true };

  // Allow static assets
  if (pathname.match(/\.(css|js|png|svg|ico|woff2?)$/)) return { allowed: true };

  // Check session
  var token = getTokenFromCookies(req);
  if (!token) return { allowed: false, redirect: '/login?redirect=' + encodeURIComponent(req.url) };

  var session = sessionManager.validateSession(token);
  if (!session.valid) return { allowed: false, redirect: '/login?redirect=' + encodeURIComponent(req.url) };

  return { allowed: true, userId: session.userId, token: token };
}

module.exports = { gatekeeper: gatekeeper, getTokenFromCookies: getTokenFromCookies };
