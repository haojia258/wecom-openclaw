'use strict';

/**
 * ai-audit-dashboard.js — AI 审计仪表板 v1
 *
 * 读取 Worker 调用审计日志，生成企业微信 Markdown 格式的可观测 Dashboard。
 *
 * 数据来源:
 *   - worker-audit.js (Worker 调用审计: ts, worker, model, latency, tokenEstimate, resultStatus)
 *   - audit-recorder.js (任务生命周期审计: taskId, action, status 流转)
 *   - worker-feature-gate.js (灰度开关状态)
 *   - worker-registry.js (Worker → provider/model 映射)
 *
 * 安全约束:
 *   - 不显示 prompt 原文
 *   - 不显示 API Key
 *   - 不显示 token/header
 *   - 不读取 artifact 正文
 *   - 不调用真实 AI API
 *
 * Phase: AI Audit Dashboard v1
 */

const fs = require('fs');
const path = require('path');

// ============================================================
// 内部依赖（延迟加载以避免循环依赖）
// ============================================================

var _workerAudit = null;
var _auditRecorder = null;
var _featureGate = null;
var _workerRegistry = null;

function getWorkerAudit() {
  if (!_workerAudit) _workerAudit = require('./worker-audit');
  return _workerAudit;
}

function getAuditRecorder() {
  if (!_auditRecorder) _auditRecorder = require('./audit-recorder');
  return _auditRecorder;
}

function getFeatureGate() {
  if (!_featureGate) _featureGate = require('./worker-feature-gate');
  return _featureGate;
}

function getWorkerRegistry() {
  if (!_workerRegistry) _workerRegistry = require('./workers/worker-registry');
  return _workerRegistry;
}

// ============================================================
// 配置
// ============================================================

/** 24 小时时间窗口 (ms) */
var RECENT_WINDOW_MS = 24 * 60 * 60 * 1000;

/** 最近失败最多显示条数 */
var MAX_RECENT_FAILURES = 10;

// ============================================================
// 数据读取
// ============================================================

/**
 * 解析 JSONL 文件
 * @param {string} filePath
 * @returns {object[]}
 */
function readJsonlFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return [];
    var content = fs.readFileSync(filePath, 'utf-8').trim();
    if (!content) return [];
    return content.split('\n').map(function (line) {
      try { return JSON.parse(line); } catch (_) { return null; }
    }).filter(Boolean);
  } catch (_) {
    return [];
  }
}

/**
 * 获取 Worker Audit 存储目录的文件列表 (今天 + 昨天)
 * @returns {string[]} 文件路径列表
 */
function getWorkerAuditFiles() {
  var audit = getWorkerAudit();
  var baseDir = audit.getStorageDir();

  // 今天
  var today = new Date();
  var todayStr = formatDate(today);
  var todayFile = path.join(baseDir, 'worker-audit-' + todayStr + '.jsonl');

  // 昨天
  var yesterday = new Date(Date.now() - 86400000);
  var yesterdayStr = formatDate(yesterday);
  var yesterdayFile = path.join(baseDir, 'worker-audit-' + yesterdayStr + '.jsonl');

  var files = [];
  if (fs.existsSync(todayFile)) files.push(todayFile);
  if (fs.existsSync(yesterdayFile)) files.push(yesterdayFile);
  return files;
}

/**
 * 获取 Audit Recorder 存储目录的文件列表 (今天 + 昨天)
 * @returns {string[]}
 */
function getAuditRecorderFiles() {
  var recorder = getAuditRecorder();
  var baseDir = recorder.getStorageDir();

  var today = new Date();
  var todayStr = formatDate(today);
  var todayFile = path.join(baseDir, 'audit-' + todayStr + '.jsonl');

  var yesterday = new Date(Date.now() - 86400000);
  var yesterdayStr = formatDate(yesterday);
  var yesterdayFile = path.join(baseDir, 'audit-' + yesterdayStr + '.jsonl');

  var files = [];
  if (fs.existsSync(todayFile)) files.push(todayFile);
  if (fs.existsSync(yesterdayFile)) files.push(yesterdayFile);
  return files;
}

/**
 * 格式化日期为 YYYYMMDD
 */
function formatDate(date) {
  var yyyy = date.getFullYear();
  var mm = String(date.getMonth() + 1).padStart(2, '0');
  var dd = String(date.getDate()).padStart(2, '0');
  return yyyy + mm + dd;
}

// ============================================================
// 数据聚合
// ============================================================

/**
 * 读取 24h 内所有 Worker 调用审计记录
 * @returns {object[]}
 */
function loadWorkerCalls() {
  var files = getWorkerAuditFiles();
  var cutoff = Date.now() - RECENT_WINDOW_MS;
  var allRecords = [];

  files.forEach(function (file) {
    var records = readJsonlFile(file);
    records.forEach(function (r) {
      if (!r || !r.ts) return;
      var ts = new Date(r.ts).getTime();
      if (ts >= cutoff) {
        allRecords.push(r);
      }
    });
  });

  // 按时间倒序
  allRecords.sort(function (a, b) {
    return new Date(b.ts).getTime() - new Date(a.ts).getTime();
  });

  return allRecords;
}

/**
 * 读取 24h 内所有任务生命周期审计记录
 * @returns {object[]}
 */
function loadTaskAudits() {
  var files = getAuditRecorderFiles();
  var cutoff = Date.now() - RECENT_WINDOW_MS;
  var allRecords = [];

  files.forEach(function (file) {
    var records = readJsonlFile(file);
    records.forEach(function (r) {
      if (!r || !r.timestamp) return;
      var ts = new Date(r.timestamp).getTime();
      if (ts >= cutoff) {
        allRecords.push(r);
      }
    });
  });

  return allRecords;
}

/**
 * 计算 Worker 调用统计
 * @param {object[]} calls
 * @returns {object}
 */
function computeWorkerStats(calls) {
  var stats = {
    total: calls.length,
    success: 0,
    error: 0,
    rejected: 0,
    totalTokens: 0,
    latencySum: 0,
    latencyCount: 0,
    byWorker: {},
    failures: [],
  };

  calls.forEach(function (r) {
    // 状态计数
    if (r.resultStatus === 'success') stats.success++;
    if (r.resultStatus === 'error') stats.error++;
    if (r.resultStatus === 'rejected') stats.rejected++;

    // token 累计
    if (typeof r.tokenEstimate === 'number' && r.tokenEstimate > 0) {
      stats.totalTokens += r.tokenEstimate;
    }

    // 延迟累计 (只算有效值)
    if (typeof r.latency === 'number' && r.latency >= 0) {
      stats.latencySum += r.latency;
      stats.latencyCount++;
    }

    // 按 Worker 分组
    var worker = r.worker || 'unknown';
    if (!stats.byWorker[worker]) {
      stats.byWorker[worker] = {
        total: 0, success: 0, error: 0, rejected: 0,
        tokens: 0, latencySum: 0, latencyCount: 0,
      };
    }
    stats.byWorker[worker].total++;
    if (r.resultStatus === 'success') stats.byWorker[worker].success++;
    if (r.resultStatus === 'error') stats.byWorker[worker].error++;
    if (r.resultStatus === 'rejected') stats.byWorker[worker].rejected++;
    if (typeof r.tokenEstimate === 'number') stats.byWorker[worker].tokens += r.tokenEstimate;
    if (typeof r.latency === 'number' && r.latency >= 0) {
      stats.byWorker[worker].latencySum += r.latency;
      stats.byWorker[worker].latencyCount++;
    }

    // 收集失败记录
    if (r.resultStatus === 'error' || r.resultStatus === 'rejected') {
      stats.failures.push(r);
    }
  });

  // 只保留最近 N 条失败
  stats.failures = stats.failures.slice(0, MAX_RECENT_FAILURES);

  return stats;
}

/**
 * 计算任务审计统计
 * @param {object[]} audits
 * @returns {object}
 */
function computeTaskStats(audits) {
  var taskActions = {};
  audits.forEach(function (a) {
    var action = a.action || 'unknown';
    taskActions[action] = (taskActions[action] || 0) + 1;
  });

  return {
    totalTasks: audits.length,
    actions: taskActions,
  };
}

/**
 * 获取 Worker 的 provider/model 信息
 */
function getWorkerProviderInfo(workerName) {
  var registry = getWorkerRegistry();
  // 尝试按 workerId 查找
  var worker = registry.getWorker(workerName);
  if (worker) {
    return { provider: worker.provider, model: worker.model, name: worker.name };
  }
  // 回退：尝试按 role 查找
  worker = registry.getWorkerByRole(workerName);
  if (worker) {
    return { provider: worker.provider, model: worker.model, name: worker.name };
  }
  return { provider: 'unknown', model: 'unknown', name: workerName };
}

// ============================================================
// Markdown 渲染
// ============================================================

/**
 * 格式化毫秒为可读延迟
 */
function formatLatency(ms) {
  if (ms < 1000) return ms + 'ms';
  if (ms < 60000) return (ms / 1000).toFixed(1) + 's';
  return (ms / 60000).toFixed(1) + 'min';
}

/**
 * 格式化 token 数量
 */
function formatTokens(n) {
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(n);
}

/**
 * 格式化时间戳为可读时间
 */
function formatTime(ts) {
  var d = new Date(ts);
  var hh = String(d.getHours()).padStart(2, '0');
  var mm = String(d.getMinutes()).padStart(2, '0');
  var ss = String(d.getSeconds()).padStart(2, '0');
  return hh + ':' + mm + ':' + ss;
}

/**
 * 统一脱敏函数 — 对所有输出到企业微信 Markdown 的字段做安全处理
 *
 * 覆盖:
 *   - sk- 开头 API key
 *   - Bearer token / Authorization header
 *   - Cookie header
 *   - token= / key= / secret= / password= 键值对
 *   - Windows 绝对路径 (C:\, D:\ 等)
 *   - Linux 绝对路径 (/home, /opt, /etc, /root 等)
 *   - .env 路径片段
 *
 * @param {*} value - 任意值（字符串/数字/对象等）
 * @returns {string} 脱敏后的安全字符串
 */
function redactSensitive(value) {
  if (value == null) return '';
  if (typeof value !== 'string') value = String(value);

  // 1. sk- 开头的 API key（OpenAI 格式）
  value = value.replace(/\bsk-[a-zA-Z0-9\-_]{10,}\b/g, '[MASKED_API_KEY]');

  // 2. Bearer token（独立或跟在 Authorization: 后面）
  value = value.replace(/\bBearer\s+[^,\s\n\r|]{10,}/gi, 'Bearer [MASKED]');

  // 3. Authorization: xxx 完整 header（允许空格，匹配多词值如 Bearer xxx）
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

  // 9. Windows 绝对路径 (C:\Users\xxx, D:\path\xxx 等)
  value = value.replace(/[A-Za-z]:\\(?:Users|Program|Windows|WINDOWS|ProgramData)[^,;\s]*/gi, '[MASKED_PATH]');

  // 10. Linux 绝对路径 (/home, /opt, /etc, /root, /var, /usr, /tmp 开头)
  value = value.replace(/\/(?:home|opt|etc|root|var|usr|tmp)\/[^,\s;|]*/g, '[MASKED_PATH]');

  // 11. .env 路径片段（含独立 .env 词）
  value = value.replace(/[^\s,;|]*\\\.env[^\s,;|]*/gi, '[MASKED_PATH]');
  value = value.replace(/[^\s,;|]*\/\.env[^\s,;|]*/g, '[MASKED_PATH]');
  // 独立 .env 词（不被字母数字包围）
  value = value.replace(/(^|\s)\.env(?=\s|$)/g, '$1[MASKED_PATH]');

  return value;
}

/**
 * Markdown 转义 — 防止表格注入和格式破坏
 *
 * 在 Markdown 表格单元格中：
 *   - | 会被解析为列分隔符，需要转义为 \|
 *   - 反引号、星号等可安全保留（WeChat Work 支持）
 *
 * @param {*} value
 * @returns {string}
 */
function escapeMarkdown(value) {
  if (value == null) return '';
  if (typeof value !== 'string') value = String(value);
  // 对 Markdown 表格有特殊含义的字符做转义
  value = value.replace(/\|/g, '\\|');
  return value;
}

/**
 * 安全字段处理 — 脱敏 + Markdown 转义
 * 所有输出到企业微信 Markdown 的字段都必须经过此函数
 *
 * @param {*} value
 * @returns {string}
 */
function sanitizeField(value) {
  return escapeMarkdown(redactSensitive(value));
}

/**
 * 状态徽章
 */
function statusBadge(status) {
  if (status === 'success') return '✅';
  if (status === 'error') return '❌';
  if (status === 'rejected') return '🚫';
  return '❓';
}

/**
 * 渲染 WeChat Work Markdown Dashboard
 */
function renderMarkdown(workerStats, taskStats, featureGateStatus) {
  var lines = [];

  // 标题
  lines.push('# 🤖 AI 审计仪表板');
  lines.push('> 最近 24 小时 AI Worker 调用可观测报告');
  lines.push('');

  // === 功能开关状态 ===
  lines.push('## ⚙️ Feature Gate');
  var gateIcon = featureGateStatus === 'enabled' ? '🟢' : '🔴';
  var gateLabel = featureGateStatus === 'enabled' ? '已启用' : '已禁用';
  lines.push('> ' + gateIcon + ' OPENAI_WORKER_ENABLED: **' + gateLabel + '**');
  lines.push('');

  // === 概览卡片 ===
  lines.push('## 📊 调用概览');
  lines.push('');
  var successRate = workerStats.total > 0
    ? ((workerStats.success / workerStats.total) * 100).toFixed(1)
    : '0.0';
  var avgLat = workerStats.latencyCount > 0
    ? Math.round(workerStats.latencySum / workerStats.latencyCount)
    : 0;

  lines.push('| 指标 | 数值 |');
  lines.push('|------|------|');
  lines.push('| 总调用次数 | **' + workerStats.total + '** |');
  lines.push('| 成功 / 失败 / 拒绝 | ' + workerStats.success + ' / ' + workerStats.error + ' / ' + workerStats.rejected + ' |');
  lines.push('| 成功率 | **' + successRate + '%** |');
  lines.push('| 平均延迟 | ' + formatLatency(avgLat) + ' |');
  lines.push('| Token 估算 | ~' + formatTokens(workerStats.totalTokens) + ' |');
  lines.push('');

  // === 按 Worker 分组 ===
  var workerNames = Object.keys(workerStats.byWorker);
  if (workerNames.length > 0) {
    lines.push('## 👷 Worker 分组');
    lines.push('> failure = error + rejected（失败包含错误和拒绝）');
    lines.push('');
    lines.push('| Worker | Provider | Model | 调用 | 成功 | 失败 | 拒绝 | 延迟(avg) | Token |');
    lines.push('|--------|----------|-------|------|------|------|------|-----------|-------|');

    workerNames.forEach(function (name) {
      var ws = workerStats.byWorker[name];
      var info = getWorkerProviderInfo(name);
      var wAvgLat = ws.latencyCount > 0
        ? Math.round(ws.latencySum / ws.latencyCount)
        : 0;

      lines.push(
        '| ' + sanitizeField(name) +
        ' | ' + sanitizeField(info.provider) +
        ' | ' + sanitizeField(info.model) +
        ' | ' + ws.total +
        ' | ' + ws.success +
        ' | ' + ws.error +
        ' | ' + ws.rejected +
        ' | ' + formatLatency(wAvgLat) +
        ' | ~' + formatTokens(ws.tokens) +
        ' |'
      );
    });
    lines.push('');
  }

  // === 最近失败 ===
  if (workerStats.failures.length > 0) {
    lines.push('## ⚠️ 最近失败 (' + workerStats.failures.length + ')');
    lines.push('');

    workerStats.failures.forEach(function (f, i) {
      var time = f.ts ? formatTime(f.ts) : '--:--:--';
      var badge = statusBadge(f.resultStatus);
      var reason = '';
      if (f.resultStatus === 'rejected' && f.rejectReason) {
        reason = sanitizeField(f.rejectReason);
      } else if (f.resultStatus === 'error' && f.errorMessage) {
        // sanitize: 脱敏后截断到 80 字符
        var sanitized = sanitizeField(f.errorMessage);
        reason = sanitized.length > 80
          ? sanitized.substring(0, 80) + '...'
          : sanitized;
      } else {
        reason = '(无详细信息)';
      }

      lines.push((i + 1) + '. ' + badge + ' `' + time + '` **' + sanitizeField(f.worker || 'unknown') + '** (' + sanitizeField(f.model || '?') + ')');
      lines.push('   > ' + reason);
    });
    lines.push('');
  } else {
    lines.push('## ⚠️ 最近失败');
    lines.push('> 无失败记录 ✅');
    lines.push('');
  }

  // === 任务审计摘要 ===
  if (taskStats.totalTasks > 0) {
    lines.push('## 📋 任务审计');
    lines.push('> 任务事件总数: **' + taskStats.totalTasks + '**');
    var actionNames = Object.keys(taskStats.actions);
    if (actionNames.length > 0) {
      lines.push('');
      actionNames.forEach(function (action) {
        lines.push('- ' + sanitizeField(action) + ': ' + taskStats.actions[action] + ' 次');
      });
    }
    lines.push('');
  }

  // === 安全声明 ===
  lines.push('---');
  lines.push('> 🔒 REVIEW_ONLY__NO_AUTO_APPLY — 本报告由审计系统自动生成');
  lines.push('> 数据来源: worker-audit JSONL · 时间窗口: 最近 24h');
  lines.push('> 未包含: prompt 原文 · API Key · artifact 正文');

  return lines.join('\n');
}

// ============================================================
// 主入口
// ============================================================

/**
 * 生成 AI 审计仪表板报告
 *
 * @param {object} [opts]
 * @param {boolean} [opts.mock] - 使用 mock 数据（测试用）
 * @param {string}  [opts.dataDir] - 自定义数据目录（测试用）
 * @returns {string} WeChat Work Markdown 格式报告
 */
function generate(opts) {
  opts = opts || {};

  // Mock 模式：返回示例数据
  if (opts.mock) {
    return generateMock();
  }

  // 如果指定了自定义数据目录，设置它
  if (opts.dataDir) {
    getWorkerAudit().setStorageDir(opts.dataDir);
  }

  // 读取数据
  var workerCalls = loadWorkerCalls();
  var taskAudits = loadTaskAudits();

  // 聚合
  var workerStats = computeWorkerStats(workerCalls);
  var taskStats = computeTaskStats(taskAudits);

  // Feature gate 状态
  var gateStatus = getFeatureGate().getStatus();

  // 渲染
  return renderMarkdown(workerStats, taskStats, gateStatus);
}

/**
 * 生成 Mock 报告（用于测试和演示）
 */
function generateMock() {
  var mockCalls = [
    { ts: new Date(Date.now() - 1800000).toISOString(), worker: 'planner-summary-worker', model: 'gpt-4o', latency: 2340, tokenEstimate: 850, resultStatus: 'success' },
    { ts: new Date(Date.now() - 3600000).toISOString(), worker: 'planner-summary-worker', model: 'gpt-4o', latency: 1890, tokenEstimate: 720, resultStatus: 'success' },
    { ts: new Date(Date.now() - 7200000).toISOString(), worker: 'roi-analysis-worker', model: 'deepseek-chat', latency: 3450, tokenEstimate: 1100, resultStatus: 'success' },
    { ts: new Date(Date.now() - 10800000).toISOString(), worker: 'video-content-worker', model: 'doubao-pro', latency: 4120, tokenEstimate: 1560, resultStatus: 'success' },
    { ts: new Date(Date.now() - 14400000).toISOString(), worker: 'planner-summary-worker', model: 'gpt-4o', latency: -1, tokenEstimate: 0, resultStatus: 'rejected', rejectReason: 'GATE_DISABLED: OPENAI_WORKER_ENABLED is not true' },
    { ts: new Date(Date.now() - 18000000).toISOString(), worker: 'risk-review-worker', model: 'rules-engine', latency: 150, tokenEstimate: 45, resultStatus: 'success' },
    { ts: new Date(Date.now() - 21600000).toISOString(), worker: 'roi-analysis-worker', model: 'deepseek-chat', latency: -1, tokenEstimate: 0, resultStatus: 'error', errorMessage: 'API timeout after 30s (sanitized)' },
  ];

  var mockTaskAudits = [
    { action: 'create', timestamp: new Date(Date.now() - 1800000).toISOString() },
    { action: 'plan', timestamp: new Date(Date.now() - 3600000).toISOString() },
    { action: 'dispatch', timestamp: new Date(Date.now() - 7200000).toISOString() },
    { action: 'receive_artifact', timestamp: new Date(Date.now() - 10800000).toISOString() },
    { action: 'review', timestamp: new Date(Date.now() - 14400000).toISOString() },
  ];

  var workerStats = computeWorkerStats(mockCalls);
  var taskStats = computeTaskStats(mockTaskAudits);
  var gateStatus = 'enabled'; // mock 显示已启用

  return renderMarkdown(workerStats, taskStats, gateStatus);
}

// ============================================================
// 导出
// ============================================================

module.exports = {
  generate: generate,
  generateMock: generateMock,
  // 安全函数（对外导出供测试用）
  redactSensitive: redactSensitive,
  escapeMarkdown: escapeMarkdown,
  sanitizeField: sanitizeField,
  // 内部函数导出（供测试使用）
  _loadWorkerCalls: loadWorkerCalls,
  _loadTaskAudits: loadTaskAudits,
  _computeWorkerStats: computeWorkerStats,
  _computeTaskStats: computeTaskStats,
  _renderMarkdown: renderMarkdown,
  _readJsonlFile: readJsonlFile,
  _formatLatency: formatLatency,
  _formatTokens: formatTokens,
  _formatTime: formatTime,
  _statusBadge: statusBadge,
  _getWorkerProviderInfo: getWorkerProviderInfo,
  // 常量
  RECENT_WINDOW_MS: RECENT_WINDOW_MS,
  MAX_RECENT_FAILURES: MAX_RECENT_FAILURES,
};
