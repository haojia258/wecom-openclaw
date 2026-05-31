'use strict';

/**
 * agent-heartbeat-store.js - P10.7 Agent Heartbeat In-Memory Store
 *
 * 内存级别的 agent 健康监控存储。
 * 心跳数据为临时数据（无需 SQLite 持久化）。
 *
 * 默认 agents: codex, workbuddy, deepseek, doubao, openclaw-runtime
 */

// ─── Internal Store ─────────────────────────────────────

var _agentStore = {};

var DEFAULT_AGENTS = ['codex', 'workbuddy', 'deepseek', 'doubao', 'openclaw-runtime'];

var DEFAULT_CAPABILITIES = {
  codex:             ['code.patch', 'test.run', 'git.diff', 'docs.write'],
  workbuddy:         ['server.audit', 'test.run', 'git.merge', 'pm2.restart', 'staging.deploy'],
  deepseek:          ['reasoning.review', 'risk.analysis', 'docs.write'],
  doubao:            ['copy.write', 'summary.write', 'customer.reply'],
  'openclaw-runtime': ['runtime.health', 'runtime.metrics', 'runtime.config']
};

var HEARTBEAT_TIMEOUT_SECONDS = 120;

// ─── Public API ─────────────────────────────────────────

/**
 * Register a heartbeat from an agent
 * @param {object} opts
 *   @prop {string} opts.agent
 *   @prop {string} [opts.status]
 *   @prop {number} [opts.active_tasks]
 *   @prop {number} [opts.cpu]
 *   @prop {number} [opts.memory]
 *   @prop {string} [opts.current_mission]
 *   @prop {number} [opts.error_count]
 * @returns {{ success: boolean, agent: object }}
 */
function recordHeartbeat(opts) {
  // 1. Validate agent name
  if (!opts || typeof opts.agent !== 'string' || opts.agent.trim() === '') {
    return { success: false, error: '无效的 agent 名称' };
  }

  var agentName = opts.agent.trim();

  // 检查 path traversal 字符
  if (agentName.indexOf('/') !== -1 || agentName.indexOf('\\') !== -1 ||
      agentName.indexOf('..') !== -1 || agentName.indexOf(':') !== -1) {
    return { success: false, error: 'agent 名称包含非法字符' };
  }

  // 2. Look up or create record
  var record = _agentStore[agentName];
  if (!record) {
    record = {
      agent: agentName,
      status: 'idle',
      last_seen: new Date().toISOString(),
      active_tasks: 0,
      cpu: 0.0,
      memory: 0.0,
      current_mission: null,
      capabilities: DEFAULT_CAPABILITIES[agentName] || [],
      degraded_reason: null,
      error_count: 0,
      total_heartbeats: 0
    };
    _agentStore[agentName] = record;
  }

  // 3. Update fields
  record.last_seen = new Date().toISOString();

  if (opts.cpu !== undefined && !isNaN(opts.cpu)) {
    record.cpu = Number(opts.cpu);
  }
  if (opts.memory !== undefined && !isNaN(opts.memory)) {
    record.memory = Number(opts.memory);
  }
  if (opts.active_tasks !== undefined && !isNaN(opts.active_tasks)) {
    record.active_tasks = Number(opts.active_tasks);
  }
  if (opts.current_mission !== undefined) {
    record.current_mission = opts.current_mission;
  }
  if (opts.error_count !== undefined && !isNaN(opts.error_count)) {
    record.error_count = Number(opts.error_count);
  }

  // 4. Increment total_heartbeats
  record.total_heartbeats += 1;

  // 5. Derive status
  if (opts.status) {
    record.status = opts.status;
  } else {
    record.status = _deriveStatus(record);
  }

  return { success: true, agent: record };
}

/**
 * Get all agents
 * @returns {{ success: boolean, agents: Array<object>, total: number }}
 */
function listAgents() {
  var agents = [];
  var keys = Object.keys(_agentStore);

  for (var i = 0; i < keys.length; i++) {
    // Re-derive status on read
    _agentStore[keys[i]].status = _deriveStatus(_agentStore[keys[i]]);
    agents.push(_agentStore[keys[i]]);
  }

  return { success: true, agents: agents, total: agents.length };
}

/**
 * Get single agent
 * @param {string} agentName
 * @returns {{ success: boolean, agent?: object, error?: string }}
 */
function getAgent(agentName) {
  if (!agentName || typeof agentName !== 'string') {
    return { success: false, error: '无效的 agent 名称' };
  }

  var record = _agentStore[agentName];
  if (!record) {
    return { success: false, error: 'Agent 不存在: ' + agentName };
  }

  // Re-derive status
  record.status = _deriveStatus(record);

  return { success: true, agent: record };
}

/**
 * Get agent health report
 * @param {string} agentName
 * @returns {{ success: boolean, health?: object, error?: string }}
 */
function getAgentHealth(agentName) {
  if (!agentName || typeof agentName !== 'string') {
    return { success: false, error: '无效的 agent 名称' };
  }

  var record = _agentStore[agentName];
  if (!record) {
    return { success: false, error: 'Agent 不存在: ' + agentName };
  }

  // Re-derive status
  record.status = _deriveStatus(record);

  var lastSeenMs = new Date(record.last_seen).getTime();
  var uptimeSeconds = Math.floor((Date.now() - lastSeenMs) / 1000);
  var isOnline = !_isTimedOut(record.last_seen);
  var isHealthy = record.status !== 'offline' && record.status !== 'degraded';

  var canDispatch = record.status !== 'offline' && record.status !== 'degraded';

  var warnings = [];
  if (record.status === 'degraded') {
    warnings.push('Agent 已降级，谨慎调度');
    record.degraded_reason = record.degraded_reason || 'error_count 超过阈值';
  }
  if (record.status === 'offline') {
    warnings.push('Agent 已离线，无法调度');
  }
  if (_isTimedOut(record.last_seen) && record.status !== 'offline') {
    warnings.push('Agent 最近未响应心跳');
  }

  return {
    success: true,
    health: {
      agent: record.agent,
      status: record.status,
      last_seen: record.last_seen,
      uptime_seconds: uptimeSeconds,
      active_tasks: record.active_tasks,
      cpu: record.cpu,
      memory: record.memory,
      current_mission: record.current_mission,
      capabilities: record.capabilities,
      degraded_reason: record.degraded_reason,
      error_count: record.error_count,
      total_heartbeats: record.total_heartbeats,
      is_online: isOnline,
      is_healthy: isHealthy,
      can_dispatch: canDispatch,
      warnings: warnings
    }
  };
}

// ─── Internal Helpers ───────────────────────────────────

/**
 * Derive agent status based on rules
 * Rules (priority order):
 * 1. last_seen > 120s → offline
 * 2. error_count > 5 → degraded
 * 3. active_tasks > 0 → busy
 * 4. otherwise → idle
 */
function _deriveStatus(record) {
  if (_isTimedOut(record.last_seen)) return 'offline';
  if (record.error_count > 5) return 'degraded';
  if (record.active_tasks > 0) return 'busy';
  return 'idle';
}

/**
 * Check if last_seen is within threshold
 * @param {string} lastSeen - ISO timestamp
 * @returns {boolean} - true if timed out
 */
function _isTimedOut(lastSeen) {
  if (!lastSeen) return true;
  var lastSeenMs = new Date(lastSeen).getTime();
  var now = Date.now();
  return (now - lastSeenMs) / 1000 > HEARTBEAT_TIMEOUT_SECONDS;
}

/**
 * Initialize default agents
 */
function _initDefaults() {
  for (var i = 0; i < DEFAULT_AGENTS.length; i++) {
    var name = DEFAULT_AGENTS[i];
    if (!_agentStore[name]) {
      _agentStore[name] = {
        agent: name,
        status: 'idle',
        last_seen: new Date().toISOString(),
        active_tasks: 0,
        cpu: 0.0,
        memory: 0.0,
        current_mission: null,
        capabilities: DEFAULT_CAPABILITIES[name] || [],
        degraded_reason: null,
        error_count: 0,
        total_heartbeats: 0
      };
    }
  }
}

// ─── Module Exports ─────────────────────────────────────

module.exports = {
  recordHeartbeat: recordHeartbeat,
  listAgents: listAgents,
  getAgent: getAgent,
  getAgentHealth: getAgentHealth,
  _deriveStatus: _deriveStatus,
  _isTimedOut: _isTimedOut,
  _initDefaults: _initDefaults,
  _reset: function() {
    _agentStore = {};
    _initDefaults();
  },

  /**
   * [TEST ONLY] 手动设置 agent 的 last_seen，用于模拟离线状态
   * @param {string} agentName
   * @param {string} isoTime - ISO 8601 时间字符串，如 new Date(0).toISOString()
   */
  _setAgentLastSeen: function(agentName, isoTime) {
    var record = _agentStore[agentName];
    if (record) {
      record.last_seen = isoTime;
    }
  }
};

// Initialize defaults at load time
_initDefaults();
