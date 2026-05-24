/**
 * worker-registry.js
 * Fixed Worker Runtime Registry — Phase1-A
 *
 * 固定 Worker 注册表。
 * 每个 Worker 具有不可变的 workerId、role、provider、model、
 * promptFile、promptVersion、allowedIntents、blockedActions
 * 以及安全属性 reviewOnly / requiresHumanApproval / llmEnabled。
 *
 * 约束：
 *   - 4 个固定 Worker，禁止动态注册
 *   - reviewOnly=true（所有 Worker 只读模式）
 *   - requiresHumanApproval=true（所有 Worker 需人工审批）
 *   - risk-review-worker: llmEnabled=false, 无 promptFile, provider=local-rule
 *   - 不接真实 API，不部署
 */

'use strict';

// ============================================================
// 固定 Worker 注册表
// ============================================================

/**
 * Schema per entry:
 *   workerId              string       唯一标识符（固定）
 *   role                  string       角色分类（固定）
 *   name                  string       显示名称
 *   provider              string       AI 提供商（固定）
 *   model                 string       模型标识（固定）
 *   promptFile            string|null  Prompt 文件相对路径（risk-review 为 null）
 *   promptVersion         string       Prompt 版本号（固定 v1）
 *   allowedIntents        string[]     允许的意图类型
 *   blockedActions        string[]     禁止的操作关键词
 *   reviewOnly            boolean      只读模式（固定 true）
 *   requiresHumanApproval boolean      需人工审批（固定 true）
 *   llmEnabled            boolean      是否启用 LLM 调用
 *   description           string       功能描述
 */
const WORKER_REGISTRY = Object.freeze({
  'planner-summary-worker': Object.freeze({
    workerId: 'planner-summary-worker',
    role: 'planner_summary',
    name: '计划总结 Worker',
    provider: 'DeepSeek',
    model: 'deepseek-chat',
    promptFile: 'apps/wecom-adapter/src/orchestrator/prompts/planner-summary.prompt.md',
    promptVersion: 'v1',
    allowedIntents: Object.freeze([
      'summary',
      'plan',
      'analysis',
      'ops_report',
    ]),
    blockedActions: Object.freeze([
      'patch',
      'apply',
      'deploy',
      'rollback',
      'merge',
      'nginx',
      'env',
      '.env',
      '部署',
      '上线',
      '发布到生产',
      '生产环境',
      '回滚',
      '补丁',
      '应用补丁',
      '修改环境变量',
      'nginx配置',
      '企业微信主链路',
      '加密解密',
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
    promptFile: 'apps/wecom-adapter/src/orchestrator/prompts/roi-analysis.prompt.md',
    promptVersion: 'v1',
    allowedIntents: Object.freeze([
      'analysis',
      'roi',
      'report',
      'trend',
    ]),
    blockedActions: Object.freeze([
      'patch',
      'apply',
      'deploy',
      'rollback',
      'merge',
      'nginx',
      'env',
      '.env',
      '部署',
      '上线',
      '发布到生产',
      '生产环境',
      '回滚',
      '补丁',
      '应用补丁',
      '修改环境变量',
      'nginx配置',
      '企业微信主链路',
      '加密解密',
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
    promptFile: 'apps/wecom-adapter/src/orchestrator/prompts/video-content.prompt.md',
    promptVersion: 'v1',
    allowedIntents: Object.freeze([
      'content',
      'video',
      'script',
      'copywriting',
    ]),
    blockedActions: Object.freeze([
      'patch',
      'apply',
      'deploy',
      'rollback',
      'merge',
      'nginx',
      'env',
      '.env',
      '部署',
      '上线',
      '发布到生产',
      '生产环境',
      '回滚',
      '补丁',
      '应用补丁',
      '修改环境变量',
      'nginx配置',
      '企业微信主链路',
      '加密解密',
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
    provider: 'local-rule',
    model: 'rules-engine',
    promptFile: null,
    promptVersion: 'v1',
    allowedIntents: Object.freeze([
      'review',
      'risk',
      'audit',
      'policy',
    ]),
    blockedActions: Object.freeze([
      'patch',
      'apply',
      'deploy',
      'rollback',
      'merge',
      'nginx',
      'env',
      '.env',
      '部署',
      '上线',
      '发布到生产',
      '生产环境',
      '回滚',
      '补丁',
      '应用补丁',
      '修改环境变量',
      'nginx配置',
      '企业微信主链路',
      '加密解密',
    ]),
    reviewOnly: true,
    requiresHumanApproval: true,
    llmEnabled: false,
    description: '风险审查 — 纯本地规则引擎驱动，不调用 LLM（llmEnabled=false, provider=local-rule）',
  }),
});

// ============================================================
// 工具常量
// ============================================================

/** 注册表中所有 workerId 列表 */
const REGISTERED_IDS = Object.freeze(Object.keys(WORKER_REGISTRY));

/** role → workerId 索引 */
const ROLE_INDEX = Object.freeze(
  Object.values(WORKER_REGISTRY).reduce(function (map, w) {
    map[w.role] = w.workerId;
    return map;
  }, {})
);

// ============================================================
// 导出 API
// ============================================================

/**
 * listWorkers — 列出所有已注册的 Worker
 * @param {object} [opts] - 可选过滤条件
 * @param {boolean} [opts.llmEnabled] - 按 llmEnabled 过滤
 * @param {string}  [opts.role]       - 按 role 过滤
 * @returns {object[]} Worker 摘要列表
 */
function listWorkers(opts) {
  var entries = Object.values(WORKER_REGISTRY);
  var filtered = entries;

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
      promptVersion: w.promptVersion,
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
 * getWorker — 按 workerId 获取 Worker 定义
 * @param {string} id - Worker ID
 * @returns {object|null} Worker 定义（冻结对象），不存在时返回 null
 */
function getWorker(id) {
  if (!id) return null;
  var key = String(id).toLowerCase();
  return WORKER_REGISTRY[key] || null;
}

/**
 * getWorkerByRole — 按 role 获取 Worker 定义
 * @param {string} role - Worker role 分类
 * @returns {object|null} Worker 定义（冻结对象），不存在时返回 null
 */
function getWorkerByRole(role) {
  if (!role) return null;
  var workerId = ROLE_INDEX[String(role).toLowerCase()];
  if (!workerId) return null;
  return WORKER_REGISTRY[workerId] || null;
}

/**
 * validateWorker — 验证 workerId 是否已注册
 * @param {string} id - Worker ID
 * @returns {boolean} 是否有效
 */
function validateWorker(id) {
  if (!id) return false;
  return REGISTERED_IDS.indexOf(String(id).toLowerCase()) !== -1;
}

/**
 * getPromptPath — 获取 Worker 的 prompt 文件路径
 * @param {string} id - Worker ID
 * @returns {string|null} prompt 文件路径，不存在或为 null 时返回 null
 */
function getPromptPath(id) {
  var worker = getWorker(id);
  if (!worker) return null;
  return worker.promptFile || null;
}

/**
 * isActionBlocked — 检查输入文本是否命中了 Worker 的 blockedActions
 *
 * 匹配规则：对 blockedActions 中每一项，检查输入文本中是否包含该关键词。
 * 支持中英文关键词。
 *
 * @param {string} workerId - Worker ID
 * @param {string} text     - 待检查的文本
 * @returns {{ blocked: boolean, reason?: string, matchedAction?: string }}
 */
function isActionBlocked(workerId, text) {
  var worker = getWorker(workerId);
  if (!worker) {
    return { blocked: true, reason: 'UNKNOWN_WORKER: Worker "' + workerId + '" 未注册' };
  }

  if (!text || typeof text !== 'string') {
    return { blocked: false };
  }

  var lowerText = text.toLowerCase();
  var actions = worker.blockedActions.slice();

  // 按长度降序排列，优先匹配更长的关键词（避免"nginx"短路"nginx配置"等子串问题）
  actions.sort(function (a, b) { return b.length - a.length; });

  for (var i = 0; i < actions.length; i++) {
    var action = actions[i];
    if (lowerText.indexOf(action.toLowerCase()) !== -1) {
      return {
        blocked: true,
        reason: 'BLOCKED_ACTION: 操作 "' + action + '" 被 Worker [' + workerId + '] 禁止',
        matchedAction: action,
      };
    }
  }

  return { blocked: false };
}

// ============================================================
// 模块导出
// ============================================================

module.exports = {
  WORKER_REGISTRY: WORKER_REGISTRY,
  REGISTERED_IDS: REGISTERED_IDS,
  ROLE_INDEX: ROLE_INDEX,
  listWorkers: listWorkers,
  getWorker: getWorker,
  getWorkerByRole: getWorkerByRole,
  validateWorker: validateWorker,
  getPromptPath: getPromptPath,
  isActionBlocked: isActionBlocked,
};
