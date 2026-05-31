'use strict';

/**
 * artifact-policy.js - Artifact 安全策略 (P10.3)
 *
 * 安全约束：
 *   1. 禁止路径穿越 (../)
 *   2. 禁止绝对路径写入
 *   3. 单文件最大 1MB
 *   4. 仅允许写入 workspace/artifacts/
 *   5. JSON artifact 必须可 parse
 *   6. 白名单文件类型 (md, json, diff)
 */

var path = require('path');
var fs = require('fs');
var crypto = require('crypto');

// ─── 常量 ──────────────────────────────────────────────────

var MAX_FILE_SIZE = 1 * 1024 * 1024; // 1MB
var ALLOWED_EXTENSIONS = ['.md', '.json', '.diff'];
var ALLOWED_MIME_TYPES = {
  '.md':   'text/markdown',
  '.json': 'application/json',
  '.diff': 'text/x-diff'
};

// ─── 路径安全 ──────────────────────────────────────────────

/**
 * 计算 artifact workspace 根目录的绝对路径
 * @returns {string}
 */
function getWorkspaceRoot() {
  // 支持测试注入：优先使用环境变量 ARTIFACT_WORKSPACE_ROOT
  if (process.env.ARTIFACT_WORKSPACE_ROOT) {
    return process.env.ARTIFACT_WORKSPACE_ROOT;
  }
  // workspace/artifacts/ at repo root
  return path.resolve(__dirname, '..', '..', '..', '..', '..', 'workspace', 'artifacts');
}

/**
 * 验证文件名不包含路径穿越字符
 * @param {string} filename
 * @returns {{ valid: boolean, reason?: string }}
 */
function validateFilename(filename) {
  if (!filename || typeof filename !== 'string') {
    return { valid: false, reason: 'filename 不能为空' };
  }

  // 禁止路径穿越
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return { valid: false, reason: '禁止路径穿越: ' + filename };
  }

  // 禁止空文件名或以点开头（隐藏文件）
  if (filename.startsWith('.')) {
    return { valid: false, reason: '禁止隐藏文件: ' + filename };
  }

  // 校验扩展名
  var ext = path.extname(filename).toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return { valid: false, reason: '不支持的文件类型: ' + ext + ' (允许: ' + ALLOWED_EXTENSIONS.join(', ') + ')' };
  }

  return { valid: true };
}

/**
 * 验证 mission_id 格式（只允许字母数字和常见分隔符）
 * @param {string} missionId
 * @returns {{ valid: boolean, reason?: string }}
 */
function validateMissionId(missionId) {
  if (!missionId || typeof missionId !== 'string') {
    return { valid: false, reason: 'mission_id 不能为空' };
  }

  // 仅允许字母数字、点、短横、下划线
  if (!/^[a-zA-Z0-9._-]+$/.test(missionId)) {
    return { valid: false, reason: 'mission_id 包含非法字符: ' + missionId };
  }

  return { valid: true };
}

/**
 * 验证并解析完整的 artifact 路径（防穿越）
 * @param {string} missionId
 * @param {string} filename
 * @returns {{ valid: boolean, reason?: string, fullPath?: string }}
 */
function resolveArtifactPath(missionId, filename) {
  // Step 1: 验证 mission_id
  var midResult = validateMissionId(missionId);
  if (!midResult.valid) return midResult;

  // Step 2: 验证 filename
  var fnResult = validateFilename(filename);
  if (!fnResult.valid) return fnResult;

  // Step 3: 构建路径
  var root = getWorkspaceRoot();
  var missionDir = path.join(root, 'missions', missionId);
  var fullPath = path.join(missionDir, filename);

  // Step 4: 二次确认解析后路径仍在 workspace/artifacts/ 内
  var normalizedRoot = path.resolve(root) + path.sep;
  var normalizedPath = path.resolve(fullPath);
  if (!normalizedPath.startsWith(normalizedRoot)) {
    return { valid: false, reason: '路径越界: artifact 必须在 workspace/artifacts/ 内' };
  }

  return { valid: true, fullPath: normalizedPath, missionDir: missionDir };
}

// ─── 内容安全 ──────────────────────────────────────────────

/**
 * 验证 artifact 内容
 * @param {string} filename
 * @param {string|Buffer} content
 * @returns {{ valid: boolean, reason?: string }}
 */
function validateContent(filename, content) {
  // 大小检查
  var size = Buffer.isBuffer(content) ? content.length : Buffer.byteLength(content, 'utf-8');
  if (size > MAX_FILE_SIZE) {
    return { valid: false, reason: '文件超过 1MB 限制: ' + (size / 1024 / 1024).toFixed(2) + 'MB' };
  }

  // JSON 可 parse 检查
  var ext = path.extname(filename).toLowerCase();
  if (ext === '.json') {
    try {
      JSON.parse(Buffer.isBuffer(content) ? content.toString('utf-8') : content);
    } catch (e) {
      return { valid: false, reason: 'JSON 解析失败: ' + e.message };
    }
  }

  return { valid: true };
}

// ─── 元数据 ────────────────────────────────────────────────

/**
 * 生成 artifact 元数据
 * @param {string} missionId
 * @param {string} filename
 * @param {string} agent
 * @param {string|Buffer} content
 * @returns {object}
 */
function generateMetadata(missionId, filename, agent, content) {
  var buf = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf-8');
  var ext = path.extname(filename).toLowerCase().substring(1); // remove leading dot

  return {
    mission_id: missionId,
    artifact_type: ext,
    filename: filename,
    agent: agent || 'unknown',
    created_at: new Date().toISOString(),
    size: buf.length,
    sha256: crypto.createHash('sha256').update(buf).digest('hex')
  };
}

// ─── 导出 ──────────────────────────────────────────────────

module.exports = {
  getWorkspaceRoot: getWorkspaceRoot,
  validateMissionId: validateMissionId,
  validateFilename: validateFilename,
  resolveArtifactPath: resolveArtifactPath,
  validateContent: validateContent,
  generateMetadata: generateMetadata,
  MAX_FILE_SIZE: MAX_FILE_SIZE,
  ALLOWED_EXTENSIONS: ALLOWED_EXTENSIONS,
  ALLOWED_MIME_TYPES: ALLOWED_MIME_TYPES,
};
