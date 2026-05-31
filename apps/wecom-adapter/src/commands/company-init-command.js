'use strict';

/**
 * company-init-command.js — /初始化 命令处理器
 *
 * 执行 AI One-Person Company OS v3 全量初始化。
 * 初始化结果写入审计报告并返回。
 *
 * 安全约束：
 *   - 不修改 .env/nginx/Vault/密钥
 *   - 不执行下单/改价/改库存/报名活动/部署/重启
 *   - 所有高危动作 requiresHumanApproval=true
 */

var { initAll, validateConfig } = require('../skills/dashboard/company-init');

var desc = '初始化 AI Company OS v3 运营配置 /初始化';

async function execute(ctx, args) {
  var input = (args || '').trim();

  if (input === '验证' || input === 'validate' || input === 'check') {
    var validation = validateConfig();
    if (validation.valid) {
      return [
        '✅ 配置文件验证通过',
        '',
        '版本: ' + validation.version,
        '平台: ' + validation.platform,
        '',
        '发送 /初始化 执行全量初始化。',
      ].join('\n');
    } else {
      return [
        '❌ 配置文件验证失败',
        '',
        '错误:',
      ].concat(validation.errors.map(function (e) { return '- ' + e; })).join('\n');
    }
  }

  // 执行全量初始化
  return initAll();
}

module.exports = { execute: execute, desc: desc };
