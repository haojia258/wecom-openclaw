'use strict';

/**
 * Gateway Watcher — HTTP health check (read-only)
 *
 * Supports mock injection: pass {httpStatus, body, latencyMs, target}
 * as the first argument to bypass real HTTP calls.
 *
 * NEVER reads .env, NEVER sends Authorization headers.
 */

var DEFAULT_TARGET = 'http://127.0.0.1:3001/health';
var DEFAULT_LATENCY_MS = 1000;

// ─── normalizeGatewayTarget ────────────────────────────────

function normalizeGatewayTarget(input) {
  if (!input) return DEFAULT_TARGET;
  if (typeof input === 'string') return input;
  return input.url || input.target || DEFAULT_TARGET;
}

// ─── detectGatewayAnomalies ────────────────────────────────

function detectGatewayAnomalies(result, options) {
  var opts = options || {};
  var threshold = opts.latencyThresholdMs || DEFAULT_LATENCY_MS;
  var anomalies = [];

  function add(type, severity, message) {
    anomalies.push({ type: type, severity: severity, message: message });
  }

  // 1. HTTP non-200
  if (result.httpStatus !== -1 && result.httpStatus !== 200) {
    add('HTTP_STATUS', 'critical', 'HTTP ' + result.httpStatus + ', expected 200');
  }

  // 2. timeout / unreachable
  if (result.httpStatus === -1 && result.latencyMs === -1) {
    add('TIMEOUT', 'critical', 'No response (timeout or unreachable)');
  }

  // 3. invalid JSON
  var parsed = null;
  if (result.body != null) {
    try {
      parsed = typeof result.body === 'string' ? JSON.parse(result.body) : result.body;
    } catch (_) {
      add('INVALID_JSON', 'critical', 'Response body is not valid JSON');
    }
  }

  // 4. status !== ok  /  6. version missing
  if (parsed) {
    if (parsed.status && parsed.status !== 'ok') {
      add('STATUS_NOT_OK', 'critical', 'Health status "' + parsed.status + '", expected "ok"');
    }
    if (!parsed.version) {
      add('MISSING_VERSION', 'warning', 'Health response missing "version" field');
    }
  }

  // 5. high latency
  if (result.latencyMs > threshold) {
    add('HIGH_LATENCY', 'warning',
      'Latency ' + result.latencyMs + 'ms exceeds ' + threshold + 'ms threshold');
  }

  return anomalies;
}

// ─── summarizeGatewayHealth ────────────────────────────────

function summarizeGatewayHealth(result) {
  if (!result || !Array.isArray(result.anomalies)) return 'Gateway health unknown';
  if (result.anomalies.length === 0) return 'Gateway healthy: ' + result.target;

  var critical = 0;
  for (var i = 0; i < result.anomalies.length; i++) {
    if (result.anomalies[i].severity === 'critical') critical++;
  }
  return 'Gateway ' + result.status + ': ' + critical + ' critical, ' +
    (result.anomalies.length - critical) + ' warning on ' + result.target;
}

// ─── checkGatewayHealth ────────────────────────────────────

function checkGatewayHealth(target, options) {
  var opts = options || {};
  var threshold = opts.latencyThresholdMs || DEFAULT_LATENCY_MS;

  var httpStatus, body, latencyMs, url;

  if (typeof target === 'object' && target !== null && 'httpStatus' in target) {
    // Mock / pre-fetched mode
    httpStatus = target.httpStatus;
    body       = target.body;
    latencyMs  = target.latencyMs != null ? target.latencyMs : -1;
    url        = target.target || target.url || DEFAULT_TARGET;
  } else {
    // URL mode — normalize only (caller does actual fetch)
    url        = normalizeGatewayTarget(target);
    httpStatus = -1;
    body       = null;
    latencyMs  = -1;
  }

  var result = {
    ok:        true,
    status:    'healthy',
    target:    url,
    latencyMs: latencyMs,
    httpStatus: httpStatus,
    body:      body,
    anomalies: [],
    summary:   '',
    checkedAt: new Date().toISOString()
  };

  result.anomalies = detectGatewayAnomalies(result, opts);

  var hasCritical = false;
  for (var i = 0; i < result.anomalies.length; i++) {
    if (result.anomalies[i].severity === 'critical') { hasCritical = true; break; }
  }
  result.ok     = !hasCritical;
  result.status = hasCritical ? 'critical'
                : result.anomalies.length > 0 ? 'degraded'
                : 'healthy';
  result.summary = summarizeGatewayHealth(result);
  return result;
}

module.exports = {
  normalizeGatewayTarget: normalizeGatewayTarget,
  checkGatewayHealth: checkGatewayHealth,
  detectGatewayAnomalies: detectGatewayAnomalies,
  summarizeGatewayHealth: summarizeGatewayHealth
};
