'use strict';

/**
 * artifact-index.js - Artifact 索引与查询 (P10.3)
 *
 * 提供跨 mission 的 artifact 搜索和聚合能力。
 * 在内存中维护索引，支持按 mission_id、agent、artifact_type 等维度查询。
 */

var fs = require('fs');
var path = require('path');
var policy = require('./artifact-policy');

// ─── 索引结构 ──────────────────────────────────────────────

/**
 * 全局 artifact 索引
 * { "missionId/filename": metadata, ... }
 */
var _globalIndex = {};

/**
 * 构建全局索引的 key
 */
function _indexKey(missionId, filename) {
  return missionId + '/' + filename;
}

// ─── 索引操作 ──────────────────────────────────────────────

/**
 * 将 artifact 元数据注册到全局索引
 * @param {object} metadata - from generateMetadata or artifact-store
 */
function indexArtifact(metadata) {
  var key = _indexKey(metadata.mission_id, metadata.filename);
  _globalIndex[key] = metadata;
}

/**
 * 从全局索引中移除
 * @param {string} missionId
 * @param {string} filename
 */
function deindexArtifact(missionId, filename) {
  var key = _indexKey(missionId, filename);
  delete _globalIndex[key];
}

// ─── 查询 ──────────────────────────────────────────────────

/**
 * 按 mission_id 列出所有 artifacts
 * @param {string} missionId
 * @returns {Array}
 */
function listByMission(missionId) {
  var prefix = missionId + '/';
  var result = [];

  for (var key in _globalIndex) {
    if (_globalIndex.hasOwnProperty(key) && key.startsWith(prefix)) {
      result.push(_globalIndex[key]);
    }
  }

  // 按创建时间倒序
  result.sort(function (a, b) {
    return (b.created_at || '').localeCompare(a.created_at || '');
  });

  return result;
}

/**
 * 按 agent 查询所有 artifacts
 * @param {string} agent
 * @returns {Array}
 */
function listByAgent(agent) {
  var result = [];
  for (var key in _globalIndex) {
    if (_globalIndex.hasOwnProperty(key) && _globalIndex[key].agent === agent) {
      result.push(_globalIndex[key]);
    }
  }

  result.sort(function (a, b) {
    return (b.created_at || '').localeCompare(a.created_at || '');
  });

  return result;
}

/**
 * 按 artifact_type 查询所有 artifacts
 * @param {string} artifactType - "md", "json", "diff"
 * @returns {Array}
 */
function listByType(artifactType) {
  var result = [];
  for (var key in _globalIndex) {
    if (_globalIndex.hasOwnProperty(key) && _globalIndex[key].artifact_type === artifactType) {
      result.push(_globalIndex[key]);
    }
  }

  result.sort(function (a, b) {
    return (b.created_at || '').localeCompare(a.created_at || '');
  });

  return result;
}

/**
 * 获取单个 artifact 的索引元数据
 * @param {string} missionId
 * @param {string} filename
 * @returns {object|null}
 */
function getArtifactMeta(missionId, filename) {
  var key = _indexKey(missionId, filename);
  return _globalIndex[key] || null;
}

/**
 * 获取索引统计
 * @returns {object}
 */
function getIndexStats() {
  var missions = {};
  var types = {};
  var agents = {};

  for (var key in _globalIndex) {
    if (!_globalIndex.hasOwnProperty(key)) continue;
    var meta = _globalIndex[key];

    missions[meta.mission_id] = (missions[meta.mission_id] || 0) + 1;
    types[meta.artifact_type] = (types[meta.artifact_type] || 0) + 1;
    agents[meta.agent] = (agents[meta.agent] || 0) + 1;
  }

  return {
    total_artifacts: Object.keys(_globalIndex).length,
    missions: missions,
    types: types,
    agents: agents,
    timestamp: new Date().toISOString()
  };
}

/**
 * 按条件组合查询
 * @param {object} filter - { mission_id?, agent?, artifact_type? }
 * @returns {Array}
 */
function searchArtifacts(filter) {
  var result = [];
  for (var key in _globalIndex) {
    if (!_globalIndex.hasOwnProperty(key)) continue;
    var meta = _globalIndex[key];
    var match = true;

    if (filter.mission_id && meta.mission_id !== filter.mission_id) match = false;
    if (filter.agent && meta.agent !== filter.agent) match = false;
    if (filter.artifact_type && meta.artifact_type !== filter.artifact_type) match = false;

    if (match) result.push(meta);
  }

  result.sort(function (a, b) {
    return (b.created_at || '').localeCompare(a.created_at || '');
  });

  return result;
}

/**
 * 清空索引（测试用）
 */
function clearIndex() {
  _globalIndex = {};
}

/**
 * 扫描磁盘重建索引
 */
function rebuildIndex() {
  clearIndex();

  var root = policy.getWorkspaceRoot();
  var missionsDir = path.join(root, 'missions');

  if (!fs.existsSync(missionsDir)) return;

  var missionIds = fs.readdirSync(missionsDir);
  for (var i = 0; i < missionIds.length; i++) {
    var mid = missionIds[i];
    var missionDir = path.join(missionsDir, mid);
    if (!fs.statSync(missionDir).isDirectory()) continue;

    var indexPath = path.join(missionDir, '_index.json');
    if (fs.existsSync(indexPath)) {
      try {
        var index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
        for (var fname in index) {
          if (index.hasOwnProperty(fname)) {
            indexArtifact(index[fname]);
          }
        }
      } catch (e) { /* skip corrupt index */ }
    }
  }
}

// ─── 导出 ──────────────────────────────────────────────────

module.exports = {
  indexArtifact: indexArtifact,
  deindexArtifact: deindexArtifact,
  listByMission: listByMission,
  listByAgent: listByAgent,
  listByType: listByType,
  getArtifactMeta: getArtifactMeta,
  getIndexStats: getIndexStats,
  searchArtifacts: searchArtifacts,
  clearIndex: clearIndex,
  rebuildIndex: rebuildIndex,
  _globalIndex: _globalIndex,
};
