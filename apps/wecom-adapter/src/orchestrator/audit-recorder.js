/**
 * audit-recorder.js
 * AI Orchestrator Runtime 审计记录器 v0.4
 *
 * JSONL 文件存储，每行一条审计记录。
 * 存储路径：apps/wecom-adapter/storage/orchestrator/audit-YYYYMMDD.jsonl
 */

const path = require('path');
const fs = require('fs');

const DEFAULT_STORAGE_DIR = path.resolve(__dirname, '..', '..', 'storage', 'orchestrator');

let _storageDir = DEFAULT_STORAGE_DIR;

function setStorageDir(dir) {
  _storageDir = dir;
}

function getStorageDir() {
  return _storageDir;
}

/**
 * 获取当日审计文件路径
 */
function getAuditPath(date) {
  const d = date || new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return path.join(_storageDir, `audit-${yyyy}${mm}${dd}.jsonl`);
}

function ensureDir() {
  if (!fs.existsSync(_storageDir)) {
    fs.mkdirSync(_storageDir, { recursive: true });
  }
}

function generateAuditId() {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).substring(2, 6);
  return `audit-${ts}-${rand}`;
}

/**
 * 记录一条审计
 *
 * @param {object} entry
 * @param {string} [entry.auditId] - 审计 ID（不传则自动生成）
 * @param {string} entry.taskId - 关联任务 ID
 * @param {string} entry.action - 操作名称
 * @param {string} entry.fromStatus - 源状态
 * @param {string} entry.toStatus - 目标状态
 * @param {string} entry.actor - 执行者
 * @param {string} entry.summary - 摘要
 * @param {string|null} [entry.rollbackHint] - 回滚提示
 * @returns {string} auditId
 */
function recordAudit(entry = {}) {
  ensureDir();

  const record = {
    auditId: entry.auditId || generateAuditId(),
    taskId: entry.taskId || '',
    action: entry.action || 'unknown',
    fromStatus: entry.fromStatus || '',
    toStatus: entry.toStatus || '',
    actor: entry.actor || 'system',
    summary: entry.summary || '',
    rollbackHint: entry.rollbackHint || null,
    timestamp: new Date().toISOString(),
  };

  const filePath = getAuditPath();
  const line = JSON.stringify(record) + '\n';
  fs.appendFileSync(filePath, line, 'utf-8');

  return record.auditId;
}

/**
 * 读取指定日期的审计记录
 *
 * @param {Date|string} [date] - 日期，默认今天
 * @returns {object[]}
 */
function readAudit(date) {
  const filePath = getAuditPath(date);
  if (!fs.existsSync(filePath)) {
    return [];
  }
  const text = fs.readFileSync(filePath, 'utf-8').trim();
  if (!text) return [];
  return text.split('\n').map(function(line) {
    try { return JSON.parse(line); } catch (e) { return null; }
  }).filter(Boolean);
}

/**
 * 根据 taskId 查询审计记录
 *
 * @param {string} taskId
 * @param {Date|string} [date]
 * @returns {object[]}
 */
function findAuditByTask(taskId, date) {
  const all = readAudit(date);
  return all.filter(function(r) { return r.taskId === taskId; });
}

/**
 * 根据 auditId 查询单条审计记录
 *
 * @param {string} auditId
 * @returns {object|null}
 */
function getAuditById(auditId) {
  const today = readAudit();
  const found = today.find(function(r) { return r.auditId === auditId; });
  if (found) return found;

  // 也尝试前一天
  const yesterday = new Date(Date.now() - 86400000);
  const prevDay = readAudit(yesterday);
  return prevDay.find(function(r) { return r.auditId === auditId; }) || null;
}

/**
 * 获取审计摘要
 */
function getAuditSummary(date) {
  const records = readAudit(date);
  const actions = {};
  records.forEach(function(r) {
    actions[r.action] = (actions[r.action] || 0) + 1;
  });
  return {
    total: records.length,
    actions,
    date: date ? new Date(date).toISOString().substring(0, 10) : new Date().toISOString().substring(0, 10),
  };
}

module.exports = {
  recordAudit,
  readAudit,
  findAuditByTask,
  getAuditById,
  getAuditSummary,
  setStorageDir,
  getStorageDir,
  getAuditPath,
};
