'use strict';

/**
 * push-summary.js - 手动推送运营摘要命令
 * 对应 /技能 push-summary 命令
 *
 * 不重复实现摘要逻辑，复用 skill-agent + scheduler
 */

const scheduler = require('../scheduler/scheduler');

/**
 * 执行手动推送
 * @param {Object} ctx - 上下文（支持 mock）
 * @returns {Promise<string>} 推送结果描述
 */
async function execute(ctx) {
  ctx = ctx || {};

  try {
    const result = await scheduler.pushOpsSummary(ctx);

    if (result.success) {
      if (ctx.mock) {
        return 'mock 发送成功（' + result.sent + '/' + result.total + '）';
      }
      return '运营摘要已推送到企微（' + result.sent + '/' + result.total + '）';
    }

    if (result.errors && result.errors.length > 0) {
      return '推送部分失败：' + result.errors.join('; ');
    }

    return '推送失败：无推送用户配置';
  } catch (e) {
    return '推送失败：' + e.message;
  }
}

module.exports = { execute, desc: '推送运营摘要' };
