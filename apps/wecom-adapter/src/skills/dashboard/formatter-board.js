'use strict';

/**
 * formatter-board.js — Executive Board 大屏格式化
 *
 * /董事会 → CEO/COO/CTO/CMO/CFO 投票、策略、审批状态
 *
 * 只读展示，不执行任何写操作。
 */

/**
 * @param {object} data - 来自 data-loader.loadDashboardData()
 * @returns {string} 企业微信 Markdown
 */
function formatBoard(data) {
  var board = data.board || {};
  var strategy = data.strategy || {};
  var approval = data.approval || {};
  var organization = data.organization || {};

  var lines = [];

  // 标题
  lines.push('# 🏛 AI 董事会');
  lines.push('');

  // 董事会成员投票状态
  lines.push('## 👥 董事会成员');
  lines.push('');

  var members = board.members || ['CEO Agent', 'COO Agent', 'CTO Agent', 'CMO Agent', 'CFO Agent'];
  var votes = board.votes || {};

  lines.push('| 角色 | 投票 |');
  lines.push('|------|------|');

  members.forEach(function (m) {
    var vote = votes[m] || 'Approve';
    var icon = vote === 'Approve' ? '✅' : vote === 'Reject' ? '❌' : vote === 'Needs Info' ? 'ℹ️' : '👤';
    lines.push('| ' + m + ' | ' + icon + ' ' + vote + ' |');
  });

  lines.push('');

  // 评审统计
  var reviews = board.reviews || {};
  lines.push('| 指标 | 数值 |');
  lines.push('|------|------|');
  lines.push('| 总评审 | **' + (reviews.total || 0) + '** |');
  lines.push('| 进行中 | **' + (reviews.in_review || 0) + '** |');
  lines.push('| 已完成 | **' + (reviews.completed || 0) + '** |');
  lines.push('');

  // 最新策略
  lines.push('## 📋 最新策略');
  lines.push('');

  var strategies = strategy.strategies || [];
  if (strategies.length === 0) {
    lines.push('> 暂无活跃策略');
  } else {
    strategies.slice(0, 5).forEach(function (s, i) {
      var text = typeof s === 'string' ? s : (s.text || s.type || '未命名策略');
      var status = s.status || 'draft';
      var icon = status === 'active' ? '🟢' : status === 'draft' ? '📝' : '⚪';
      lines.push((i + 1) + '. ' + icon + ' ' + text);
    });
  }

  lines.push('');

  // 审批中心
  lines.push('## ⏸️ 审批中心');
  lines.push('');
  lines.push('| 状态 | 数量 |');
  lines.push('|------|------|');
  lines.push('| 待审批 | **' + (approval.pending || 0) + '** |');
  lines.push('| 已通过 | **' + (approval.approved || 0) + '** |');
  lines.push('| 已拒绝 | **' + (approval.rejected || 0) + '** |');
  lines.push('');

  // 组织架构
  var roles = organization.roles || [];
  if (roles.length > 0) {
    lines.push('## 🏗 组织架构');
    lines.push('');
    roles.forEach(function (r) {
      lines.push('- **' + r.role + '** (L' + (r.level || '?') + '): ' + (r.domains || []).join(', '));
    });
    lines.push('');
  }

  // 安全声明
  lines.push('---');
  lines.push('> 🔒 REVIEW_ONLY — 董事会大屏为只读展示，不执行投票/审批');
  lines.push('> 数据来源: Executive Board · Strategy Engine · Approval Center · Organization');

  return lines.join('\n');
}

module.exports = { formatBoard: formatBoard };
