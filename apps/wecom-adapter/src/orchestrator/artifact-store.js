/**
 * artifact-store.js
 * AI Orchestrator Runtime 产物存储 v0.4
 *
 * 每个 taskId 一个目录，保存：
 *   - prompt.txt    任务文案
 *   - patch.diff    patch 文件
 *   - review.md     审查结果
 *   - diff.txt      差异输出
 *   - logs.txt      执行日志
 *   - rollbackPlan.md 回滚计划
 *
 * 存储路径：apps/wecom-adapter/storage/orchestrator/artifacts/{taskId}/
 */

const path = require('path');
const fs = require('fs');

const DEFAULT_BASE_DIR = path.resolve(__dirname, '..', '..', 'storage', 'orchestrator', 'artifacts');

let _baseDir = DEFAULT_BASE_DIR;

function setBaseDir(dir) {
  _baseDir = dir;
}

function getBaseDir() {
  return _baseDir;
}

/**
 * 获取 taskId 对应的产物目录
 */
function getArtifactDir(taskId) {
  return path.join(_baseDir, taskId);
}

/**
 * 确保产物目录存在
 */
function ensureArtifactDir(taskId) {
  const dir = getArtifactDir(taskId);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * 保存产物
 *
 * @param {string} taskId
 * @param {string} type - 'prompt' | 'patch' | 'review' | 'diff' | 'logs' | 'rollbackPlan'
 * @param {string} content - 内容
 */
function saveArtifact(taskId, type, content) {
  const dir = ensureArtifactDir(taskId);
  const fileMap = {
    prompt: 'prompt.txt',
    patch: 'patch.diff',
    review: 'review.md',
    diff: 'diff.txt',
    logs: 'logs.txt',
    rollbackPlan: 'rollbackPlan.md',
  };

  const filename = fileMap[type];
  if (!filename) {
    throw new Error(`Unknown artifact type: ${type}. Valid: ${Object.keys(fileMap).join(', ')}`);
  }

  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

/**
 * 读取产物
 *
 * @param {string} taskId
 * @param {string} type
 * @returns {string|null} 内容
 */
function readArtifact(taskId, type) {
  const fileMap = {
    prompt: 'prompt.txt',
    patch: 'patch.diff',
    review: 'review.md',
    diff: 'diff.txt',
    logs: 'logs.txt',
    rollbackPlan: 'rollbackPlan.md',
  };

  const filename = fileMap[type];
  if (!filename) {
    throw new Error(`Unknown artifact type: ${type}`);
  }

  const filePath = path.join(getArtifactDir(taskId), filename);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return fs.readFileSync(filePath, 'utf-8');
}

/**
 * 批量保存产物
 *
 * @param {string} taskId
 * @param {object} artifacts - { prompt?, patch?, review?, diff?, logs?, rollbackPlan? }
 */
function saveArtifacts(taskId, artifacts = {}) {
  const saved = {};
  for (const [type, content] of Object.entries(artifacts)) {
    if (content) {
      saved[type] = saveArtifact(taskId, type, content);
    }
  }
  return saved;
}

/**
 * 列出 taskId 的所有产物
 */
function listArtifacts(taskId) {
  const dir = getArtifactDir(taskId);
  if (!fs.existsSync(dir)) {
    return [];
  }
  return fs.readdirSync(dir).filter((f) => f !== '.' && f !== '..');
}

/**
 * 检查 taskId 是否有某产物
 */
function hasArtifact(taskId, type) {
  const content = readArtifact(taskId, type);
  return content !== null;
}

/**
 * 获取产物文件路径（不读取内容）
 */
function getArtifactPath(taskId, type) {
  const fileMap = {
    prompt: 'prompt.txt',
    patch: 'patch.diff',
    review: 'review.md',
    diff: 'diff.txt',
    logs: 'logs.txt',
    rollbackPlan: 'rollbackPlan.md',
  };
  const filename = fileMap[type];
  if (!filename) {
    throw new Error(`Unknown artifact type: ${type}`);
  }
  return path.join(getArtifactDir(taskId), filename);
}

module.exports = {
  saveArtifact,
  saveArtifacts,
  readArtifact,
  listArtifacts,
  hasArtifact,
  getArtifactDir,
  getArtifactPath,
  ensureArtifactDir,
  setBaseDir,
  getBaseDir,
};
