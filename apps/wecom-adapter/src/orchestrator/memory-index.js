/**
 * memory-index.js
 * Runtime Expansion Phase1 - Semantic Memory Layer（轻量版）
 *
 * 不做 embedding / 向量数据库。
 * 只维护 4 个 JSON 索引文件（存储在 storage/orchestrator/memory/）：
 *   - patch-history.idx.json
 *   - review-history.idx.json
 *   - task-history.idx.json
 *   - strategy-history.idx.json
 *
 * 每个索引条目：{ id, taskId, intent, assignee, timestamp, summary, result }
 */

const path = require('path');
const fs = require('fs');

var STORAGE_DIR = path.join(__dirname, '..', '..', 'storage', 'orchestrator', 'memory');

var INDEX_FILES = {
  patch: 'patch-history.idx.json',
  review: 'review-history.idx.json',
  task: 'task-history.idx.json',
  strategy: 'strategy-history.idx.json',
};

// 缓存
var _cache = {};

/**
 * 确保存储目录存在
 */
function _ensureDir() {
  if (!fs.existsSync(STORAGE_DIR)) {
    fs.mkdirSync(STORAGE_DIR, { recursive: true });
  }
}

/**
 * 读取索引（带缓存）
 */
function _readIndex(type) {
  if (_cache[type]) return _cache[type];

  var filePath = path.join(STORAGE_DIR, INDEX_FILES[type]);
  if (!fs.existsSync(filePath)) {
    _cache[type] = [];
    return _cache[type];
  }

  try {
    var content = fs.readFileSync(filePath, 'utf8');
    _cache[type] = JSON.parse(content);
  } catch (e) {
    _cache[type] = [];
  }

  return _cache[type];
}

/**
 * 写入索引（持久化 + 更新缓存）
 */
function _writeIndex(type, data) {
  _ensureDir();
  _cache[type] = data;

  var filePath = path.join(STORAGE_DIR, INDEX_FILES[type]);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

/**
 * 添加索引条目
 * @param {string} type - patch | review | task | strategy
 * @param {object} entry - { taskId, intent, assignee, summary, result }
 * @returns {object} 新条目（含 id 和 timestamp）
 */
function addEntry(type, entry) {
  if (!INDEX_FILES[type]) {
    return { error: 'Unknown index type: ' + type };
  }

  var index = _readIndex(type);
  var id = Date.now().toString(36) + '-' + Math.random().toString(36).substr(2, 6);

  var record = Object.assign({}, entry, {
    id: id,
    type: type,
    timestamp: new Date().toISOString(),
  });

  index.push(record);
  _writeIndex(type, index);

  return record;
}

/**
 * 按 taskId 检索
 * @param {string} taskId
 * @returns {object[]}
 */
function findByTaskId(taskId) {
  var results = [];
  Object.keys(INDEX_FILES).forEach(function (type) {
    var index = _readIndex(type);
    index.forEach(function (rec) {
      if (rec.taskId === taskId) {
        results.push(rec);
      }
    });
  });
  return results;
}

/**
 * 按 intent 检索
 * @param {string} intent
 * @returns {object[]}
 */
function findByIntent(intent) {
  var results = [];
  Object.keys(INDEX_FILES).forEach(function (type) {
    var index = _readIndex(type);
    index.forEach(function (rec) {
      if (rec.intent === intent) {
        results.push(rec);
      }
    });
  });
  return results;
}

/**
 * 按 assignee 检索
 * @param {string} assignee
 * @returns {object[]}
 */
function findByAssignee(assignee) {
  var results = [];
  Object.keys(INDEX_FILES).forEach(function (type) {
    var index = _readIndex(type);
    index.forEach(function (rec) {
      if (rec.assignee === assignee) {
        results.push(rec);
      }
    });
  });
  return results;
}

/**
 * 列出某类型的所有条目（可选限制数量）
 * @param {string} type
 * @param {number} [limit]
 * @returns {object[]}
 */
function listEntries(type, limit) {
  if (!INDEX_FILES[type]) return [];
  var index = _readIndex(type);
  var sliced = limit ? index.slice(-limit) : index;
  return sliced;
}

/**
 * 清除缓存（测试用）
 */
function clearCache() {
  _cache = {};
}

/**
 * 获取索引文件路径（测试用）
 */
function getIndexPath(type) {
  return path.join(STORAGE_DIR, INDEX_FILES[type] || '');
}

module.exports = {
  addEntry: addEntry,
  findByTaskId: findByTaskId,
  findByIntent: findByIntent,
  findByAssignee: findByAssignee,
  listEntries: listEntries,
  clearCache: clearCache,
  getIndexPath: getIndexPath,
  INDEX_TYPES: Object.keys(INDEX_FILES),
  _STORAGE_DIR: STORAGE_DIR,
};
