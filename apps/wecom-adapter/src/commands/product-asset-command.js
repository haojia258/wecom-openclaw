'use strict';

/**
 * product-asset-command.js — /素材库 /素材扫描 /素材报告 命令处理器
 *
 * REVIEW_ONLY：只读扫描，只写 manifest，不修改原始素材。
 */

var { getLibrarySummary, getScanResult, getGapReport } = require('../skills/dashboard/product-asset-skill');

var desc = '素材库管理 /素材库 | /素材扫描 | /素材报告';

async function execute(ctx, args) {
  var cmd = (ctx && ctx.cmd) || '';

  if (cmd === '/素材扫描') {
    return getScanResult();
  }

  if (cmd === '/素材报告') {
    return getGapReport();
  }

  // 默认: /素材库
  return getLibrarySummary();
}

module.exports = { execute: execute, desc: desc };
