'use strict';

/**
 * ai-audit.js — /ai审计 命令处理器
 *
 * 委托给 ai-audit-dashboard 模块生成 AI 审计仪表板报告。
 *
 * Phase: AI Audit Dashboard v1
 */

const { generate } = require('../orchestrator/ai-audit-dashboard');

/**
 * 执行 /ai审计 命令
 * @param {object} ctx - 上下文 { mock, dataDir }
 * @returns {string} WeChat Work Markdown 格式报告
 */
function execute(ctx) {
  var opts = ctx || {};
  return generate(opts);
}

module.exports = { execute, desc: 'AI审计仪表板' };
