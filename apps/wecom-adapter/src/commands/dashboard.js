'use strict';

/**
 * dashboard.js — 可视化运营仪表板命令处理器
 *
 * 四个入口：
 *   /总控        → CEO 总览大屏
 *   /监控        → CTO/DevOps 监控大屏
 *   /董事会      → Executive Board 大屏
 *   /运营驾驶舱  → COO/CMO 运营驾驶舱
 *
 * 约束：
 *   - 只读展示
 *   - 不执行下单/改价/改库存/报名活动/部署/重启
 *   - 不修改 .env/nginx/Vault/PM2/生产密钥
 */

var { runDashboard } = require('../skills/dashboard');

var desc = '可视化运营仪表板 /总控 | /监控 | /董事会 | /运营驾驶舱';

/**
 * 处理 Dashboard 命令
 *
 * @param {object} ctx  - 上下文 (user, corpId 等)
 * @param {string} args - 用户输入参数
 * @returns {Promise<string>} 企业微信 Markdown
 */
async function execute(ctx, args) {
  var input = (args || '').trim();

  // 根据命令文本路由到对应的 dashboard
  // 注意：command-center 已经做了命令匹配，这里 args 可能包含额外参数

  // 如果 ctx 中包含 cmd 信息（从 command-center 传入），从中判断
  var cmd = (ctx && ctx.cmd) || '';

  if (cmd === '/监控' || input.startsWith('/监控')) {
    return runDashboard('monitor');
  }

  if (cmd === '/董事会' || input.startsWith('/董事会')) {
    return runDashboard('board');
  }

  if (cmd === '/运营驾驶舱' || input.startsWith('/运营驾驶舱')) {
    return runDashboard('ops');
  }

  // 默认: CEO 总控大屏
  return runDashboard('ceo');
}

module.exports = { execute: execute, desc: desc };
