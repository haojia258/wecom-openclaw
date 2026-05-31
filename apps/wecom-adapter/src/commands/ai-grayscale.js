'use strict';

/**
 * ai-grayscale.js — /ai灰度 命令处理器
 *
 * 提供安全、只读、可审计的 planner-summary-worker → OpenAI 单次灰度测试入口。
 * 不修改 /今日运营 主流程，不接入 roi-analysis-worker / video-content-worker。
 *
 * Phase: Phase B Grayscale Test
 * Fixes: await executeOpenAIWorker, loader-based prompt, dual params, sanitize output, worker-audit.record
 */

// 延迟加载依赖
var _openaiWorker = null;
var _workerLoader = null;
var _workerAudit = null;

function getOpenAIWorker() {
  if (!_openaiWorker) {
    _openaiWorker = require('../orchestrator/workers/openai-worker');
  }
  return _openaiWorker;
}

function getWorkerLoader() {
  if (!_workerLoader) {
    _workerLoader = require('../orchestrator/workers/worker-registry-loader');
  }
  return _workerLoader;
}

function getWorkerAudit() {
  if (!_workerAudit) {
    try { _workerAudit = require('../orchestrator/worker-audit'); } catch (e) { _workerAudit = null; }
  }
  return _workerAudit;
}

/** 安全标记 */
var SAFETY_NOTE = 'REVIEW_ONLY__NO_AUTO_APPLY — 本报告由 AI 灰度测试生成，不执行任何自动化操作';

/** 最大输出摘要长度 */
var MAX_SUMMARY_LEN = 800;

// ============================================================
// 安全工具函数（复用 ai-audit-dashboard.js 的脱敏思路）
// ============================================================

/**
 * 统一脱敏函数 — 对所有输出到企业微信 Markdown 的字段做安全处理
 * 覆盖：sk-*, Bearer, Authorization, Cookie, token=, key=, secret=, password=, Windows/Linux 路径, .env
 */
function redactSensitive(value) {
  if (value == null) return '';
  if (typeof value !== 'string') value = String(value);

  // 1. sk- 开头 API key（OpenAI 格式）
  value = value.replace(/\bsk-[a-zA-Z0-9\-_]{10,}\b/g, '[MASKED_API_KEY]');

  // 2. Bearer token
  value = value.replace(/\bBearer\s+[^,\s\n\r|]{10,}/gi, 'Bearer [MASKED]');

  // 3. Authorization header
  value = value.replace(/\bAuthorization\s*:\s*[^,\n\r|]{10,}/gi, 'Authorization: [MASKED]');

  // 4. Cookie header
  value = value.replace(/\bCookie\s*:\s*[^\s;`]{10,}/gi, 'Cookie: [MASKED]');

  // 5. token=xxx 键值对
  value = value.replace(/\btoken\s*=\s*['"]?[a-zA-Z0-9\-_\.\+]{6,}['"]?/gi, 'token=[MASKED]');

  // 6. key=xxx 键值对
  value = value.replace(/\bkey\s*=\s*['"]?[a-zA-Z0-9\-_\.\+]{6,}['"]?/gi, 'key=[MASKED]');

  // 7. secret=xxx 键值对
  value = value.replace(/\bsecret\s*=\s*['"]?[a-zA-Z0-9\-_\.\+]{6,}['"]?/gi, 'secret=[MASKED]');

  // 8. password=xxx 键值对
  value = value.replace(/\bpassword\s*=\s*['"]?[^\s,'";`|]{4,}['"]?/gi, 'password=[MASKED]');

  // 9. Windows 绝对路径
  value = value.replace(/[A-Za-z]:\\(?:Users|Program|Windows|WINDOWS|ProgramData)[^,;\s]*/gi, '[MASKED_PATH]');

  // 10. Linux 绝对路径
  value = value.replace(/\/(?:home|opt|etc|root|var|usr|tmp)\/[^,\s;|]*/g, '[MASKED_PATH]');

  // 11. .env 路径片段
  value = value.replace(/[^\s,;|]*\\\.env[^\s,;|]*/gi, '[MASKED_PATH]');
  value = value.replace(/[^\s,;|]*\/\.env[^\s,;|]*/g, '[MASKED_PATH]');
  value = value.replace(/(^|\s)\.env(?=\s|$)/g, '$1[MASKED_PATH]');

  return value;
}

/**
 * Markdown 转义 — 防止表格注入和格式破坏
 */
function escapeMarkdown(value) {
  if (value == null) return '';
  if (typeof value !== 'string') value = String(value);
  // 管道符转义（防止表格注入）
  value = value.replace(/\|/g, '\\|');
  return value;
}

/**
 * 安全字段处理 — 脱敏 + Markdown 转义
 */
function sanitizeField(value) {
  return escapeMarkdown(redactSensitive(value));
}

/**
 * 处理 AI 输出文本中的代码围栏和 Markdown 注入
 * - 脱敏所有敏感信息
 * - 将 ``` 替换为安全占位符，避免破坏企业微信 Markdown 格式
 * - Markdown 转义
 */
function sanitizeOutput(outputText) {
  if (!outputText) return '';
  // 先脱敏
  var text = redactSensitive(outputText);
  // 处理代码围栏：替换为安全占位符
  text = text.replace(/```/g, '[CODE_BLOCK]');
  // Markdown 转义（管道符）
  text = escapeMarkdown(text);
  return text;
}

/**
 * 截断文本到指定长度（在脱敏处理后调用）
 */
function truncateText(text, maxLen) {
  if (!text) return '';
  if (text.length <= maxLen) return text;
  return text.substring(0, maxLen) + '...(截断)';
}

/**
 * 构造最小只读 context
 */
function buildMinimalContext() {
  var ctx = {};
  ctx.gmv = { summary: '灰度测试模式，无真实数据', placeholder: true };
  ctx.roi = { summary: '灰度测试模式，无真实数据', placeholder: true };
  ctx.risk = { summary: '灰度测试模式，无真实数据', placeholder: true };
  ctx.activity = { summary: '灰度测试模式，无真实数据', placeholder: true };
  ctx.product = { summary: '灰度测试模式，无真实数据', placeholder: true };
  ctx.memory = { summary: '灰度测试模式，无真实数据', placeholder: true };
  ctx.trend = { summary: '灰度测试模式，无真实数据', placeholder: true };
  return ctx;
}

// ============================================================
// 审计（复用 worker-audit.record）
// ============================================================

/**
 * 记录审计日志
 * 不记录：prompt 原文、artifact 正文、key/token/header/cookie/path
 */
function recordAuditLog(entry) {
  try {
    var audit = getWorkerAudit();
    if (audit && audit.record) {
      audit.record(entry);
    }
  } catch (e) {
    // 审计写入失败不阻塞主流程
  }
}

// ============================================================
// 主执行函数
// ============================================================

/**
 * 执行 /ai灰度 命令
 *
 * 兼容真实 router: handler(ctx, args)
 * - args 参数优先（来自 command-center resolve 结果）
 * - 回退到 ctx.args（兼容直接调用/测试）
 */
async function execute(ctx, args) {
  var opts = ctx || {};
  // 真实 args 优先，回退 ctx.args
  var argStr = (args !== undefined ? String(args || '') : (opts.args || '')).trim();
  var workerId = argStr || 'planner-summary-worker';

  // 1. 只允许 planner-summary-worker
  if (workerId !== 'planner-summary-worker') {
    return '⚠️ 灰度测试仅支持 **planner-summary-worker**\n\n' +
           '用法：\n```\n/ai灰度 planner-summary\n```';
  }

  // 2. 检查 Feature Gate
  if (process.env.OPENAI_WORKER_ENABLED !== 'true') {
    return '⚠️ OPENAI_WORKER_ENABLED 未开启\n\n' +
           '请在 .env 中设置 `OPENAI_WORKER_ENABLED=true` 后重试。';
  }

  // 3. 使用 loader 加载 Worker 配置
  var loader = getWorkerLoader();
  var workerConfig = loader.getWorker(workerId);
  if (!workerConfig) {
    return '❌ 无法加载 Worker 配置：' + workerId;
  }

  // 4. 验证 provider
  if (workerConfig.provider !== 'openai') {
    return '❌ Provider 不匹配：期望 openai，实际 ' + workerConfig.provider;
  }

  // 5. 验证 model
  if (workerConfig.model !== 'gpt-4o') {
    return '❌ Model 不匹配：期望 gpt-4o，实际 ' + workerConfig.model;
  }

  // 6. 使用 loader.validateWorkerPrompt 验证 Prompt 安全标记
  var validation = loader.validateWorkerPrompt(workerId);
  if (!validation || !validation.valid) {
    var errors = (validation && validation.errors && validation.errors.length > 0)
      ? validation.errors.join('; ') : '未知验证错误';
    return '❌ Prompt 验证失败：' + errors;
  }

  // 7. 使用 loader.loadWorkerPrompt 加载 Prompt 文件
  var promptText = loader.loadWorkerPrompt(workerId);
  if (!promptText) {
    return '❌ 无法加载 Prompt 文件';
  }

  // 8. 检查 requiresHumanApproval
  if (workerConfig.requiresHumanApproval !== true) {
    return '❌ 安全属性缺失：requiresHumanApproval 必须为 true';
  }

  // 9. 构造最小只读 context
  var context = buildMinimalContext();

  // 10. 调用 executeOpenAIWorker（async/await）
  var taskId = 'grayscale-test-' + Date.now();
  var startTime = Date.now();
  var openaiWorker = getOpenAIWorker();

  var workerResult;
  try {
    workerResult = await openaiWorker.executeOpenAIWorker({
      taskId: taskId,
      workerId: workerId,
      provider: workerConfig.provider,
      model: workerConfig.model,
      prompt: promptText,
      context: context,
      userRequest: '灰度测试：生成今日运营总结',
    });
  } catch (e) {
    // OpenAI Worker 抛出异常（网络错误/超时等）
    var latency = Date.now() - startTime;
    var errMsg = redactSensitive(e.message || String(e));

    // 审计：记录 error（已脱敏，不记录 prompt/artifact/key/token 原文）
    recordAuditLog({
      worker: workerId,
      model: workerConfig.model,
      taskId: taskId,
      latency: latency,
      resultStatus: 'error',
      errorMessage: errMsg,
      outputText: '',
    });

    return '❌ OpenAI Worker 调用失败\n\n' +
           '错误信息：\n```\n' + errMsg + '\n```\n\n' +
           '---\n' +
           '> 🔒 ' + SAFETY_NOTE;
  }

  var latency = Date.now() - startTime;

  // workerResult 字段（openai-worker 返回）：outputText, error, model, safetyNote, taskId, promptHash, createdAt
  var outputText = (workerResult && workerResult.outputText) || '';
  var hasError = !!(workerResult && workerResult.error);
  var errorMessage = hasError ? (workerResult.error || '') : '';
  var resultModel = (workerResult && workerResult.model) || workerConfig.model;

  // 11. 审计写入（复用 worker-audit.record）
  // 不记录：prompt 原文、artifact 正文、key/token/header/cookie/path
  recordAuditLog({
    worker: workerId,
    model: resultModel,
    taskId: taskId,
    latency: latency,
    resultStatus: hasError ? 'error' : 'success',
    errorMessage: redactSensitive(errorMessage),
    outputText: outputText,
    promptHash: (workerResult && workerResult.promptHash) || undefined,
  });

  // 12. 生成输出（OpenAI error 时返回安全失败摘要）
  return generateOutput({
    workerId: workerId,
    provider: workerConfig.provider,
    model: resultModel,
    latency: latency,
    resultStatus: hasError ? 'error' : 'success',
    aiOutput: outputText,
    error: errorMessage,
  });
}

/**
 * 生成企业微信 Markdown 输出
 */
function generateOutput(params) {
  var lines = [];
  lines.push('# 🧪 AI 灰度测试报告');
  lines.push('');
  lines.push('> 单次 OpenAI 调用测试（安全、只读、可审计）');
  lines.push('');

  // 基本信息（全部脱敏 + Markdown 转义）
  lines.push('## 📊 调用信息');
  lines.push('');
  lines.push('| 字段 | 值 |');
  lines.push('|------|-----|');
  lines.push('| Worker | `' + sanitizeField(params.workerId) + '` |');
  lines.push('| Provider | `' + sanitizeField(params.provider) + '` |');
  lines.push('| Model | `' + sanitizeField(params.model) + '` |');
  lines.push('| 延迟 | ' + (params.latency / 1000).toFixed(2) + 's |');
  lines.push('| 状态 | ' + (params.resultStatus === 'success' ? '✅ 成功' : '❌ 失败') + ' |');
  lines.push('');

  // AI 输出摘要（脱敏 + 处理代码围栏 + Markdown 转义 + 截断）
  if (params.aiOutput) {
    lines.push('## 🤖 AI 输出摘要');
    lines.push('');
    var cleaned = sanitizeOutput(params.aiOutput);
    var summary = truncateText(cleaned, MAX_SUMMARY_LEN);
    lines.push('```');
    lines.push(summary);
    lines.push('```');
    lines.push('');
  }

  // 错误详情（脱敏）
  if (params.resultStatus === 'error' && params.error) {
    lines.push('## ⚠️ 错误详情');
    lines.push('');
    lines.push('```');
    lines.push(sanitizeField(params.error));
    lines.push('```');
    lines.push('');
  }

  // 安全说明
  lines.push('---');
  lines.push('');
  lines.push('> 🔒 ' + SAFETY_NOTE);
  lines.push('> - 不自动 apply / deploy / merge / rollback');
  lines.push('> - 不调用 DeepSeek / 豆包');
  lines.push('> - 不修改 /今日运营 主流程');
  lines.push('> - 不修改 Runtime Core 状态机/队列');

  return lines.join('\n');
}

// ============================================================
// Mock 模式（测试用 — 不依赖外部模块）
// ============================================================

function executeMock() {
  return generateOutput({
    workerId: 'planner-summary-worker',
    provider: 'openai',
    model: 'gpt-4o',
    latency: 2340,
    resultStatus: 'success',
    aiOutput: '【Mock】今日运营总结：GMV 环比 +12%，ROI 稳定在 2.3，风险可控。建议：加大投流力度，关注高价值 SKU 转化。',
    error: '',
  });
}

// ============================================================
// 导出
// ============================================================

module.exports = {
  execute: execute,
  executeMock: executeMock,
  desc: 'AI 灰度测试（planner-summary-worker OpenAI 单次调用）',

  // 安全函数导出（供测试用）
  redactSensitive: redactSensitive,
  escapeMarkdown: escapeMarkdown,
  sanitizeField: sanitizeField,
  sanitizeOutput: sanitizeOutput,
};
