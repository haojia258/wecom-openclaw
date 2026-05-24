/**
 * worker-registry.js
 * Fixed Worker Runtime Registry — Phase1-A
 *
 * 固定 Worker 注册表（硬编码，不动态创建）。
 * 每个 Worker 具有固定的 workerId、role、provider、model、
 * promptFile、allowedIntents、blockedActions，以及安全属性
 * reviewOnly / requiresHumanApproval / llmEnabled。
 *
 * 约束：
 *   - 4 个固定 Worker，禁止动态注册
 *   - reviewOnly=true（所有 Worker 只读模式）
 *   - requiresHumanApproval=true（所有 Worker 需人工审批）
 *   - risk-review-worker 的 llmEnabled=false（纯规则引擎）
 *   - 不接真实 API，不做 Prompt，不部署
 */

'use strict';

/**
 * 固定 Worker 注册表
 *
 * Schema per entry:
 *   workerId              string   - 唯一标识符（固定）
 *   role                  string   - 角色分类（固定）
 *   name                  string   - 显示名称
 *   provider              string   - AI 提供商（固定）
 *   model                 string   - 模型标识（固定）
 *   promptFile            string   - Prompt 文件相对路径
 *   allowedIntents        string[] - 允许的意图类型
 *   blockedActions        string[] - 禁止的操作类型
 *   reviewOnly            boolean  - 是否只读模式（固定 true）
 *   requiresHumanApproval boolean  - 是否需要人工审批（固定 true）
 *   llmEnabled            boolean  - 是否启用 LLM 调用
 *   description           string   - 功能描述
 */
const WORKER_REGISTRY = Object.freeze({
  'planner-summary-worker': Object.freeze({
    workerId: 'planner-summary-worker',
    role: 'planner_summary',
    name: '计划总结 Worker',
    provider: 'DeepSeek',
    model: 'deepseek-chat',
    promptFile: './prompts/planner-summary.md',
    allowedIntents: Object.freeze([
      'summary',
      'plan',
      'analysis',
      'ops_report',
    ]),
    blockedActions: Object.freeze([
      'patch_create',
      'patch_apply',
      'deploy',
      'rollback',
      'nginx_modify',
      'env_modify',
      'pm2_restart',
      'autossh_restart',
      'singbox_restart',
    ]),
    reviewOnly: true,
    requiresHumanApproval: true,
    llmEnabled: true,
    description: '运营日报/周报汇总、任务规划、意图分析 — DeepSeek Chat',
  }),

  'roi-analysis-worker': Object.freeze({
    workerId: 'roi-analysis-worker',
    role: 'roi_analysis',
    name: 'ROI 分析 Worker',
    provider: 'DeepSeek',
    model: 'deepseek-chat',
    promptFile: './prompts/roi-analysis.md',
    allowedIntents: Object.freeze([
      'analysis',
      'roi',
      'report',
      'trend',
    ]),
    blockedActions: Object.freeze([
      'patch_create',
      'patch_apply',
      'deploy',
      'rollback',
      'nginx_modify',
      'env_modify',
      'pm2_restart',
      'autossh_restart',
      'singbox_restart',
    ]),
    reviewOnly: true,
    requiresHumanApproval: true,
    llmEnabled: true,
    description: '电商投放 ROI 分析、成本收益分析、趋势预测 — DeepSeek Chat',
  }),

  'video-content-worker': Object.freeze({
    workerId: 'video-content-worker',
    role: 'video_content',
    name: '视频内容 Worker',
    provider: 'ByteDance',
    model: 'doubao-pro',
    promptFile: './prompts/video-content.md',
    allowedIntents: Object.freeze([
      'content',
      'video',
      'script',
      'copywriting',
    ]),
    blockedActions: Object.freeze([
      'patch_create',
      'patch_apply',
      'deploy',
      'rollback',
      'nginx_modify',
      'env_modify',
      'pm2_restart',
      'autossh_restart',
      'singbox_restart',
    ]),
    reviewOnly: true,
    requiresHumanApproval: true,
    llmEnabled: true,
    description: '短视频脚本生成、内容创意、文案优化 — 豆包 Pro',
  }),

  'risk-review-worker': Object.freeze({
    workerId: 'risk-review-worker',
    role: 'risk_review',
    name: '风险审查 Worker',
    provider: 'WorkBuddy Built-in',
    model: 'rules-engine',
    promptFile: './prompts/risk-review.md',
    allowedIntents: Object.freeze([
      'review',
      'risk',
      'audit',
      'policy',
    ]),
    blockedActions: Object.freeze([
      'patch_create',
      'patch_apply',
      'deploy',
      'rollback',
      'nginx_modify',
      'env_modify',
      'pm2_restart',
      'autossh_restart',
      'singbox_restart',
    ]),
    reviewOnly: true,
    requiresHumanApproval: true,
    llmEnabled: false,
    description: '风险审查 — 纯规则引擎驱动，不调用 LLM（llmEnabled=false）',
  }),
});

/** 注册表中所有 workerId 列表 */
const REGISTERED_IDS = Object.freeze(Object.keys(WORKER_REGISTRY));

/**
 * 获取 Worker 定义
 * @param {string} workerId - Worker ID
 * @returns {object|null} Worker 定义（冻结对象），不存在时返回 null
 */
function getWorker(workerId) {
  if (!workerId) return null;
  const id = String(workerId).toLowerCase();
  return WORKER_REGISTRY[id] || null;
}

/**
 * 列出所有已注册的 Worker
 * @param {object} [opts] - 可选过滤条件
 * @param {boolean} [opts.llmEnabled] - 按 llmEnabled 过滤
 * @param {string}  [opts.role]       - 按 role 过滤
 * @returns {object[]} Worker 摘要列表
 */
function listWorkers(opts) {
  const entries = Object.values(WORKER_REGISTRY);

  let filtered = entries;
  if (opts) {
    if (opts.llmEnabled !== undefined) {
      filtered = filtered.filter(function (w) {
        return w.llmEnabled === opts.llmEnabled;
      });
    }
    if (opts.role) {
      filtered = filtered.filter(function (w) {
        return w.role === opts.role;
      });
    }
  }

  return filtered.map(function (w) {
    return {
      workerId: w.workerId,
      role: w.role,
      name: w.name,
      provider: w.provider,
      model: w.model,
      promptFile: w.promptFile,
      allowedIntents: w.allowedIntents,
      blockedActions: w.blockedActions,
      reviewOnly: w.reviewOnly,
      requiresHumanApproval: w.requiresHumanApproval,
      llmEnabled: w.llmEnabled,
      description: w.description,
    };
  });
}

/**
 * 获取注册表统计信息
 * @returns {object} 统计摘要
 */
function getRegistryStats() {
  const all = Object.values(WORKER_REGISTRY);

  return {
    totalWorkers: all.length,
    registeredIds: REGISTERED_IDS,
    llmEnabledCount: all.filter(function (w) { return w.llmEnabled; }).length,
    rulesOnlyCount: all.filter(function (w) { return !w.llmEnabled; }).length,
    reviewOnlyCount: all.filter(function (w) { return w.reviewOnly; }).length,
    requireApprovalCount: all.filter(function (w) { return w.requiresHumanApproval; }).length,
    providers: all.reduce(function (acc, w) {
      if (acc.indexOf(w.provider) === -1) acc.push(w.provider);
      return acc;
    }, []),
    roles: all.map(function (w) { return w.role; }),
  };
}

/**
 * 验证任务是否匹配 Worker 的 allowedIntents
 * @param {object} worker - Worker 定义
 * @param {string[]} intents - 任务意图列表
 * @returns {{ allowed: boolean, reason?: string }}
 */
function validateIntents(worker, intents) {
  if (!intents || intents.length === 0) {
    return {
      allowed: false,
      reason: 'NO_INTENTS: 任务未指定意图',
    };
  }

  const allowed = worker.allowedIntents || [];
  const matched = intents.filter(function (intent) {
    return allowed.indexOf(intent) !== -1;
  });

  if (matched.length === 0) {
    return {
      allowed: false,
      reason: 'INTENT_MISMATCH: 任务意图 [' + intents.join(', ') +
              '] 不在 Worker [' + worker.workerId + '] 允许范围: [' +
              allowed.join(', ') + ']',
    };
  }

  return { allowed: true, matched: matched };
}

/**
 * 验证任务是否触发了 Worker 的 blockedActions
 * @param {object} worker - Worker 定义
 * @param {string[]} actions - 任务涉及的操作列表
 * @returns {{ blocked: boolean, reason?: string, matchedAction?: string }}
 */
function validateActions(worker, actions) {
  if (!actions || actions.length === 0) {
    return { blocked: false };
  }

  const blocked = worker.blockedActions || [];
  for (var i = 0; i < actions.length; i++) {
    var action = actions[i];
    if (blocked.indexOf(action) !== -1) {
      return {
        blocked: true,
        reason: 'BLOCKED_ACTION: 操作 "' + action + '" 被 Worker [' +
                worker.workerId + '] 禁止',
        matchedAction: action,
      };
    }
  }

  return { blocked: false };
}

module.exports = {
  WORKER_REGISTRY: WORKER_REGISTRY,
  REGISTERED_IDS: REGISTERED_IDS,
  getWorker: getWorker,
  listWorkers: listWorkers,
  getRegistryStats: getRegistryStats,
  validateIntents: validateIntents,
  validateActions: validateActions,
};
