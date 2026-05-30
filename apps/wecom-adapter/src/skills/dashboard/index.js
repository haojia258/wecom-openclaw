'use strict';

/**
 * index.js — Dashboard Skill 入口
 *
 * 提供统一的 Dashboard 数据加载和格式化入口。
 *
 * 安全约束：
 *   - 只读展示
 *   - 不执行下单/改价/改库存/报名活动/部署/重启
 *   - 不修改 .env/nginx/Vault/PM2/生产密钥
 */

var { loadDashboardData } = require('./data-loader');
var { formatCEO } = require('./formatter-ceo');
var { formatMonitor } = require('./formatter-monitor');
var { formatBoard } = require('./formatter-board');
var { formatOps } = require('./formatter-ops');

/**
 * 运行 Dashboard
 * @param {string} type - 'ceo' | 'monitor' | 'board' | 'ops'
 * @returns {Promise<string>} 企业微信 Markdown
 */
async function runDashboard(type) {
  type = type || 'ceo';

  var data;
  try {
    data = loadDashboardData();
  } catch (err) {
    return '⚠️ Dashboard 数据加载失败: ' + (err.message || '未知错误') + '\n\n请检查系统状态后重试。';
  }

  try {
    if (type === 'monitor') return formatMonitor(data);
    if (type === 'board') return formatBoard(data);
    if (type === 'ops') return formatOps(data);
    return formatCEO(data);
  } catch (err) {
    return '⚠️ Dashboard 格式化失败: ' + (err.message || '未知错误') + '\n\n请检查系统状态后重试。';
  }
}

module.exports = {
  runDashboard: runDashboard,
  // 导出格式化函数供测试使用
  _formatCEO: formatCEO,
  _formatMonitor: formatMonitor,
  _formatBoard: formatBoard,
  _formatOps: formatOps,
  _loadDashboardData: loadDashboardData,
};
