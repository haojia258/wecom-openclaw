'use strict';

/**
 * 命令路由
 * v1.0 - 使用 command-center 统一注册 + alias
 */

const logger = require('./lib/logger');
const { resolve } = require('./lib/command-center');

/**
 * 路由命令
 * @param {string} content 用户发送的内容
 * @param {object} ctx    上下文 { fromUser, toUser, agentId }
 * @returns {string} 回复文本（保证是 string，不超过 1800 字）
 */
async function routeCommand(content, ctx) {
  const trimmed = (content || '').trim();
  logger.cmd(trimmed);

  const handler = resolve(trimmed);
  if (handler) {
    logger.route('matched=' + trimmed);
    try {
      const result = await handler(ctx);
      if (!result || typeof result !== 'string') {
        logger.error('command returned non-string: ' + typeof result);
        return '⚠️ 命令执行失败：' + trimmed + '\nerror: 返回值不是文本';
      }
      return result.slice(0, 1800);
    } catch (e) {
      logger.error('command threw: ' + trimmed + ' ' + e.message);
      return '⚠️ 命令执行失败：' + trimmed + '\nerror: ' + e.message.slice(0, 100);
    }
  }

  // 未命中
  logger.route('no match for: ' + trimmed);
  return 'OpenClaw 已收到：' + trimmed + '\n发送 /帮助 查看可用命令';
}

module.exports = { routeCommand };
