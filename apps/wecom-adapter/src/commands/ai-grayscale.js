'use strict';

/**
 * ai-grayscale.js — /ai灰度 命令处理器
 *
 * 提供安全、只读、可审计的 planner-summary-worker → OpenAI 单次灰度测试入口。
 * 不修改 /今日运营 主流程，不接入 roi-analysis-worker / video-content-worker。
 *
 * Phase: Phase B Grayscale Test
 */

var path = require('path');
var fs = require('fs');

// 延迟加载依赖
var _openaiWorker = null;
var _workerRegistry = null;
var _workerAudit = null;

function getOpenAIWorker() {
  if (!_openaiWorker) {
    _openaiWorker = require('../orchestrator/workers/openai-worker');
  }
  return _openaiWorker;
}

function getWorkerRegistry() {
  if (!_workerRegistry) {
    _workerRegistry = require('../orchestrator/workers/worker-registry-loader');
  }
  return _workerRegistry;
}

function getWorkerAudit() {
  if (!_workerAudit) {
    try { _workerAudit = require('../orchestrator/workers/worker-audit'); } catch (e) { _workerAudit = null; }
  }
  return _workerAudit;
}

/** 安全标记 */
var SAFETY_NOTE = 'REVIEW_ONLY__NO_AUTO_APPLY — 本报告由 AI 灰度测试生成，不执行任何自动化操作';

/** 最大输出摘要长度 */
var MAX_SUMMARY_LEN = 800;

// ============================================================
// 工具函数
// ============================================================

/**
 * 清理文本中的敏感信息
 */
function sanitizeText(text) {
  if (!text) return '';
  return text
    .replace(/sk-[a-zA-Z0-9\-_]{10,}/g, '[MASKED_API_KEY]')
    .replace(/Bearer\s+[a-zA-Z0-9_\-\.]{10,}/gi, 'Bearer [MASKED]')
    .replace(/Authorization:\s*[^\s,;\|]{10,}/gi, 'Authorization: [MASKED]')
    .replace(/Cookie:\s*[^\s;`]{10,}/gi, 'Cookie: [MASKED]')
    .replace(/token\s*=\s*[^\s,;\|]{4,}/gi, 'token=[MASKED]')
    .replace(/key\s*=\s*[^\s,;\|]{4,}/gi, 'key=[MASKED]')
    .replace(/secret\s*=\s*[^\s,;\|]{4,}/gi, 'secret=[MASKED]')
    .replace(/password\s*=\s*[^\s,;\|]{4,}/gi, 'password=[MASKED]')
    .replace(/C:\\Users[^\s,;\|]*/gi, '[MASKED_PATH]')
    .replace(/C:\\Program[^\s,;\|]*/gi, '[MASKED_PATH]')
    .replace(/\/(home|opt|etc|root|var|usr|tmp)[^\s,;\|]*/gi, '[MASKED_PATH]')
    .replace(/\.env[^\s,;\|]*/gi, '[MASKED_PATH]')
    .replace(/\|/g, '\\|');
}

/**
 * 截断文本到指定长度
 */
function truncateText(text, maxLen) {
  if (!text) return '';
  if (text.length <= maxLen) return text;
  return text.substring(0, maxLen) + '...(截断)';
}

/**
 * 加载 prompt 文件
 */
function loadPrompt(promptFile) {
  try {
    var fullPath = path.resolve(__dirname, '..', '..', promptFile);
    if (!fs.existsSync(fullPath)) return null;
    return fs.readFileSync(fullPath, 'utf8');
  } catch (e) {
    return null;
  }
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

/**
 * 验证 worker prompt
 */
function validateWorkerPrompt(promptText) {
  if (!promptText) return false;
  var lower = promptText.toLowerCase();
  var blockedKeywords = [
    'apply patch', 'deploy', 'rollback', 'merge',
    '修改环境变量', 'nginx配置', '应用补丁',
    '自动部署', '自动发布', '生产环境部署',
  ];
  for (var i = 0; i < blockedKeywords.length; i++) {
    if (lower.indexOf(blockedKeywords[i]) !== -1) return false;
  }
  return true;
}

// ============================================================
// 主执行函数
// ============================================================

/**
 * 执行 /ai灰度 命令
 */
function execute(ctx) {
  var opts = ctx || {};
  var args = (opts.args || '').trim();
  var workerId = args || 'planner-summary-worker';

  // 1. 只允许 planner-summary-worker
  if (workerId !== 'planner-summary-worker') {
    return '⚠️ 灰度测试仅支持 **planner-summary-worker**\n\n' +
           '用法：\n```\n/ai灰度 planner-summary\n```';
  }

  // 2. 检查 Gate
  if (process.env.OPENAI_WORKER_ENABLED !== 'true') {
    return '⚠️ OPENAI_WORKER_ENABLED 未开启\n\n' +
           '请在 .env 中设置 `OPENAI_WORKER_ENABLED=true` 后重试。';
  }

  // 3. 加载 worker 配置
  var registry = getWorkerRegistry();
  var workerConfig = registry.getWorker ? registry.getWorker(workerId) : null;
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

  // 6. 加载 prompt
  var promptText = loadPrompt(workerConfig.promptFile);
  if (!promptText) {
    return '❌ 无法加载 Prompt 文件：' + workerConfig.promptFile;
  }

  // 7. 验证 prompt
  if (!validateWorkerPrompt(promptText)) {
    return '❌ Prompt 验证失败：包含敏感操作指令';
  }

  // 8. 检查 REVIEW_ONLY__NO_AUTO_APPLY
  if (promptText.indexOf('REVIEW_ONLY__NO_AUTO_APPLY') === -1) {
    return '❌ 安全标记缺失：Prompt 必须包含 REVIEW_ONLY__NO_AUTO_APPLY';
  }

  // 9. 检查 requiresHumanApproval
  if (workerConfig.requiresHumanApproval !== true) {
    return '❌ 安全属性缺失：requiresHumanApproval 必须为 true';
  }

  // 10. 构造最小只读 context
  var context = buildMinimalContext();

  // 11. 调用 executeOpenAIWorker
  var taskId = 'grayscale-test-' + Date.now();
  var startTime = Date.now();

  var workerResult;
  try {
    var openaiWorker = getOpenAIWorker();
    workerResult = openaiWorker.executeOpenAIWorker({
      taskId: taskId,
      workerId: workerId,
      provider: workerConfig.provider,
      model: workerConfig.model,
      prompt: promptText,
      context: context,
      userRequest: '灰度测试：生成今日运营总结',
    });
  } catch (e) {
    writeAuditLog({
      ts: new Date().toISOString(),
      worker: workerId,
      provider: workerConfig.provider,
      model: workerConfig.model,
      taskId: taskId,
      latency: Date.now() - startTime,
      tokenEstimate: 0,
      resultStatus: 'error',
      errorMessage: sanitizeText(e.message || String(e)),
    });
    return '❌ OpenAI Worker 调用失败\n\n' +
           '错误信息：\n```\n' + sanitizeText(e.message || String(e)) + '\n```\n\n' +
           SAFETY_NOTE;
  }

  var latency = Date.now() - startTime;
  var tokenEstimate = (workerResult && workerResult.usage && workerResult.usage.total_tokens) || 0;

  // 12. 写审计日志
  writeAuditLog({
    ts: new Date().toISOString(),
    worker: workerId,
    provider: workerConfig.provider,
    model: workerConfig.model,
    taskId: taskId,
    latency: latency,
    tokenEstimate: tokenEstimate,
    resultStatus: (workerResult && workerResult.success) ? 'success' : 'error',
    errorMessage: workerResult ? sanitizeText(workerResult.error || '') : '',
  });

  // 13. 生成输出
  return generateOutput({
    workerId: workerId,
    provider: workerConfig.provider,
    model: workerConfig.model,
    latency: latency,
    tokenEstimate: tokenEstimate,
    resultStatus: (workerResult && workerResult.success) ? 'success' : 'error',
    aiOutput: workerResult ? workerResult.content || '' : '',
    error: workerResult ? workerResult.error || '' : '未知错误',
  });
}

/**
 * 写审计日志
 */
function writeAuditLog(entry) {
  try {
    var audit = getWorkerAudit();
    if (audit && audit.writeAudit) {
      audit.writeAudit(entry);
    }
  } catch (e) {
    // 审计日志写入失败不阻塞主流程
  }
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

  // 基本信息
  lines.push('## 📊 调用信息');
  lines.push('');
  lines.push('| 字段 | 值 |');
  lines.push('|------|-----|');
  lines.push('| Worker | `' + sanitizeText(params.workerId) + '` |');
  lines.push('| Provider | `' + sanitizeText(params.provider) + '` |');
  lines.push('| Model | `' + sanitizeText(params.model) + '` |');
  lines.push('| 延迟 | ' + (params.latency / 1000).toFixed(2) + 's |');
  lines.push('| Token 估算 | ~' + (params.tokenEstimate >= 1000 ? (params.tokenEstimate / 1000).toFixed(1) + 'K' : params.tokenEstimate) + ' |');
  lines.push('| 状态 | ' + (params.resultStatus === 'success' ? '✅ 成功' : '❌ 失败') + ' |');
  lines.push('');

  // AI 输出摘要
  if (params.resultStatus === 'success' && params.aiOutput) {
    lines.push('## 🤖 AI 输出摘要');
    lines.push('');
    var summary = truncateText(params.aiOutput, MAX_SUMMARY_LEN);
    lines.push('```');
    lines.push(summary);
    lines.push('```');
    lines.push('');
  }

  // 错误详情
  if (params.resultStatus === 'error' && params.error) {
    lines.push('## ⚠️ 错误详情');
    lines.push('');
    lines.push('```');
    lines.push(sanitizeText(params.error));
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
// Mock 模式（测试用）
// ============================================================

function executeMock() {
  return generateOutput({
    workerId: 'planner-summary-worker',
    provider: 'openai',
    model: 'gpt-4o',
    latency: 2340,
    tokenEstimate: 850,
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
};
