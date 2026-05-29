'use strict';

/**
 * autonomous-loop-policy.js - P10.8 自治执行策略引擎
 *
 * 职责:
 *   - evaluateAutonomousPolicy(node, context) - 评估节点是否可自主执行
 *   - 阻断规则: deploy.production, pm2.restart, env.write,
 *               nginx.modify, secrets.write, offline/degraded agent
 *
 * 依赖:
 *   - capability-registry (P10.4)
 *   - agent-heartbeat-store (P10.7)
 */

var capabilityRegistry = require('../agent-governance/capability-registry');
var heartbeatStore = require('./agent-heartbeat-store');

// ─── 常量 ──────────────────────────────────────────────────

var POLICY_RESULT_BLOCKED = 'blocked';
var POLICY_RESULT_FAILED  = 'failed';
var POLICY_RESULT_ALLOWED = 'allowed';
var POLICY_RESULT_WARNING = 'warning';

var PRODUCTION_SENSITIVE_CAPABILITIES = [
  'deploy.production',
  'pm2.restart',
  'staging.deploy',
  'server.write',
  'git.merge'
];

// ─── Public API ─────────────────────────────────────────────

/**
 * 评估节点是否可以自主执行
 *
 * @param {object} node - graph node (id, agent, capability, requiresApproval?)
 * @param {object} context - 执行上下文
 *   @prop {string} graphId
 *   @prop {object} graph - 所属 graph
 * @returns {{ result: string, reason: string, details: object }}
 *   result: 'allowed' | 'blocked' | 'failed' | 'warning'
 */
function evaluateAutonomousPolicy(node, context) {
  if (!node) {
    return {
      result: POLICY_RESULT_FAILED,
      reason: '节点为空',
      details: {}
    };
  }

  var agent = node.agent || '';
  var capability = node.capability || '';

  // 1. 检查是否明确标记为需要审批
  if (node.requiresApproval === true) {
    return {
      result: POLICY_RESULT_BLOCKED,
      reason: 'Node requires explicit approval (requiresApproval=true)',
      details: { node_id: node.id, agent: agent, capability: capability, block_type: 'requires_approval' }
    };
  }

  // 2. Agent health check (优先于 capability registry，确保未注册 agent 被正确拦截)
  if (agent) {
    var health = heartbeatStore.getAgentHealth(agent);

    // 2a. agent not found (not registered) → blocked
    if (!health.success) {
      return {
        result: POLICY_RESULT_BLOCKED,
        reason: 'Agent not found in heartbeat store: ' + agent + ' - ' + (health.error || 'unknown'),
        details: {
          node_id: node.id, agent: agent, capability: capability,
          block_type: 'agent_not_found'
        }
      };
    }

    // 2b. agent offline → blocked
    if (health.success && health.health && health.health.status === 'offline') {
      return {
        result: POLICY_RESULT_BLOCKED,
        reason: 'Agent is offline: ' + agent,
        details: {
          node_id: node.id, agent: agent, capability: capability,
          block_type: 'agent_offline',
          agent_status: health.health.status,
          last_seen: health.health.last_seen
        }
      };
    }

    // 2c. agent degraded + production-sensitive capability → blocked
    if (health.success && health.health && health.health.status === 'degraded') {
      if (capability && _isProductionSensitive(capability)) {
        return {
          result: POLICY_RESULT_BLOCKED,
          reason: 'Agent is degraded and capability is production-sensitive: ' + capability,
          details: {
            node_id: node.id, agent: agent, capability: capability,
            block_type: 'agent_degraded_sensitive',
            agent_status: health.health.status,
            degraded_reason: health.health.degraded_reason || 'unknown'
          }
        };
      } else {
        // degraded + non-sensitive → warning but allowed
        return {
          result: POLICY_RESULT_WARNING,
          reason: 'Agent is degraded but capability is non-sensitive, proceeding with caution',
          details: {
            node_id: node.id, agent: agent, capability: capability,
            block_type: 'agent_degraded_warning',
            agent_status: health.health.status,
            degraded_reason: health.health.degraded_reason || 'unknown'
          }
        };
      }
    }
  }

  // 3. 通过 capability registry 检查（agent 已确认存在且在线）
  if (agent && capability) {
    var dispatchResult = capabilityRegistry.validateDispatch(agent, capability);

    // 3a. forbidden capability → failed
    if (!dispatchResult.allowed) {
      return {
        result: POLICY_RESULT_FAILED,
        reason: 'Forbidden capability: ' + dispatchResult.reason,
        details: {
          node_id: node.id, agent: agent, capability: capability,
          block_type: 'forbidden',
          dispatch_reason: dispatchResult.reason,
          checked_at: dispatchResult.checked_at
        }
      };
    }

    // 3b. requiresApproval → blocked
    if (dispatchResult.requiresApproval) {
      return {
        result: POLICY_RESULT_BLOCKED,
        reason: 'Capability requires approval: ' + dispatchResult.reason,
        details: {
          node_id: node.id, agent: agent, capability: capability,
          block_type: 'requires_approval',
          dispatch_reason: dispatchResult.reason,
          checked_at: dispatchResult.checked_at
        }
      };
    }
  }

  // 4. All checks passed → allowed
  return {
    result: POLICY_RESULT_ALLOWED,
    reason: 'All policy checks passed',
    details: {
      node_id: node.id, agent: agent, capability: capability,
      block_type: 'none'
    }
  };
}

/**
 * 检查是否为生产敏感能力
 *
 * @param {string} capability
 * @returns {boolean}
 */
function _isProductionSensitive(capability) {
  for (var i = 0; i < PRODUCTION_SENSITIVE_CAPABILITIES.length; i++) {
    if (capability === PRODUCTION_SENSITIVE_CAPABILITIES[i]) {
      return true;
    }
  }
  return false;
}

/**
 * 获取所有已知的生产敏感能力列表
 * @returns {Array<string>}
 */
function getProductionSensitiveCapabilities() {
  return PRODUCTION_SENSITIVE_CAPABILITIES.slice();
}

// ─── 导出 ──────────────────────────────────────────────────

module.exports = {
  evaluateAutonomousPolicy: evaluateAutonomousPolicy,
  getProductionSensitiveCapabilities: getProductionSensitiveCapabilities,

  // 内部导出供测试
  _isProductionSensitive: _isProductionSensitive,
  POLICY_RESULT_BLOCKED: POLICY_RESULT_BLOCKED,
  POLICY_RESULT_FAILED: POLICY_RESULT_FAILED,
  POLICY_RESULT_ALLOWED: POLICY_RESULT_ALLOWED,
  POLICY_RESULT_WARNING: POLICY_RESULT_WARNING
};
