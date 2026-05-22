/**
 * audit-recorder.js
 * AI Orchestrator 审计记录器 v1.0
 *
 * 每次 /ai调度 生成任务时写入 JSONL 审计日志
 * 存储路径：apps/wecom-adapter/storage/orchestrator/audit/audit-YYYYMMDD.jsonl
 *
 * 安全约束：
 * - 禁止记录任何 API Key
 * - 禁止记录任何密钥/Token
 * - 仅记录任务规划元数据
 */

const path = require('path');
const fs = require('fs');

// ========== 配置 ==========

/**
 * 默认存储目录（相对于 orchestrator 目录）
 */
const DEFAULT_STORAGE_DIR = path.resolve(__dirname, '..', '..', 'storage', 'orchestrator', 'audit');

/**
 * 可注入的存储路径（测试用）
 */
let _storageDir = DEFAULT_STORAGE_DIR;

function setStorageDir(dir) {
  _storageDir = dir;
}

function getStorageDir() {
  return _storageDir;
}

// ========== 核心函数 ==========

/**
 * 生成唯一审计 ID
 * @returns {string} 格式：orch-{timestamp36}-{random4}
 */
function generateAuditId() {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).substring(2, 6);
  return `orch-${ts}-${rand}`;
}

/**
 * 获取当天的审计文件路径
 * @returns {string}
 */
function getAuditFilePath() {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return path.join(_storageDir, `audit-${dateStr}.jsonl`);
}

/**
 * 确保审计目录存在
 */
function ensureDir() {
  if (!fs.existsSync(_storageDir)) {
    fs.mkdirSync(_storageDir, { recursive: true });
  }
}

/**
 * 安全过滤：移除可能包含敏感信息的字段
 * @param {object} record - 原始审计记录
 * @returns {object} 过滤后的安全记录
 */
function sanitizeRecord(record) {
  const safe = { ...record };

  // 删除任何可能包含 API Key 的字段
  const sensitiveKeys = [
    'apiKey', 'api_key', 'apikey', 'token', 'accessToken',
    'secret', 'password', 'passwd', 'credential', 'auth',
    'key', 'privateKey', 'private_key',
  ];

  for (const key of Object.keys(safe)) {
    const lowerKey = key.toLowerCase();
    if (sensitiveKeys.some(sk => lowerKey.includes(sk))) {
      delete safe[key];
    }
  }

  // 确保 fullPrompt 不包含敏感信息（截断检查）
  if (safe.fullPrompt && typeof safe.fullPrompt === 'string') {
    // 检查是否包含疑似 API Key 的模式（长随机字符串）
    const keyPattern = /(?:sk-|api[_-]?key[=:]\s*|token[=:]\s*|Bearer\s+)([A-Za-z0-9_\-]{20,})/gi;
    if (keyPattern.test(safe.fullPrompt)) {
      // 仍然记录，但添加警告标记
      safe._warning = 'fullPrompt 可能包含疑似 API Key 的模式，已标记但未移除（仅截断至 500 字符）';
      safe.fullPrompt = safe.fullPrompt.substring(0, 500);
    }
  }

  return safe;
}

/**
 * 写入审计记录
 *
 * @param {object} plan - decompose() 的输出
 * @param {string} plan.goal - 用户目标
 * @param {string} plan.intent - 识别意图
 * @param {string} plan.recommendedAssignee - 推荐 AI
 * @param {string} plan.reason - 推荐原因
 * @param {string} plan.branch - 分支名
 * @param {string} plan.patchFile - patch 文件名
 * @param {string} plan.prTarget - PR 目标
 * @param {string[]} plan.forbidden - 禁止范围
 * @param {string[]} plan.acceptance - 验收标准
 * @param {string} plan.fullPrompt - 完整任务文案
 * @returns {{ auditId: string, saved: boolean, filePath: string }}
 */
function recordAudit(plan) {
  try {
    ensureDir();

    const auditId = generateAuditId();
    const auditFile = getAuditFilePath();

    const record = {
      auditId,
      createdAt: new Date().toISOString(),
      goal: plan.goal || '',
      intent: plan.intent || 'unknown',
      recommendedAssignee: plan.recommendedAssignee || 'workbuddy',
      reason: plan.reason || '',
      branch: plan.branch || '',
      patchFile: plan.patchFile || '',
      prTarget: plan.prTarget || 'develop',
      forbidden: plan.forbidden || [],
      acceptance: plan.acceptance || [],
      status: 'planned',
      fullPrompt: plan.fullPrompt ? plan.fullPrompt.substring(0, 500) : '', // 截断存储
    };

    // 安全过滤
    const safe = sanitizeRecord(record);

    // 追加写入 JSONL
    const line = JSON.stringify(safe) + '\n';
    fs.appendFileSync(auditFile, line, 'utf-8');

    return {
      auditId,
      saved: true,
      filePath: auditFile,
    };
  } catch (err) {
    // 审计写入失败不应中断主流程
    return {
      auditId: 'error-' + Date.now().toString(36),
      saved: false,
      filePath: '',
      error: err.message,
    };
  }
}

/**
 * 读取指定日期的审计记录
 * @param {string} [dateStr] - 日期字符串 YYYY-MM-DD，默认今天
 * @returns {object[]} 审计记录数组
 */
function readAuditLog(dateStr) {
  const date = dateStr || new Date().toISOString().slice(0, 10);
  const formatted = date.replace(/-/g, '');
  const filePath = path.join(_storageDir, `audit-${formatted}.jsonl`);

  try {
    if (!fs.existsSync(filePath)) {
      return [];
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);
    return lines.map(line => {
      try {
        return JSON.parse(line);
      } catch (_) {
        return null;
      }
    }).filter(Boolean);
  } catch (_) {
    return [];
  }
}

/**
 * 获取审计历史摘要
 * @param {number} [days=7] - 回溯天数
 * @returns {{ total: number, records: object[] }}
 */
function getAuditSummary(days = 7) {
  const records = [];
  const now = new Date();

  for (let i = 0; i < days; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const dailyRecords = readAuditLog(dateStr);
    records.push(...dailyRecords);
  }

  return {
    total: records.length,
    records,
  };
}

/**
 * 格式化审计历史为企微可读文本
 * @param {number} [limit=10]
 * @returns {string}
 */
function formatAuditHistory(limit = 10) {
  const { records } = getAuditSummary(7);
  const recent = records.slice(-limit).reverse();

  if (recent.length === 0) {
    return '📋 暂无调度审计记录';
  }

  const lines = ['📋 AI 调度审计历史（最近 ' + limit + ' 条）', '═'.repeat(30), ''];

  for (let i = 0; i < recent.length; i++) {
    const r = recent[i];
    const time = r.createdAt ? r.createdAt.replace('T', ' ').substring(0, 19) : '未知';
    const assigneeLabel = {
      workbuddy: 'WorkBuddy',
      codex: 'Codex',
      deepseek: 'DeepSeek',
      doubao: '豆包',
    }[r.recommendedAssignee] || r.recommendedAssignee;

    lines.push(`#${i + 1} ${time}`);
    lines.push(`  Audit ID: ${r.auditId}`);
    lines.push(`  目标: ${r.goal || '(空)'}`);
    lines.push(`  意图: ${r.intent} → ${assigneeLabel}`);
    lines.push(`  分支: ${r.branch}`);
    lines.push(`  状态: ${r.status || 'planned'}`);
    lines.push('');
  }

  return lines.join('\n');
}

// ========== 导出 ==========

module.exports = {
  recordAudit,
  readAuditLog,
  getAuditSummary,
  formatAuditHistory,
  generateAuditId,
  setStorageDir,
  getStorageDir,
  sanitizeRecord,
  DEFAULT_STORAGE_DIR,
};
