'use strict';

/**
 * asset-sync-command.js — /同步素材 命令处理器
 *
 * 从 Google Drive 同步素材到本地 assets 目录。
 * REVIEW_ONLY 模式：只读拉取，不发布/不修改生产数据。
 */

var { runSync } = require('../skills/dashboard/asset-sync-agent');

var desc = 'Google Drive 素材同步 /同步素材 | /更新素材 | /拉取素材';

async function execute(ctx, args) {
  var result = runSync();
  if (result.success) {
    return result.report;
  }
  return result.report || ('❌ 同步失败: ' + (result.error || '未知错误'));
}

module.exports = { execute: execute, desc: desc };
