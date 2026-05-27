'use strict';

const DEFAULT_REQUIRED = ['wecom-adapter', 'openclaw-ai-agent-host'];
const MB = 1024 * 1024;

function toNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function parseInput(input) {
  if (typeof input === 'string') return JSON.parse(input);
  return input;
}

function normalizePM2List(input) {
  const data = parseInput(input);
  const list = Array.isArray(data) ? data : data && Array.isArray(data.processes) ? data.processes : [];

  return list.map((item) => {
    const env = item.pm2_env || item.env || {};
    const monit = item.monit || {};
    const memory = item.memory != null ? item.memory : monit.memory;

    return {
      name: item.name || env.name || item.process || item.app || '',
      pmId: item.pm_id != null ? item.pm_id : env.pm_id,
      pid: item.pid,
      status: item.status || env.status || 'unknown',
      restarts: toNumber(
        item.restarts != null ? item.restarts : item.restart_time != null ? item.restart_time : env.restart_time,
        0
      ),
      unstableRestarts: toNumber(
        item.unstableRestarts != null ? item.unstableRestarts : item.unstable_restarts != null
          ? item.unstable_restarts
          : env.unstable_restarts,
        0
      ),
      user: item.user || item.username || env.user || env.username || '',
      uid: item.uid != null ? item.uid : env.uid,
      memory: toNumber(memory, 0)
    };
  });
}

function optionsWithDefaults(options) {
  const opts = options || {};
  const memoryLimitMB = toNumber(opts.memoryLimitMB != null ? opts.memoryLimitMB : opts.maxMemoryMB, 512);
  return {
    restartThreshold: toNumber(opts.restartThreshold, 10),
    unstableRestartThreshold: toNumber(opts.unstableRestartThreshold, 0),
    memoryThresholdBytes: toNumber(opts.memoryThresholdBytes, memoryLimitMB * MB),
    requiredProcesses: Array.isArray(opts.requiredProcesses) ? opts.requiredProcesses : DEFAULT_REQUIRED
  };
}

function add(anomalies, type, severity, process, message) {
  anomalies.push({ type, severity, process, message });
}

function detectPM2Anomalies(processes, options) {
  const opts = optionsWithDefaults(options);
  const list = Array.isArray(processes) ? processes : normalizePM2List(processes);
  const anomalies = [];
  const names = new Set(list.map((p) => p.name).filter(Boolean));

  list.forEach((p) => {
    const label = p.name || String(p.pmId != null ? p.pmId : 'unknown');

    if (p.status !== 'online') {
      add(anomalies, 'NON_ONLINE', 'critical', label, `${label} is ${p.status}, expected online`);
    }

    if (p.restarts > opts.restartThreshold) {
      add(
        anomalies,
        'HIGH_RESTARTS',
        'warning',
        label,
        `${label} restart count ${p.restarts} exceeds ${opts.restartThreshold}`
      );
    }

    if (p.unstableRestarts > opts.unstableRestartThreshold) {
      add(
        anomalies,
        'UNSTABLE_RESTARTS',
        'warning',
        label,
        `${label} unstable restarts ${p.unstableRestarts} exceeds ${opts.unstableRestartThreshold}`
      );
    }

    if (p.user === 'root' || p.uid === 0) {
      add(anomalies, 'ROOT_USER', 'warning', label, `${label} is running as root`);
    }

    if (p.memory > opts.memoryThresholdBytes) {
      add(
        anomalies,
        'HIGH_MEMORY',
        'warning',
        label,
        `${label} memory ${Math.round(p.memory / MB)}MB exceeds ${Math.round(opts.memoryThresholdBytes / MB)}MB`
      );
    }
  });

  opts.requiredProcesses.forEach((name) => {
    if (!names.has(name)) {
      add(anomalies, 'MISSING_PROCESS', 'critical', name, `${name} is missing from PM2 process list`);
    }
  });

  return anomalies;
}

function summarizePM2Health(result) {
  if (!result || !Array.isArray(result.anomalies)) return 'PM2 health unknown';
  if (result.anomalies.length === 0) return `PM2 healthy: ${result.processes.length} processes checked`;

  const critical = result.anomalies.filter((a) => a.severity === 'critical').length;
  const warning = result.anomalies.length - critical;
  return `PM2 ${result.status}: ${critical} critical, ${warning} warning anomalies`;
}

function checkPM2Status(input, options) {
  const processes = normalizePM2List(input);
  const anomalies = detectPM2Anomalies(processes, options);
  const hasCritical = anomalies.some((a) => a.severity === 'critical');
  const status = hasCritical ? 'critical' : anomalies.length ? 'degraded' : 'healthy';
  const result = {
    ok: anomalies.length === 0,
    status,
    processes,
    anomalies,
    summary: '',
    checkedAt: new Date().toISOString()
  };

  result.summary = summarizePM2Health(result);
  return result;
}

module.exports = {
  normalizePM2List,
  checkPM2Status,
  detectPM2Anomalies,
  summarizePM2Health
};
