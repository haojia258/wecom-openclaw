'use strict';

/**
 * /今日运营 命令
 * v1.0 - 接入 Today Ops Worker Orchestrator
 *
 * 调用 today-ops-orchestrator.js 生成运营日报。
 * 支持 mock 模式（测试用）和生产模式（读取实际数据）。
 *
 * 约束：
 *   - 不调用真实 AI API
 *   - REVIEW_ONLY__NO_AUTO_APPLY
 *   - requiresHumanApproval=true
 *   - 不自动 apply/deploy/merge/rollback
 */

const { execute: runOrchestrator } = require('../orchestrator/today-ops-orchestrator');

/**
 * execute — /今日运营 命令入口
 * @param {object} [ctx] - 上下文
 * @param {boolean} [ctx.mock] - 使用 mock 数据
 * @param {string} [ctx.dataDir] - 自定义数据目录
 * @returns {string} 企业微信 Markdown 运营报告
 */
function execute(ctx) {
  const opts = ctx || {};

  // 转发到编排层
  return runOrchestrator(opts);
}

module.exports = { execute, desc: '今日运营日报' };
