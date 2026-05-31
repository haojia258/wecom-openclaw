'use strict';

/**
 * agent-heartbeat-check.js - P10.8 Agent Heartbeat Health Check Wrapper
 *
 * 轻量级健康检查封装，供编排引擎在调度前验证 agent 状态。
 * 依赖 agent-heartbeat-store 的同步 getAgentHealth 接口。
 */

var heartbeatStore = require('./agent-heartbeat-store');

var DEFAULT_AGENTS = ['codex', 'workbuddy', 'deepseek', 'doubao', 'openclaw-runtime'];

// ─── Input Validation Helpers ────────────────────────────

/**
 * Validate agent name for safety
 * @param {*} agentName
 * @returns {{ valid: boolean, error?: string }}
 */
function _validateAgentName(agentName) {
  if (agentName === null || agentName === undefined) {
    return { valid: false, error: 'Agent name is null or undefined' };
  }

  if (typeof agentName !== 'string') {
    return { valid: false, error: 'Agent name must be a string' };
  }

  if (agentName.trim() === '') {
    return { valid: false, error: 'Agent name is empty' };
  }

  // Path traversal rejection
  if (agentName.indexOf('..') !== -1 ||
      agentName.indexOf('/') !== -1 ||
      agentName.indexOf('\\') !== -1) {
    return { valid: false, error: 'Agent name contains path traversal characters' };
  }

  return { valid: true };
}

// ─── Core Health Check Function ─────────────────────────

/**
 * Check the health status of a single agent
 * @param {string} agentName
 * @returns {{ healthy: boolean, status: string, can_dispatch: boolean, detail: string, health: object|null }}
 */
function checkAgentHealth(agentName) {
  // Step 0: Input validation
  var validation = _validateAgentName(agentName);
  if (!validation.valid) {
    return {
      healthy: false,
      status: 'unknown',
      can_dispatch: false,
      detail: validation.error,
      health: null
    };
  }

  // Step 1: Query heartbeat store
  var result;
  try {
    result = heartbeatStore.getAgentHealth(agentName);
  } catch (e) {
    return {
      healthy: false,
      status: 'unknown',
      can_dispatch: false,
      detail: 'Heartbeat store query failed: ' + e.message,
      health: null
    };
  }

  // Step 2: No result or failure
  if (!result.success || !result.health) {
    return {
      healthy: false,
      status: 'unknown',
      can_dispatch: false,
      detail: 'Agent not found or health unknown',
      health: result.health || null
    };
  }

  // Step 3: Extract health object
  var health = result.health;

  // Step 4: Offline check
  if (!health.is_online) {
    return {
      healthy: false,
      status: 'offline',
      can_dispatch: false,
      detail: 'Agent ' + agentName + ' is offline (last seen: ' + health.last_seen + ')',
      health: health
    };
  }

  // Step 5: Degraded check
  if (health.status === 'degraded') {
    return {
      healthy: false,
      status: 'degraded',
      can_dispatch: false,
      detail: health.degraded_reason || ('Agent ' + agentName + ' is degraded'),
      health: health
    };
  }

  // Step 6: Cannot dispatch check
  if (!health.can_dispatch) {
    return {
      healthy: false,
      status: 'unhealthy',
      can_dispatch: false,
      detail: 'Agent ' + agentName + ' cannot dispatch (status: ' + health.status + ')',
      health: health
    };
  }

  // Step 7: Healthy
  return {
    healthy: true,
    status: 'healthy',
    can_dispatch: true,
    detail: 'Agent ' + agentName + ' is healthy',
    health: health
  };
}

// ─── Batch Health Check ──────────────────────────────────

/**
 * Check health of all default agents
 * @returns {{ all_healthy: boolean, agents: Array<object>, summary: object }}
 */
function checkAllAgentsHealth() {
  var agents = [];
  var summary = { total: DEFAULT_AGENTS.length, healthy: 0, unhealthy: 0, offline: 0, degraded: 0 };

  for (var i = 0; i < DEFAULT_AGENTS.length; i++) {
    var agentName = DEFAULT_AGENTS[i];
    var check = checkAgentHealth(agentName);

    agents.push({
      agent: agentName,
      healthy: check.healthy,
      status: check.status,
      can_dispatch: check.can_dispatch,
      detail: check.detail
    });

    if (check.status === 'healthy') {
      summary.healthy += 1;
    } else if (check.status === 'offline') {
      summary.offline += 1;
      summary.unhealthy += 1;
    } else if (check.status === 'degraded') {
      summary.degraded += 1;
      summary.unhealthy += 1;
    } else {
      summary.unhealthy += 1;
    }
  }

  return {
    all_healthy: summary.unhealthy === 0 && agents.length > 0,
    agents: agents,
    summary: summary
  };
}

// ─── Quick Dispatch Helper ───────────────────────────────

/**
 * Quick boolean check: can this agent accept new tasks?
 * @param {string} agentName
 * @returns {boolean}
 */
function isAgentDispatchable(agentName) {
  var result = checkAgentHealth(agentName);
  return result.healthy === true && result.can_dispatch === true;
}

// ─── Module Exports ─────────────────────────────────────

module.exports = {
  checkAgentHealth: checkAgentHealth,
  checkAllAgentsHealth: checkAllAgentsHealth,
  isAgentDispatchable: isAgentDispatchable
};
