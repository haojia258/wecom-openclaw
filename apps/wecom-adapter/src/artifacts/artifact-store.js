'use strict';

/**
 * artifact-store.js - Artifact 持久化存储 (P10.3)
 *
 * 每个 mission 自动生成 workspace:
 *   workspace/artifacts/missions/<mission_id>/
 *
 * 支持保存的 artifact 类型:
 *   plan.md, graph.json, dispatch.json, patch.diff,
 *   test-report.json, audit.md, recovery-log.json
 */

var fs = require('fs');
var path = require('path');
var policy = require('./artifact-policy');

// ─── 目录管理 ──────────────────────────────────────────────

/**
 * 确保 mission workspace 目录存在
 * @param {string} missionId
 * @returns {string} mission workspace 目录路径
 */
function ensureMissionDir(missionId) {
  var root = policy.getWorkspaceRoot();
  var dir = path.join(root, 'missions', missionId);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

// ─── Artifact 操作 ─────────────────────────────────────────

/**
 * 保存 artifact 文件
 * @param {object} opts
 * @param {string} opts.mission_id
 * @param {string} opts.filename
 * @param {string} opts.agent
 * @param {string|Buffer} opts.content
 * @returns {{ success: boolean, metadata?: object, error?: string }}
 */
function saveArtifact(opts) {
  var missionId = opts.mission_id;
  var filename = opts.filename;
  var agent = opts.agent || 'unknown';
  var content = opts.content;

  // Step 1: 路径安全验证
  var pathResult = policy.resolveArtifactPath(missionId, filename);
  if (!pathResult.valid) {
    return { success: false, error: pathResult.reason };
  }

  // Step 2: 内容安全验证
  var contentResult = policy.validateContent(filename, content);
  if (!contentResult.valid) {
    return { success: false, error: contentResult.reason };
  }

  // Step 3: 确保目录存在
  ensureMissionDir(missionId);

  // Step 4: 写入文件
  try {
    var buf = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf-8');
    fs.writeFileSync(pathResult.fullPath, buf);
  } catch (e) {
    return { success: false, error: '文件写入失败: ' + e.message };
  }

  // Step 5: 生成元数据
  var metadata = policy.generateMetadata(missionId, filename, agent, content);

  // Step 6: 保存元数据索引
  _saveMetadata(missionId, metadata);

  return { success: true, metadata: metadata };
}

/**
 * 读取 artifact 文件
 * @param {string} missionId
 * @param {string} filename
 * @returns {{ success: boolean, content?: string, metadata?: object, error?: string }}
 */
function readArtifact(missionId, filename) {
  // 路径安全验证
  var pathResult = policy.resolveArtifactPath(missionId, filename);
  if (!pathResult.valid) {
    return { success: false, error: pathResult.reason };
  }

  // 检查文件是否存在
  if (!fs.existsSync(pathResult.fullPath)) {
    return { success: false, error: '文件不存在: ' + filename };
  }

  try {
    var content = fs.readFileSync(pathResult.fullPath, 'utf-8');
    var stats = fs.statSync(pathResult.fullPath);

    return {
      success: true,
      content: content,
      metadata: {
        mission_id: missionId,
        filename: filename,
        size: stats.size,
        created_at: stats.birthtime.toISOString(),
        modified_at: stats.mtime.toISOString()
      }
    };
  } catch (e) {
    return { success: false, error: '文件读取失败: ' + e.message };
  }
}

/**
 * 列出 mission 下的所有 artifacts
 * @param {string} missionId
 * @returns {{ success: boolean, artifacts?: Array, error?: string }}
 */
function listArtifacts(missionId) {
  // 验证 mission_id
  var midResult = policy.validateMissionId(missionId);
  if (!midResult.valid) {
    return { success: false, error: midResult.reason };
  }

  var root = policy.getWorkspaceRoot();
  var missionDir = path.join(root, 'missions', missionId);

  if (!fs.existsSync(missionDir)) {
    return { success: true, artifacts: [] };
  }

  try {
    var files = fs.readdirSync(missionDir);

    var artifacts = [];
    for (var i = 0; i < files.length; i++) {
      var filename = files[i];

      // 跳过非 artifact 文件（如索引文件）
      if (filename.startsWith('.') || filename === '_index.json') continue;

      var fnResult = policy.validateFilename(filename);
      if (!fnResult.valid) continue;

      var filePath = path.join(missionDir, filename);
      var stats = fs.statSync(filePath);

      // 尝试从索引文件获取完整元数据
      var meta = _readMetadata(missionId, filename);
      if (!meta) {
        meta = {
          mission_id: missionId,
          filename: filename,
          size: stats.size,
          created_at: stats.birthtime.toISOString()
        };
      }

      artifacts.push(meta);
    }

    return { success: true, artifacts: artifacts };
  } catch (e) {
    return { success: false, error: '列出文件失败: ' + e.message };
  }
}

// ─── 元数据索引 (私有) ─────────────────────────────────────

var _metadataCache = {}; // missionId -> { filename: metadata }

/**
 * 保存 artifact 元数据到内存 cache + 磁盘索引
 */
function _saveMetadata(missionId, metadata) {
  if (!_metadataCache[missionId]) {
    _metadataCache[missionId] = {};
  }
  _metadataCache[missionId][metadata.filename] = metadata;

  // 写入磁盘索引
  try {
    var root = policy.getWorkspaceRoot();
    var missionDir = path.join(root, 'missions', missionId);
    ensureMissionDir(missionId);

    var indexPath = path.join(missionDir, '_index.json');
    var index = {};
    if (fs.existsSync(indexPath)) {
      try {
        index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
      } catch (e) { /* 索引损坏则重建 */ }
    }
    index[metadata.filename] = metadata;
    fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf-8');
  } catch (e) {
    // 索引写入失败不影响主流程
  }
}

/**
 * 读取 artifact 元数据
 */
function _readMetadata(missionId, filename) {
  // 先从 cache 读取
  if (_metadataCache[missionId] && _metadataCache[missionId][filename]) {
    return _metadataCache[missionId][filename];
  }

  // 从磁盘索引读取
  try {
    var root = policy.getWorkspaceRoot();
    var indexPath = path.join(root, 'missions', missionId, '_index.json');
    if (fs.existsSync(indexPath)) {
      var index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
      if (index[filename]) {
        // 回填到 cache
        if (!_metadataCache[missionId]) {
          _metadataCache[missionId] = {};
        }
        _metadataCache[missionId][filename] = index[filename];
        return index[filename];
      }
    }
  } catch (e) { /* ignore */ }

  return null;
}

// ─── 导出 ──────────────────────────────────────────────────

module.exports = {
  saveArtifact: saveArtifact,
  readArtifact: readArtifact,
  listArtifacts: listArtifacts,
  ensureMissionDir: ensureMissionDir,

  // 导出供测试
  _metadataCache: _metadataCache,
  _readMetadata: _readMetadata,
  _saveMetadata: _saveMetadata,
};
