'use strict';

/**
 * memory-command.js — P13.5 Long-term Memory Commands
 *
 * /记忆     — 记忆库总览 + 存储统计
 * /经营历史 — 按时间窗口查询历史趋势
 * /记忆存档 — 手动触发快照存档
 */

var ltm = require('../skills/long-term-memory/long-term-memory');

// ─── /记忆 ─────────────────────────────────────────────────

function handleMemory() {
  var stats90 = ltm.getMemoryStats(90);
  var stats30 = ltm.getMemoryStats(30);
  var stats7 = ltm.getMemoryStats(7);

  var lines = [
    '🧠 **经营记忆库总览**',
    '',
    '| 时间窗口 | KPI | 预算 | 策略 | 董事会 | 合计 |',
    '|----------|-----|------|------|--------|------|',
    '| 7天 | ' + stats7.kpi + ' | ' + stats7.budget + ' | ' + stats7.strategy + ' | ' + stats7.board + ' | **' + stats7.total + '** |',
    '| 30天 | ' + stats30.kpi + ' | ' + stats30.budget + ' | ' + stats30.strategy + ' | ' + stats30.board + ' | **' + stats30.total + '** |',
    '| 90天 | ' + stats90.kpi + ' | ' + stats90.budget + ' | ' + stats90.strategy + ' | ' + stats90.board + ' | **' + stats90.total + '** |',
    '',
    '**存储路径**: `storage/memory/`',
    '**格式**: JSONL (每行一条快照)',
    '',
  ];

  // 最新快照
  var latestKPI = ltm.getHistory('kpi', 1);
  var latestBudget = ltm.getHistory('budget', 1);
  var latestBoard = ltm.getHistory('board', 1);

  if (latestKPI.latest) {
    lines.push('**最新 KPI**: ' + latestKPI.latest.ts.split('T')[0]);
  }
  if (latestBoard.latest) {
    lines.push('**最新董事会**: ' + latestBoard.latest.data.decision + ' (评分: ' + latestBoard.latest.data.score + '/100)');
  }

  lines.push('');
  lines.push('💡 `/经营历史 kpi 7` 最近7天KPI趋势');
  lines.push('💡 `/经营历史 board 30` 最近30天董事会记录');
  lines.push('💡 `/记忆存档` 手动存档当前快照');

  return lines.join('\n');
}

// ─── /经营历史 ─────────────────────────────────────────────

function handleHistory(args) {
  var params = (args || '').trim().split(/\s+/);
  var type = (params[0] || 'kpi').toLowerCase();
  var days = parseInt(params[1], 10) || 30;

  var validTypes = ['kpi', 'budget', 'strategy', 'board'];
  if (validTypes.indexOf(type) === -1) {
    type = 'kpi';
  }

  var history = ltm.getHistory(type, days);

  var lines = [
    '📜 **经营历史 — ' + getTypeLabel(type) + ' (' + days + '天)**',
    '',
    '记录数: ' + history.count + ' | 趋势: ' + trendEmoji(history.trend) + ' ' + trendLabel(history.trend),
    '',
    '---',
    '',
  ];

  if (history.count === 0) {
    lines.push('⚠️ 暂无 ' + type + ' 类型历史数据。');
    lines.push('');
    lines.push('💡 发送 `/记忆存档` 创建第一条快照。');
    return lines.join('\n');
  }

  // 最近 10 条摘要
  var recent = history.records.slice(0, Math.min(10, history.records.length));
  lines.push('**最近记录**:');
  lines.push('');

  recent.forEach(function (r, idx) {
    var date = r.ts.split('T')[0];
    var summary = '';
    switch (type) {
      case 'kpi':
        summary = 'GMV: ¥' + ((r.data.gmv || 0).toLocaleString()) + ' | 利润率: ' + ((r.data.profitMargin || 0) * 100).toFixed(1) + '% | ROI: ' + (r.data.roi || 0).toFixed(2);
        break;
      case 'budget':
        summary = '评分: ' + (r.data.score || 'N/A') + '/100 | 状态: ' + (r.data.status || 'N/A') + ' | 使用率: ' + ((r.data.spendRate || 0) * 100).toFixed(1) + '%';
        break;
      case 'strategy':
        summary = 'Plan: ' + (r.data.planId || 'N/A') + ' | 风险: ' + (r.data.riskLevel || 'N/A');
        break;
      case 'board':
        summary = '决议: ' + (r.data.decision || 'N/A') + ' | 评分: ' + (r.data.score || 'N/A') + '/100 | ' + (r.data.summary || '');
        break;
    }
    lines.push((idx + 1) + '. `' + date + '` ' + summary);
  });

  if (history.count > 10) {
    lines.push('');
    lines.push('... 等 ' + (history.count - 10) + ' 条');
  }

  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push(history.summary);
  lines.push('');
  lines.push('💡 `/记忆存档` 存档新快照 | `/记忆` 总览');

  return lines.join('\n');
}

// ─── /记忆存档 ─────────────────────────────────────────────

function handleArchive() {
  var results = ltm.archiveAll();

  var lines = [
    '💾 **记忆存档完成**',
    '',
    '存档时间: ' + results.archivedAt.split('T')[0] + ' ' + results.archivedAt.split('T')[1].split('.')[0],
    '',
  ];

  var types = ['kpi', 'budget', 'strategy', 'board'];
  types.forEach(function (type) {
    var emoji = type === 'kpi' ? '📊' : type === 'budget' ? '💰' : type === 'strategy' ? '🎯' : '🏛';
    lines.push('- ' + emoji + ' ' + getTypeLabel(type) + ': ' + (results[type] ? '✅ 已存档' : '⚠️ 跳过'));
  });

  lines.push('');
  lines.push('💡 `/经营历史 kpi 7` 查看最近KPI趋势');
  lines.push('💡 `/记忆` 查看记忆库总览');

  return lines.join('\n');
}

// ─── 工具函数 ──────────────────────────────────────────────

function getTypeLabel(type) {
  var labels = { kpi: 'KPI', budget: '预算', strategy: '策略', board: '董事会' };
  return labels[type] || type;
}

function trendEmoji(trend) {
  switch (trend) {
    case 'up': return '📈';
    case 'down': return '📉';
    default: return '➡️';
  }
}

function trendLabel(trend) {
  switch (trend) {
    case 'up': return '上升';
    case 'down': return '下降';
    default: return '平稳';
  }
}

// ─── 导出 ──────────────────────────────────────────────────

module.exports = {
  handleMemory: handleMemory,
  handleHistory: handleHistory,
  handleArchive: handleArchive,
};

if (require.main === module) {
  var args = process.argv.slice(2);
  var sub = args[0] || 'memory';
  if (sub === 'archive' || sub === '存档') console.log(handleArchive());
  else if (sub === 'history' || sub === '历史') console.log(handleHistory(args.slice(1).join(' ')));
  else console.log(handleMemory());
}
