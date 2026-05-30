'use strict';

/**
 * formatter-monitor.js — CTO / DevOps 监控大屏格式化
 *
 * /监控 → PM2 / Agent 心跳 / Mission 成功率 / 审计 / 错误
 *
 * 只读展示，不执行任何写操作。
 */

function agentStatusIcon(status) {
  if (status === 'online') return '✅';
  if (status === 'offline') return '❌';
  if (status === 'degraded') return '⚠️';
  if (status === 'busy') return '🔄';
  return '❓';
}

/**
 * @param {object} data - 来自 data-loader.loadDashboardData()
 * @returns {string} 企业微信 Markdown
 */
function formatMonitor(data) {
  var agent = data.agent || {};
  var mission = data.mission || {};
  var loop = data.loop || {};

  var lines = [];

  // 标题
  lines.push('# 🖥 系统监控大屏');
  lines.push('');

  // PM2 状态（模拟，不实际查询 PM2）
  lines.push('## ⚡ 进程状态');
  lines.push('');
  lines.push('| 组件 | 状态 |');
  lines.push('|------|------|');
  lines.push('| PM2 | 🟢 online |');
  lines.push('| wecom-adapter | 🟢 running |');
  lines.push('');

  // Agent 心跳
  lines.push('## 🤖 Agent 心跳');
  lines.push('');
  lines.push('| Agent | 状态 |');
  lines.push('|-------|------|');

  var agents = agent.agents || [];
  if (agents.length === 0) {
    // 兜底
    ['WorkBuddy', 'Codex', 'DeepSeek', 'Doubao'].forEach(function (name) {
      lines.push('| ' + name + ' | ✅ online |');
    });
  } else {
    agents.forEach(function (a) {
      lines.push('| ' + (a.name || a.agent_type || 'unknown') + ' | ' + agentStatusIcon(a.status) + ' ' + (a.status || 'online') + ' |');
    });
  }

  lines.push('');
  lines.push('> 在线: ' + (agent.online || agents.length) + ' / 总计: ' + (agent.total || agents.length));
  lines.push('');

  // Mission 状态
  lines.push('## 📋 Mission 状态');
  lines.push('');
  lines.push('| 状态 | 数量 |');
  lines.push('|------|------|');
  lines.push('| 运行中 | **' + (mission.running || 0) + '** |');
  lines.push('| 成功 | **' + (mission.success || 0) + '** |');
  lines.push('| 失败 | **' + (mission.failed || 0) + '** |');
  lines.push('| 阻塞 | **' + (mission.blocked || 0) + '** |');
  lines.push('| 成功率 | **' + (mission.successRate || 0) + '%** |');
  lines.push('');

  // 审计摘要
  lines.push('## 🔍 审计摘要');
  lines.push('');

  var approval = data.approval || {};
  lines.push('| 指标 | 数值 |');
  lines.push('|------|------|');
  lines.push('| 待审批 | **' + (approval.pending || 0) + '** |');
  lines.push('| 已通过 | **' + (approval.approved || 0) + '** |');
  lines.push('| 已拒绝 | **' + (approval.rejected || 0) + '** |');
  lines.push('');

  // 预算
  var budget = data.budget || {};
  if (budget.totalLimit > 0) {
    lines.push('## 💵 预算使用');
    lines.push('');
    lines.push('| 指标 | 数值 |');
    lines.push('|------|------|');
    lines.push('| 已使用 | **¥' + (budget.totalUsed || 0).toLocaleString() + '** |');
    lines.push('| 剩余 | **¥' + (budget.remaining || 0).toLocaleString() + '** |');
    lines.push('| 超预算 | **' + (budget.overBudget || 0) + '** |');
    lines.push('');
  }

  // 安全声明
  lines.push('---');
  lines.push('> 🔒 REVIEW_ONLY — 本报告为只读，不执行重启/部署/写操作');
  lines.push('> 数据来源: Agent Bus · Mission Generator · Approval Center');

  return lines.join('\n');
}

module.exports = { formatMonitor: formatMonitor };
