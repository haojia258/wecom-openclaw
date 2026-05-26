'use strict';

/**
 * agent-permission-matrix.js - AI Agent 运行时权限矩阵 (P7.2.1)
 *
 * 定义每个 AI Agent 允许/拒绝执行的操作分类。
 * 这是 Runtime RBAC 的数据层，仅描述权限，不执行检查逻辑。
 *
 * 权限设计原则:
 * - allow: Agent 被允许执行的操作类别
 * - deny:  Agent 被明确禁止的操作类别（高优先级，deny 覆盖 allow）
 * - 若 action 既不在 allow 也不在 deny，默认拒绝（最小权限原则）
 */

/**
 * @typedef {Object} AgentPermission
 * @property {string[]} allow - 允许的操作列表
 * @property {string[]} deny  - 禁止的操作列表
 * @property {string}   description - 描述
 */

/** @type {Object.<string, AgentPermission>} */
const AGENT_PERMISSION_MATRIX = {
  codex: {
    description: 'Codex: 代码审查与 PR 草稿创建',
    allow: [
      'patch',
      'tests',
      'draft-pr'
    ],
    deny: [
      'deploy-production',
      'modify-nginx',
      'modify-env',
      'pm2-restart',
      'git-push-main'
    ]
  },

  workbuddy: {
    description: 'WorkBuddy: 只读审计与 staging 检查',
    allow: [
      'readonly-audit',
      'staging-audit'
    ],
    deny: [
      'deploy-production',
      'modify-env',
      'modify-nginx',
      'rm',
      'kill',
      'sudo'
    ]
  },

  deepseek: {
    description: 'DeepSeek: 代码审查与风险分析（只读）',
    allow: [
      'readonly-review',
      'risk-analysis'
    ],
    deny: [
      'write-code',
      'deploy',
      'shell-exec'
    ]
  },

  doubao: {
    description: 'Doubao: 内容与脚本生成',
    allow: [
      'content-generate',
      'script-generate'
    ],
    deny: [
      'code-write',
      'deploy',
      'shell-exec'
    ]
  }
};

/**
 * confirm: 操作到 Agent 操作类别的映射
 * 用于检查具体 confirm 动作是否在 agent 允许范围内
 */
const CONFIRM_ACTION_MAP = {
  'confirm:create-pr': { agent: 'codex',    action: 'draft-pr'       },
  'confirm:audit':     { agent: 'workbuddy', action: 'readonly-audit' },
  'confirm:review':    { agent: 'deepseek',  action: 'readonly-review' }
};

/**
 * 获取指定 agent 的权限配置
 * @param {string} agentName
 * @returns {AgentPermission|null}
 */
function getAgentPermission(agentName) {
  if (!agentName || typeof agentName !== 'string') return null;
  return AGENT_PERMISSION_MATRIX[agentName.toLowerCase()] || null;
}

/**
 * 获取 confirm 操作对应的 agent+action 映射
 * @param {string} confirmAction - 如 'confirm:create-pr'
 * @returns {{ agent: string, action: string }|null}
 */
function getConfirmMapping(confirmAction) {
  if (!confirmAction) return null;
  return CONFIRM_ACTION_MAP[confirmAction.toLowerCase()] || null;
}

/**
 * 获取所有支持的 agent 名称列表
 * @returns {string[]}
 */
function getSupportedAgents() {
  return Object.keys(AGENT_PERMISSION_MATRIX);
}

module.exports = {
  AGENT_PERMISSION_MATRIX,
  CONFIRM_ACTION_MAP,
  getAgentPermission,
  getConfirmMapping,
  getSupportedAgents
};
