'use strict';

/**
 * memory-store.js — P13.5 JSONL Memory Store
 *
 * 追加式 JSONL 持久化存储。
 * 每行一条快照，支持时间范围查询和类型过滤。
 */

var fs = require('fs');
var path = require('path');

var STORE_DIR = path.join(__dirname, '..', '..', '..', 'storage', 'memory');
var INDEX_FILE = path.join(STORE_DIR, 'index.json');

// 初始化
try { fs.mkdirSync(STORE_DIR, { recursive: true }); } catch (_) {}

// ─── 写入 ──────────────────────────────────────────────────

/**
 * 追加一条快照
 * @param {string} type - kpi / budget / strategy / board
 * @param {object} data - 快照数据
 */
function append(type, data) {
  var now = new Date();
  var dateStr = now.toISOString().split('T')[0];
  var fileName = type + '-' + dateStr + '.jsonl';
  var filePath = path.join(STORE_DIR, fileName);

  var record = {
    ts: now.toISOString(),
    type: type,
    data: data,
  };

  fs.appendFileSync(filePath, JSON.stringify(record) + '\n', 'utf-8');
  _updateIndex(type, dateStr, fileName);
  return record;
}

// ─── 索引 ──────────────────────────────────────────────────

function _updateIndex(type, dateStr, fileName) {
  var index = {};
  try { index = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf-8')); } catch (_) {}

  if (!index[type]) index[type] = {};
  if (!index[type][dateStr]) index[type][dateStr] = [];

  if (index[type][dateStr].indexOf(fileName) === -1) {
    index[type][dateStr].push(fileName);
  }

  fs.writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2), 'utf-8');
}

// ─── 查询 ──────────────────────────────────────────────────

/**
 * 按时间范围查询快照
 * @param {string} type - kpi / budget / strategy / board
 * @param {number} days - 查询最近 N 天（默认 30）
 * @returns {object[]} 快照数组
 */
function query(type, days) {
  days = days || 30;
  var now = new Date();
  var results = [];

  // 计算日期范围
  for (var i = 0; i < days; i++) {
    var d = new Date(now);
    d.setDate(d.getDate() - i);
    var dateStr = d.toISOString().split('T')[0];

    // 按类型-日期读取文件
    var fileName = type + '-' + dateStr + '.jsonl';
    var filePath = path.join(STORE_DIR, fileName);

    if (fs.existsSync(filePath)) {
      try {
        var lines = fs.readFileSync(filePath, 'utf-8').trim().split('\n');
        lines.forEach(function (line) {
          if (line.trim()) results.push(JSON.parse(line));
        });
      } catch (_) {}
    }
  }

  // 按时间降序
  results.sort(function (a, b) {
    return a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0;
  });

  return results;
}

/**
 * 获取所有类型的最近记录数
 * @param {number} days - 查询最近 N 天
 * @returns {object} { kpi: N, budget: N, strategy: N, board: N }
 */
function stats(days) {
  days = days || 30;
  var result = { total: 0 };
  var types = ['kpi', 'budget', 'strategy', 'board'];

  types.forEach(function (type) {
    var records = query(type, days);
    result[type] = records.length;
    result.total += records.length;
  });

  return result;
}

/**
 * 获取全部类型的历史
 * @param {number} days
 * @returns {object} { kpi: [...], budget: [...], strategy: [...], board: [...] }
 */
function queryAll(days) {
  days = days || 30;
  return {
    kpi: query('kpi', days),
    budget: query('budget', days),
    strategy: query('strategy', days),
    board: query('board', days),
  };
}

// ─── 导出 ──────────────────────────────────────────────────

module.exports = {
  STORE_DIR: STORE_DIR,
  append: append,
  query: query,
  queryAll: queryAll,
  stats: stats,
};
