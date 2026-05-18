'use strict';

/**
 * command-center.js - 统一指令注册中心
 * v1.0 - 支持 alias，自动生成帮助菜单
 */

const path = require('path');

// 指令注册表
// 每个条目: { file: 'commands/xxx', aliases: ['/别名1', '/别名2'] }
const REGISTRY = {
  '/帮助':   { file: './commands/help',   aliases: ['/help', '/菜单', '/HELP'] },
  '/状态':   { file: './commands/status',  aliases: ['/status', '/STATUS'] },
  '/今日GMV':{ file: './commands/gmv',     aliases: ['/gmv', '/GMV', '/今日gmv'] },
  '/订单':   { file: './commands/orders',  aliases: ['/orders', '/订单概况'] },
  '/利润':   { file: './commands/profit',  aliases: ['/profit', '/利润分析'] },
  '/风险':   { file: './commands/risk',    aliases: ['/risk', '/风险预警'] },
  '/ping':   { file: './commands/ping',    aliases: ['/ Ping', '/诊断'] },
  '/运营分析': { file: './commands/analysis', aliases: ['/analysis', '/分析', '/运营'] },
};

// 缓存已加载的 handler（懒加载）
const _cache = {};

/**
 * 解析输入，返回 handler 函数或 null
 * @param {string} input 用户输入（已 trim）
 * @returns {function|null} execute 函数
 */
function resolve(input) {
  const trimmed = (input || '').trim();
  // 1. 精确匹配主命令
  if (REGISTRY[trimmed]) {
    return loadHandler(trimmed);
  }
  // 2. 匹配别名
  for (const [cmd, entry] of Object.entries(REGISTRY)) {
    if (entry.aliases && entry.aliases.includes(trimmed)) {
      return loadHandler(cmd);
    }
  }
  return null;
}

/**
 * 懒加载 handler
 */
function loadHandler(cmd) {
  if (!_cache[cmd]) {
    _cache[cmd] = require(REGISTRY[cmd].file);
  }
  return _cache[cmd].execute;
}

/**
 * 自动生成帮助菜单文本
 * @returns {string}
 */
function listCommands() {
  const lines = [
    '🤖 OpenClaw 抖店助手 v1.0',
    '',
    '📋 可用命令：',
    '',
  ];
  for (const [cmd, entry] of Object.entries(REGISTRY)) {
    // 尝试读取命令描述（从文件 exports.desc 或默认）
    let desc = '';
    try {
      const mod = require(entry.file);
      desc = mod.desc || cmd.replace('/', '');
    } catch (_) {
      desc = cmd.replace('/', '');
    }
    let line = '  ' + cmd;
    if (entry.aliases && entry.aliases.length > 0) {
      line += '  (别名: ' + entry.aliases.join(', ') + ')';
    }
    lines.push(line);
  }
  lines.push('');
  lines.push('💡 数据来源：电商罗盘 / Playwright 自动抓取');
  lines.push('🕐 数据更新：每日自动执行');
  return lines.join('\n');
}

/**
 * 获取所有已注册命令（用于帮助）
 */
function getCommandList() {
  return Object.keys(REGISTRY);
}

module.exports = { resolve, listCommands, getCommandList, REGISTRY };
