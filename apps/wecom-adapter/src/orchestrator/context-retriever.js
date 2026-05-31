/**
 * context-retriever.js
 * Runtime Expansion Phase1 - Context Retriever
 *
 * 从 memory-index.js 检索历史上下文。
 * 支持按 taskId / intent / assignee 检索。
 */

var memoryIndex = require('./memory-index');

/**
 * 按 taskId 检索相关历史上下文
 * @param {string} taskId
 * @param {object} [options]
 * @param {number} [options.limit=10] - 最多返回条数
 * @returns {object} { taskId, related[], summary }
 */
function retrieveByTaskId(taskId, options) {
  var opts = options || {};
  var limit = opts.limit || 10;

  // 1. 精确匹配 taskId
  var exact = memoryIndex.findByTaskId(taskId);

  // 2. 如果 task 有关联的 intent，也检索同类 intent 的历史
  var intentRelated = [];
  if (exact.length > 0 && exact[0].intent) {
    intentRelated = memoryIndex.findByIntent(exact[0].intent)
      .filter(function (r) { return r.taskId !== taskId; });
  }

  var all = exact.concat(intentRelated);
  // 去重
  var seen = {};
  var unique = [];
  all.forEach(function (r) {
    if (!seen[r.id]) {
      seen[r.id] = true;
      unique.push(r);
    }
  });

  // 按 timestamp 降序，限制数量
  unique.sort(function (a, b) {
    return (b.timestamp || '').localeCompare(a.timestamp || '');
  });

  return {
    taskId: taskId,
    related: unique.slice(0, limit),
    summary: buildSummary(unique.slice(0, limit)),
  };
}

/**
 * 按 intent 检索相关历史上下文
 * @param {string} intent
 * @param {object} [options]
 * @param {number} [options.limit=10]
 * @returns {object} { intent, related[], summary }
 */
function retrieveByIntent(intent, options) {
  var opts = options || {};
  var limit = opts.limit || 10;

  var related = memoryIndex.findByIntent(intent);
  related.sort(function (a, b) {
    return (b.timestamp || '').localeCompare(a.timestamp || '');
  });

  return {
    intent: intent,
    related: related.slice(0, limit),
    summary: buildSummary(related.slice(0, limit)),
  };
}

/**
 * 按 assignee 检索相关历史上下文
 * @param {string} assignee
 * @param {object} [options]
 * @param {number} [options.limit=10]
 * @returns {object} { assignee, related[], summary }
 */
function retrieveByAssignee(assignee, options) {
  var opts = options || {};
  var limit = opts.limit || 10;

  var related = memoryIndex.findByAssignee(assignee);
  related.sort(function (a, b) {
    return (b.timestamp || '').localeCompare(a.timestamp || '');
  });

  return {
    assignee: assignee,
    related: related.slice(0, limit),
    summary: buildSummary(related.slice(0, limit)),
  };
}

/**
 * 综合检索：组合多个条件
 * @param {object} filters - { taskId, intent, assignee }
 * @param {number} [limit=10]
 * @returns {object} { filters, related[], summary }
 */
function retrieveCombined(filters, limit) {
  var lim = limit || 10;
  var results = [];

  if (filters.taskId) {
    results = results.concat(memoryIndex.findByTaskId(filters.taskId));
  }
  if (filters.intent) {
    results = results.concat(memoryIndex.findByIntent(filters.intent));
  }
  if (filters.assignee) {
    results = results.concat(memoryIndex.findByAssignee(filters.assignee));
  }

  // 去重
  var seen = {};
  var unique = [];
  results.forEach(function (r) {
    if (!seen[r.id]) {
      seen[r.id] = true;
      unique.push(r);
    }
  });

  unique.sort(function (a, b) {
    return (b.timestamp || '').localeCompare(a.timestamp || '');
  });

  return {
    filters: filters,
    related: unique.slice(0, lim),
    summary: buildSummary(unique.slice(0, lim)),
  };
}

/**
 * 构建摘要文本（供 AI 上下文使用）
 */
function buildSummary(entries) {
  if (!entries || entries.length === 0) {
    return '（无历史上下文）';
  }

  var lines = [
    '## 历史上下文（' + entries.length + ' 条）',
    '',
  ];

  entries.forEach(function (entry, i) {
    lines.push('[' + (i + 1) + '] ' + (entry.summary || '(无摘要)'));
    if (entry.intent) lines.push('    意图: ' + entry.intent);
    if (entry.assignee) lines.push('    指派: ' + entry.assignee);
    if (entry.timestamp) lines.push('    时间: ' + entry.timestamp);
    lines.push('');
  });

  return lines.join('\n');
}

/**
 * 格式化检索结果为 WeCom 可读文本
 */
function formatForWecom(retrievalResult) {
  if (!retrievalResult || !retrievalResult.related || retrievalResult.related.length === 0) {
    return '📭 无相关历史上下文。';
  }

  var lines = [
    '📚 历史上下文',
    '',
    '共 ' + retrievalResult.related.length + ' 条相关记录：',
    '',
  ];

  retrievalResult.related.forEach(function (entry, i) {
    lines.push('[' + (i + 1) + '] ' + (entry.summary || '(无摘要)'));
  });

  return lines.join('\n');
}

module.exports = {
  retrieveByTaskId: retrieveByTaskId,
  retrieveByIntent: retrieveByIntent,
  retrieveByAssignee: retrieveByAssignee,
  retrieveCombined: retrieveCombined,
  buildSummary: buildSummary,
  formatForWecom: formatForWecom,
};
