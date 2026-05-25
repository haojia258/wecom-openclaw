'use strict';

/**
 * async-worker-result.js — AI Runtime PR Guardrail: Worker 结果安全处理
 *
 * 三个核心守卫函数：
 *   1. normalizeWorkerResult(result) — 标准化 AI Worker 返回的 Promise 结果
 *   2. assertReviewOnly(content)     — 断言输出包含 REVIEW_ONLY__NO_AUTO_APPLY 标记
 *   3. assertNoDangerousActions(text) — 拦截 apply/deploy/rollback 等危险操作
 *
 * 设计原则：
 *   1. 防御性编程：所有输入都被安全处理，不抛出异常
 *   2. 白名单优先：只允许 review/summary/analysis 等安全操作
 *   3. 标记驱动：以 REVIEW_ONLY__NO_AUTO_APPLY 为核心安全契约
 *
 * 适用范围：
 *   - openai-worker (executeOpenAIWorker) 的 Promise 结果
 *   - deepseek-worker 的 Promise 结果
 *   - doubao-worker 的 Promise 结果
 *   - 任何符合 { outputText, error, model, safetyNote, taskId, promptHash, createdAt } 形状的结果
 */

// ============================================================
// 危险操作关键词
// ============================================================

/**
 * 危险动作关键词列表
 * 命中文本中任何一项 → 安全校验失败
 */
var DANGEROUS_ACTIONS = [
  'auto_apply',
  'apply_patch',
  'auto_deploy',
  'deploy_production',
  'deploy_to_prod',
  'auto_rollback',
  'rollback_production',
  'auto_merge',
  'merge_main',
  'force_push',
  'modify_nginx',
  'modify_env',
  'modify_wecom',
  'auto_approve_high_risk',
  'delete_branch',
];

/**
 * 中文危险关键词
 */
var DANGEROUS_ACTIONS_CN = [
  '自动部署',
  '自动上线',
  '自动发布',
  '自动回滚',
  '自动合并',
  '强制推送',
  '修改nginx',
  '修改环境变量',
  '修改.env',
  '修改企业微信主链路',
  '自动批准',
];

// ============================================================
// 系统安全标记 — 这些字符串是系统注解，不应被危险操作扫描误伤
// ============================================================

var SYSTEM_SAFETY_MARKERS = [
  'REVIEW_ONLY__NO_AUTO_APPLY',
];

// ============================================================
// 核心 API
// ============================================================

/**
 * normalizeWorkerResult — 标准化 AI Worker 的 Promise 结果
 *
 * 将 openai-worker / deepseek-worker / doubao-worker 返回的异步结果
 * 统一为标准化结构，确保下游消费者不需要猜测字段名。
 *
 * openai-worker 返回结构（参考）：
 *   {
 *     outputText: string,      // AI 输出文本
 *     error: string,           // 错误消息（空串 = 无错误）
 *     model: string,           // 模型名（如 gpt-4o）
 *     safetyNote: string,      // 安全标记（REVIEW_ONLY__NO_AUTO_APPLY 或 REJECTED__SAFETY_LAYER:xxx）
 *     taskId: string,          // 任务 ID
 *     promptHash: string,      // Prompt hash
 *     createdAt: string,       // ISO 时间戳
 *   }
 *
 * 标准化输出（不论输入形状，始终返回统一结构）：
 *   {
 *     outputText: string,
 *     error: string,
 *     model: string,
 *     hasError: boolean,
 *     safetyNote: string,
 *     taskId: string,
 *     promptHash: string,
 *     createdAt: string,
 *     isRejected: boolean,     // 被安全层拒绝（error 非空 + safetyNote 含 REJECTED__）
 *   }
 *
 * @param {object|null|undefined} result — Worker 返回的 Promise resolved value
 * @returns {object} 标准化结果
 */
function normalizeWorkerResult(result) {
  var r = (result != null) ? result : {};

  var outputText = (typeof r.outputText === 'string') ? r.outputText : '';
  var error = (typeof r.error === 'string') ? r.error : '';
  var model = (typeof r.model === 'string') ? r.model : 'unknown';
  var safetyNote = (typeof r.safetyNote === 'string') ? r.safetyNote : '';
  var taskId = (typeof r.taskId === 'string') ? r.taskId : '';
  var promptHash = (typeof r.promptHash === 'string') ? r.promptHash : '';
  var createdAt = (typeof r.createdAt === 'string') ? r.createdAt : '';

  var hasError = !!error;
  var isRejected = hasError && safetyNote.indexOf('REJECTED__') !== -1;

  return {
    outputText: outputText,
    error: error,
    model: model,
    hasError: hasError,
    safetyNote: safetyNote,
    taskId: taskId,
    promptHash: promptHash,
    createdAt: createdAt,
    isRejected: isRejected,
  };
}

/**
 * assertReviewOnly — 断言输出包含安全审查标记
 *
 * 核心安全契约：所有 AI 输出必须包含 REVIEW_ONLY__NO_AUTO_APPLY 标记，
 * 否则说明输出未经安全检查或标记被篡改。
 *
 * @param {string} content — 要检查的内容（输出文本或 safetyNote）
 * @returns {{ valid: boolean, reason?: string }}
 *   - valid: true   → 内容包含安全标记
 *   - valid: false  → 缺少标记，reason 说明原因
 */
function assertReviewOnly(content) {
  if (!content || typeof content !== 'string') {
    return {
      valid: false,
      reason: 'assertReviewOnly: 输入为空或非字符串',
    };
  }

  if (content.indexOf('REVIEW_ONLY__NO_AUTO_APPLY') !== -1) {
    return { valid: true };
  }

  return {
    valid: false,
    reason: 'assertReviewOnly: 缺少安全标记 REVIEW_ONLY__NO_AUTO_APPLY',
  };
}

/**
 * assertNoDangerousActions — 拦截危险操作关键词
 *
 * 在输出文本中扫描 apply/deploy/rollback/merge/force_push 等危险操作关键词。
 * 注意：系统安全说明中的"不自动 apply/deploy"等表述不应被误判（已在调用方处理）。
 *
 * @param {string} text — 要扫描的文本
 * @returns {{ safe: boolean, violations?: string[] }}
 *   - safe: true  → 未发现危险操作
 *   - safe: false → 发现危险操作，violations 列出命中的关键词
 */
function assertNoDangerousActions(text) {
  if (!text || typeof text !== 'string') {
    return { safe: true, violations: [] };
  }

  // 剥离系统安全标记，避免对安全标记本身进行关键词误伤
  var sanitized = text;
  for (var m = 0; m < SYSTEM_SAFETY_MARKERS.length; m++) {
    sanitized = sanitized.split(SYSTEM_SAFETY_MARKERS[m]).join('');
  }

  var violations = [];
  var lowerText = sanitized.toLowerCase();

  // 检查英文关键词
  for (var i = 0; i < DANGEROUS_ACTIONS.length; i++) {
    var keyword = DANGEROUS_ACTIONS[i];
    if (lowerText.indexOf(keyword) !== -1) {
      violations.push(keyword);
    }
  }

  // 检查中文关键词
  for (var j = 0; j < DANGEROUS_ACTIONS_CN.length; j++) {
    var cnKeyword = DANGEROUS_ACTIONS_CN[j];
    if (text.indexOf(cnKeyword) !== -1) {
      violations.push(cnKeyword);
    }
  }

  return {
    safe: violations.length === 0,
    violations: violations,
  };
}

// ============================================================
// 导出
// ============================================================

module.exports = {
  normalizeWorkerResult: normalizeWorkerResult,
  assertReviewOnly: assertReviewOnly,
  assertNoDangerousActions: assertNoDangerousActions,

  // 常量（供测试用）
  DANGEROUS_ACTIONS: DANGEROUS_ACTIONS,
  DANGEROUS_ACTIONS_CN: DANGEROUS_ACTIONS_CN,
  SYSTEM_SAFETY_MARKERS: SYSTEM_SAFETY_MARKERS,
};
