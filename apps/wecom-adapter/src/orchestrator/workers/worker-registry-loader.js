/**
 * worker-registry-loader.js
 * Runtime → Fixed Worker Registry 接入层
 *
 * 封装 worker-registry.js，增加 Prompt 文件加载与验证能力。
 * 为 Runtime 编排提供统一的 Worker 加载接口。
 *
 * 约束：
 *   - 不调用真实 AI API
 *   - 不修改 worker-registry.js 的定义
 *   - risk-review-worker（promptFile=null）不加载 Prompt
 *   - 所有 Worker 在 reviewOnly + requiresHumanApproval 模式下运行
 */

'use strict';

var fs = require('fs');
var path = require('path');

var registry = require('./worker-registry');

// ============================================================
// 路径解析
// ============================================================

var ORCHESTRATOR_ROOT = path.resolve(__dirname, '..');

/**
 * resolvePromptPath — 将 Registry 中的相对路径解析为绝对路径
 * @param {string} relativePath - worker-registry 中的 promptFile
 * @returns {string|null} 绝对路径，路径无效时返回 null
 */
function resolvePromptPath(relativePath) {
  if (!relativePath || typeof relativePath !== 'string') return null;

  // Registry 中路径格式：apps/wecom-adapter/src/orchestrator/prompts/*.prompt.md
  // 解析：取文件名 + 拼接 orchestrator/prompts 目录
  var fileName = path.basename(relativePath);
  if (!fileName) return null;

  return path.join(ORCHESTRATOR_ROOT, 'prompts', fileName);
}

// ============================================================
// Prompt 验证标记常量
// ============================================================

var REQUIRED_MARKERS = Object.freeze([
  'REVIEW_ONLY__NO_AUTO_APPLY',
]);

var REQUIRED_FIELDS = Object.freeze([
  'requiresHumanApproval',
]);

// ============================================================
// 公开 API
// ============================================================

/**
 * listAvailableWorkers — 列出所有可用的 Worker（委托 registry.listWorkers）
 * @param {object} [opts] - 可选过滤条件
 * @param {boolean} [opts.llmEnabled] - 按 llmEnabled 过滤
 * @param {string}  [opts.role]       - 按 role 过滤
 * @returns {object[]} Worker 摘要列表
 */
function listAvailableWorkers(opts) {
  return registry.listWorkers(opts);
}

/**
 * loadWorker — 按 workerId 加载 Worker 定义
 *
 * 委托 registry.getWorker，返回冻结的 Worker 定义对象。
 *
 * @param {string} workerId - Worker ID
 * @returns {object|null} Worker 定义，不存在时返回 null
 */
function loadWorker(workerId) {
  return registry.getWorker(workerId);
}

/**
 * loadWorkerPrompt — 加载 Worker 的 Prompt 文件内容
 *
 * 规则：
 *   - 对 promptFile=null 的 Worker（risk-review）返回 null
 *   - 对不存在的 Worker 返回 null
 *   - 对文件不存在的 Prompt 返回 null
 *
 * @param {string} workerId - Worker ID
 * @returns {string|null} Prompt 文件内容（原始 Markdown），无法加载时返回 null
 */
function loadWorkerPrompt(workerId) {
  var worker = registry.getWorker(workerId);
  if (!worker) return null;

  // risk-review-worker 无 prompt
  if (worker.promptFile === null || worker.promptFile === undefined) {
    return null;
  }

  var absolutePath = resolvePromptPath(worker.promptFile);
  if (!absolutePath) return null;

  try {
    return fs.readFileSync(absolutePath, 'utf-8');
  } catch (_err) {
    return null;
  }
}

/**
 * validateWorkerPrompt — 验证 Worker 的 Prompt 文件完整性与安全性
 *
 * 检查项：
 *   1. Worker 在 Registry 中存在
 *   2. risk-review-worker 无需 Prompt（直接通过）
 *   3. Prompt 文件存在且可读
 *   4. 必需标记 REVIEW_ONLY__NO_AUTO_APPLY 存在
 *   5. requiresHumanApproval 声明存在
 *   6. promptVersion 与 Registry 一致（v1）
 *
 * @param {string} workerId - Worker ID
 * @returns {object} 验证结果
 *   {
 *     valid: boolean,
 *     workerId: string,
 *     promptExists: boolean,
 *     markers: { REVIEW_ONLY__NO_AUTO_APPLY: boolean, requiresHumanApproval: boolean },
 *     promptVersion: string|null,
 *     errors: string[],
 *     warnings: string[]
 *   }
 */
function validateWorkerPrompt(workerId) {
  var result = {
    valid: false,
    workerId: workerId || '(unknown)',
    promptExists: false,
    markers: {
      'REVIEW_ONLY__NO_AUTO_APPLY': false,
      'requiresHumanApproval': false,
    },
    promptVersion: null,
    errors: [],
    warnings: [],
  };

  var worker = registry.getWorker(workerId);
  if (!worker) {
    result.errors.push('Worker "' + workerId + '" 未在 Registry 中注册');
    return result;
  }

  result.workerId = worker.workerId;
  result.promptVersion = worker.promptVersion;

  // risk-review-worker：无 Prompt 是预期行为
  if (worker.promptFile === null) {
    if (worker.llmEnabled === false && worker.provider === 'local-rule') {
      result.valid = true;
      result.promptExists = false;
      result.markers['REVIEW_ONLY__NO_AUTO_APPLY'] = true;
      result.markers['requiresHumanApproval'] = true;
      return result;
    }
    result.errors.push('Worker "' + workerId + '" 的 promptFile=null 但 llmEnabled=true，不一致');
    return result;
  }

  // 加载 Prompt 内容
  var content = loadWorkerPrompt(workerId);
  if (content === null) {
    result.errors.push('Prompt 文件无法加载: ' + (worker.promptFile || '(null)'));
    return result;
  }

  result.promptExists = true;

  // 验证必需标记
  REQUIRED_MARKERS.forEach(function (marker) {
    if (content.indexOf(marker) !== -1) {
      result.markers[marker] = true;
    } else {
      result.errors.push('缺少必需安全标记: ' + marker);
    }
  });

  // 验证 requiresHumanApproval 声明
  var hasFieldDeclaration = REQUIRED_FIELDS.some(function (field) {
    return content.indexOf(field) !== -1;
  });

  result.markers['requiresHumanApproval'] = hasFieldDeclaration;

  if (!hasFieldDeclaration) {
    result.errors.push('Prompt 中未声明 requiresHumanApproval');
  }

  // 验证 promptVersion
  if (worker.promptVersion !== 'v1') {
    result.warnings.push('promptVersion 非 v1，当前: ' + worker.promptVersion);
  }

  // 最终判定
  result.valid = result.errors.length === 0;
  return result;
}

/**
 * getWorkerRuntimeDescriptor — 为 Runtime 提供标准化的 Worker 描述符
 *
 * 返回精简的 Runtime 兼容结构，包含调度所需的最小字段。
 *
 * @param {string} workerId - Worker ID
 * @returns {object|null} Runtime 描述符，不存在时返回 null
 *
 * 返回结构：
 * {
 *   workerId: string,
 *   role: string,
 *   provider: string,
 *   model: string,
 *   llmEnabled: boolean,
 *   reviewOnly: boolean,
 *   requiresHumanApproval: boolean,
 *   allowedIntents: string[],
 *   blockedActions: string[],
 *   promptAvailable: boolean,
 *   promptPath: string|null
 * }
 */
function getWorkerRuntimeDescriptor(workerId) {
  var worker = registry.getWorker(workerId);
  if (!worker) return null;

  var promptPath = resolvePromptPath(worker.promptFile);
  var promptAvailable = false;

  if (promptPath) {
    try {
      fs.accessSync(promptPath, fs.constants.R_OK);
      promptAvailable = true;
    } catch (_err) {
      // 文件不存在或不可读
    }
  }

  return {
    workerId: worker.workerId,
    role: worker.role,
    provider: worker.provider,
    model: worker.model,
    llmEnabled: worker.llmEnabled,
    reviewOnly: worker.reviewOnly,
    requiresHumanApproval: worker.requiresHumanApproval,
    allowedIntents: worker.allowedIntents.slice(),
    blockedActions: worker.blockedActions.slice(),
    promptAvailable: promptAvailable,
    promptPath: promptPath,
  };
}

// ============================================================
// 模块导出
// ============================================================

module.exports = {
  // 公开 API
  listAvailableWorkers: listAvailableWorkers,
  loadWorker: loadWorker,
  loadWorkerPrompt: loadWorkerPrompt,
  validateWorkerPrompt: validateWorkerPrompt,
  getWorkerRuntimeDescriptor: getWorkerRuntimeDescriptor,

  // Re-export registry API（直接透传，方便上层统一使用 loader）
  getWorker: registry.getWorker,
  getWorkerByRole: registry.getWorkerByRole,
  validateWorker: registry.validateWorker,
  getPromptPath: registry.getPromptPath,
  isActionBlocked: registry.isActionBlocked,

  // 底层引用（调试/审计用）
  _registry: registry,
  ORCHESTRATOR_ROOT: ORCHESTRATOR_ROOT,
};
