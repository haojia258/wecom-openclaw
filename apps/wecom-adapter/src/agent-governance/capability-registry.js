'use strict';

/**
 * capability-registry.js - Agent 能力注册表 (P10.4)
 *
 * 提供:
 *   - Agent 能力注册与查询
 *   - 能力授权检查 (forbidden 优先级 > capabilities)
 *   - Agent 选择
 *   - dispatch 验证
 */

var policy = require('./capability-policy');

// ─── 默认 Agent 注册表 ─────────────────────────────────────

var DEFAULT_AGENTS = {
  codex: {
    capabilities: ['code.patch', 'test.run', 'git.diff', 'docs.write'],
    forbidden: ['deploy.production', 'env.write', 'nginx.modify', 'secrets.write'],
    requiresApproval: ['git.merge']
  },
  workbuddy: {
    capabilities: ['server.audit', 'test.run', 'git.merge', 'pm2.restart', 'staging.deploy'],
    forbidden: ['env.write', 'secrets.write', 'nginx.modify'],
    requiresApproval: ['deploy.production', 'pm2.restart']
  },
  deepseek: {
    capabilities: ['reasoning.review', 'risk.analysis', 'docs.write'],
    forbidden: ['server.write', 'deploy.production', 'git.merge', 'env.write'],
    requiresApproval: []
  },
  doubao: {
    capabilities: ['copy.write', 'summary.write', 'customer.reply'],
    forbidden: ['server.write', 'git.merge', 'deploy.production', 'env.write'],
    requiresApproval: []
  }
};

// ─── 运行时注册表 ──────────────────────────────────────────

var _registry = {};

/**
 * 初始化注册表（加载默认 agents）
 */
function _init() {
  if (Object.keys(_registry).length > 0) return; // 已初始化
  var agentNames = Object.keys(DEFAULT_AGENTS);
  for (var i = 0; i < agentNames.length; i++) {
    registerAgent(agentNames[i], DEFAULT_AGENTS[agentNames[i]]);
  }
}

/**
 * 注册一个 agent
 * @param {string} agentName
 * @param {object} def - { capabilities: [], forbidden: [], requiresApproval: [] }
 * @returns {{ success: boolean, error?: string }}
 */
function registerAgent(agentName, def) {
  if (!agentName || typeof agentName !== 'string') {
    return { success: false, error: 'agent 名称不能为空' };
  }

  var normalized = agentName.toLowerCase();

  var caps = Array.isArray(def.capabilities) ? def.capabilities : [];
  var forbid = Array.isArray(def.forbidden) ? def.forbidden : [];
  var reqAppr = Array.isArray(def.requiresApproval) ? def.requiresApproval : [];

  _registry[normalized] = {
    agent: normalized,
    capabilities: caps,
    forbidden: forbid,
    requiresApproval: reqAppr
  };

  return { success: true, agent: normalized };
}

/**
 * 注销一个 agent
 * @param {string} agentName
 */
function unregisterAgent(agentName) {
  delete _registry[agentName.toLowerCase()];
}

// ─── 能力查询 ──────────────────────────────────────────────

/**
 * 获取 agent 的全部能力
 * @param {string} agentName
 * @returns {{ success: boolean, agent?: object, error?: string }}
 */
function getAgentCapabilities(agentName) {
  _init();

  var normalized = (agentName || '').toLowerCase();
  var agent = _registry[normalized];

  if (!agent) {
    return { success: false, error: 'Agent 未注册: ' + agentName };
  }

  return {
    success: true,
    agent: {
      agent: agent.agent,
      capabilities: agent.capabilities.slice(),
      forbidden: agent.forbidden.slice(),
      requiresApproval: agent.requiresApproval.slice()
    }
  };
}

/**
 * 检查 agent 是否可以执行某能力
 * 规则: forbidden 优先级最高
 * @param {string} agentName
 * @param {string} capability
 * @returns {boolean}
 */
function canAgentPerform(agentName, capability) {
  _init();

  var normalized = (agentName || '').toLowerCase();
  var agent = _registry[normalized];

  if (!agent) return false;

  // 禁止项优先
  if (agent.forbidden.indexOf(capability) !== -1) return false;

  // 检查是否在 capabilities 列表中
  return agent.capabilities.indexOf(capability) !== -1;
}

/**
 * 检查操作是否需要审批
 * @param {string} agentName
 * @param {string} capability
 * @returns {boolean}
 */
function requiresApproval(agentName, capability) {
  _init();

  var normalized = (agentName || '').toLowerCase();
  var agent = _registry[normalized];

  if (!agent) return false;

  return agent.requiresApproval.indexOf(capability) !== -1;
}

/**
 * 检查操作是否被禁止
 * @param {string} agentName
 * @param {string} capability
 * @returns {boolean}
 */
function isForbidden(agentName, capability) {
  _init();

  var normalized = (agentName || '').toLowerCase();
  var agent = _registry[normalized];

  if (!agent) return true; // 未注册的 agent 一律禁止

  return agent.forbidden.indexOf(capability) !== -1;
}

/**
 * 选择具备某能力的所有 agent
 * @param {string} capability
 * @returns {Array<string>}
 */
function selectAgentsForCapability(capability) {
  _init();

  var result = [];
  var agentNames = Object.keys(_registry);
  for (var i = 0; i < agentNames.length; i++) {
    var agent = _registry[agentNames[i]];
    // 不被禁止 且 具备该能力
    if (agent.forbidden.indexOf(capability) === -1 &&
        agent.capabilities.indexOf(capability) !== -1) {
      result.push(agent.agent);
    }
  }

  return result;
}

/**
 * 验证 dispatch 请求
 * 返回完整的验证结果，供 artifact 记录
 *
 * @param {string} agentName
 * @param {string} capability
 * @returns {object} { allowed, requiresApproval, reason, checked_at }
 */
function validateDispatch(agentName, capability) {
  _init();

  var normalized = (agentName || '').toLowerCase();
  var agent = _registry[normalized];

  if (!agent) {
    return {
      allowed: false,
      requiresApproval: false,
      reason: 'Agent 未注册: ' + agentName,
      checked_at: new Date().toISOString()
    };
  }

  // 禁止检查（最高优先级）
  if (agent.forbidden.indexOf(capability) !== -1) {
    return {
      allowed: false,
      requiresApproval: false,
      reason: '操作被禁止: ' + capability + ' 在 [' + agent.agent + '] 的 forbidden 列表中',
      checked_at: new Date().toISOString()
    };
  }

  // 能力检查
  var hasCap = agent.capabilities.indexOf(capability) !== -1;
  if (!hasCap) {
    return {
      allowed: false,
      requiresApproval: false,
      reason: 'Agent [' + agent.agent + '] 不具备能力: ' + capability,
      checked_at: new Date().toISOString()
    };
  }

  // 审批检查
  var needApproval = agent.requiresApproval.indexOf(capability) !== -1;

  return {
    allowed: true,
    requiresApproval: needApproval,
    reason: needApproval
      ? 'Agent [' + agent.agent + '] 具备能力 [' + capability + ']，但需要审批'
      : 'Agent [' + agent.agent + '] 具备能力 [' + capability + ']',
    checked_at: new Date().toISOString()
  };
}

/**
 * 获取所有已注册 agent 列表
 * @returns {Array<object>}
 */
function listAllAgents() {
  _init();

  var result = [];
  var agentNames = Object.keys(_registry);
  for (var i = 0; i < agentNames.length; i++) {
    var agent = _registry[agentNames[i]];
    result.push({
      agent: agent.agent,
      capabilities: agent.capabilities.slice(),
      forbidden: agent.forbidden.slice(),
      requiresApproval: agent.requiresApproval.slice()
    });
  }

  return result;
}

/**
 * 重置注册表为默认状态（测试用）
 */
function resetRegistry() {
  var keys = Object.keys(_registry);
  for (var i = 0; i < keys.length; i++) {
    delete _registry[keys[i]];
  }
  _init();
}

// ─── 导出 ──────────────────────────────────────────────────

module.exports = {
  // CRUD
  registerAgent: registerAgent,
  unregisterAgent: unregisterAgent,
  getAgentCapabilities: getAgentCapabilities,
  listAllAgents: listAllAgents,

  // 查询
  canAgentPerform: canAgentPerform,
  requiresApproval: requiresApproval,
  isForbidden: isForbidden,
  selectAgentsForCapability: selectAgentsForCapability,
  validateDispatch: validateDispatch,

  // 管理
  resetRegistry: resetRegistry,

  // 常量
  DEFAULT_AGENTS: DEFAULT_AGENTS,

  // 内部引用（测试用）
  _registry: _registry,
};
