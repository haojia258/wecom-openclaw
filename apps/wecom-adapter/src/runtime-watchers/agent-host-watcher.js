'use strict';

/**
 * Agent Host Watcher — HTTP health check (read-only)
 * Mock-first: pass {httpStatus, body, latencyMs, target} to bypass HTTP.
 * NEVER reads .env, NEVER sends Authorization headers.
 */

var DEFAULT_TARGET     = 'http://127.0.0.1:3002/health';
var EXPECTED_SERVICE   = 'openclaw-ai-agent-host';
var DEFAULT_LATENCY_MS = 1000;
var DEFAULT_TASK_MAX   = 100;
var DEFAULT_MEMORY_MB  = 256;

function normalizeAgentHostTarget(input) {
  if (!input) return DEFAULT_TARGET;
  if (typeof input === 'string') return input;
  return input.url || input.target || DEFAULT_TARGET;
}

function detectAgentHostAnomalies(result, options) {
  var opts      = options || {};
  var latencyMs = opts.latencyThresholdMs || DEFAULT_LATENCY_MS;
  var taskMax   = opts.taskCountThreshold != null ? opts.taskCountThreshold : DEFAULT_TASK_MAX;
  var memMax    = opts.memoryMBThreshold != null ? opts.memoryMBThreshold : DEFAULT_MEMORY_MB;
  var anomalies = [];
  function add(type, severity, message) {
    anomalies.push({ type: type, severity: severity, message: message });
  }

  // HTTP non-200
  if (result.httpStatus !== -1 && result.httpStatus !== 200) {
    add('HTTP_STATUS', 'critical', 'HTTP ' + result.httpStatus + ', expected 200');
  }
  // timeout
  if (result.httpStatus === -1 && result.latencyMs === -1) {
    add('TIMEOUT', 'critical', 'No response (timeout or unreachable)');
  }
  // invalid JSON
  var parsed = null;
  if (result.body != null) {
    try { parsed = typeof result.body === 'string' ? JSON.parse(result.body) : result.body; }
    catch (_) { add('INVALID_JSON', 'critical', 'Response body is not valid JSON'); }
  }
  if (parsed) {
    // status !== ok
    if (parsed.status && parsed.status !== 'ok') {
      add('STATUS_NOT_OK', 'critical', 'Health status "' + parsed.status + '", expected "ok"');
    }
    // wrong service
    if (parsed.service && parsed.service !== EXPECTED_SERVICE) {
      add('WRONG_SERVICE', 'critical', 'Service "' + parsed.service + '", expected "' + EXPECTED_SERVICE + '"');
    }
    // taskCount 超阈值
    if (typeof parsed.taskCount === 'number' && parsed.taskCount > taskMax) {
      add('HIGH_TASK_COUNT', 'warning', 'taskCount ' + parsed.taskCount + ' exceeds ' + taskMax);
    }
    // memoryMB 超阈值
    if (typeof parsed.memoryMB === 'number' && parsed.memoryMB > memMax) {
      add('HIGH_MEMORY', 'warning', 'memoryMB ' + parsed.memoryMB + ' exceeds ' + memMax + 'MB');
    }
  }
  // high latency
  if (result.latencyMs > latencyMs) {
    add('HIGH_LATENCY', 'warning', 'Latency ' + result.latencyMs + 'ms exceeds ' + latencyMs + 'ms');
  }
  return anomalies;
}

function summarizeAgentHostHealth(result) {
  if (!result || !Array.isArray(result.anomalies)) return 'Agent Host health unknown';
  if (result.anomalies.length === 0) return 'Agent Host healthy: ' + result.target;
  var critical = 0, i;
  for (i = 0; i < result.anomalies.length; i++) {
    if (result.anomalies[i].severity === 'critical') critical++;
  }
  return 'Agent Host ' + result.status + ': ' + critical + ' critical, ' +
    (result.anomalies.length - critical) + ' warning on ' + result.target;
}

function checkAgentHostHealth(target, options) {
  var opts       = options || {};
  var httpStatus, body, latencyMs, url;

  if (typeof target === 'object' && target !== null && 'httpStatus' in target) {
    httpStatus = target.httpStatus;
    body       = target.body;
    latencyMs  = target.latencyMs != null ? target.latencyMs : -1;
    url        = target.target || target.url || DEFAULT_TARGET;
  } else {
    url        = normalizeAgentHostTarget(target);
    httpStatus = -1;
    body       = null;
    latencyMs  = -1;
  }

  var result = {
    ok: true, status: 'healthy', target: url,
    latencyMs: latencyMs, httpStatus: httpStatus, body: body,
    anomalies: [], summary: '', checkedAt: new Date().toISOString()
  };

  result.anomalies = detectAgentHostAnomalies(result, opts);

  var hasCritical = false, i;
  for (i = 0; i < result.anomalies.length; i++) {
    if (result.anomalies[i].severity === 'critical') { hasCritical = true; break; }
  }
  result.ok     = !hasCritical;
  result.status = hasCritical ? 'critical' : result.anomalies.length > 0 ? 'degraded' : 'healthy';
  result.summary = summarizeAgentHostHealth(result);
  return result;
}

module.exports = {
  normalizeAgentHostTarget: normalizeAgentHostTarget,
  checkAgentHostHealth: checkAgentHostHealth,
  detectAgentHostAnomalies: detectAgentHostAnomalies,
  summarizeAgentHostHealth: summarizeAgentHostHealth
};
