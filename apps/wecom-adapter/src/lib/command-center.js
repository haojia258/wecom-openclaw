'use strict';

/**
 * command-center.js - 统一指令注册中心
 * v1.2 - 支持不带空格的粘连写法（/ai调度帮助 等同于 /ai调度 帮助）
 */

const path = require('path');

// 指令注册表
// 每个条目: { file: 'commands/xxx', aliases: ['/别名1', '/别名2'] }
const REGISTRY = {
  '/帮助':   { file: '../commands/help',   aliases: ['/help', '/菜单', '/HELP'] },
  '/状态':   { file: '../commands/status',  aliases: ['/status', '/STATUS'] },
  '/今日GMV':{ file: '../commands/gmv',     aliases: ['/gmv', '/GMV', '/今日gmv'] },
  '/订单':   { file: '../commands/orders',  aliases: ['/orders', '/订单概况'] },
  '/利润':   { file: '../commands/profit',  aliases: ['/profit', '/利润分析'] },
  '/风险':   { file: '../commands/risk',    aliases: ['/risk', '/风险预警'] },
  '/ping':   { file: '../commands/ping',    aliases: ['/ Ping', '/诊断'] },
  '/运营分析': { file: '../commands/analysis', aliases: ['/analysis', '/分析', '/运营'] },
  '/投流分析': { file: '../commands/ads-analysis', aliases: ['/ads', '/投流', '/ROI分析'] },
  '/视频建议': { file: '../commands/video-suggestion', aliases: ['/video', '/视频', '/脚本建议'] },
  '/ai调度': { file: '../commands/ai-scheduler', aliases: ['/ai', '/调度', '/AISCHEDULER'] },
};

// 缓存已加载的 handler（懒加载）
const _cache = {};

/**
 * 从前缀中提取 args
 * 同时支持：
 *   /ai调度 帮助  → args = '帮助'  （有空格）
 *   /ai调度帮助   → args = '帮助'  （无空格）
 */
function extractArgs(trimmed, prefix) {
  const rest = trimmed.slice(prefix.length);
  // 有空格分隔
  if (rest.startsWith(' ')) {
    return rest.trim();
  }
  // 无空格粘连（仍然有内容）
  if (rest.length > 0) {
    return rest.trim();
  }
  return '';
}

/**
 * 解析输入，返回 { handler, args } 或 null
 * 支持带参数的命令，例如：
 *   /ai调度 投流优化 → handler + '投流优化'
 *   /ai调度投流优化  → handler + '投流优化'  ← 新增
 * @param {string} input 用户输入（已 trim）
 * @returns {{ handler: function, args: string }|null}
 */
function resolve(input) {
  const trimmed = (input || '').trim();
  if (!trimmed) return null;

  // 1. 精确匹配主命令
  if (REGISTRY[trimmed]) {
    return { handler: loadHandler(trimmed), args: '' };
  }

  // 2. 精确匹配别名
  for (const [cmd, entry] of Object.entries(REGISTRY)) {
    if (entry.aliases && entry.aliases.includes(trimmed)) {
      return { handler: loadHandler(cmd), args: '' };
    }
  }

  // 3. 前缀匹配主命令（带参数）
  // 按命令名长度降序排列，优先匹配更长的命令（避免 /ai 匹配 /ai调度）
  const sortedCmds = Object.keys(REGISTRY).sort((a, b) => b.length - a.length);
  for (const cmd of sortedCmds) {
    if (trimmed.startsWith(cmd) && trimmed.length > cmd.length) {
      const args = extractArgs(trimmed, cmd);
      return { handler: loadHandler(cmd), args };
    }
  }

  // 4. 前缀匹配别名（带参数）
  for (const [cmd, entry] of Object.entries(REGISTRY)) {
    if (!entry.aliases) continue;
    // 别名也按长度降序
    const sortedAliases = [...entry.aliases].sort((a, b) => b.length - a.length);
    for (const alias of sortedAliases) {
      if (trimmed.startsWith(alias) && trimmed.length > alias.length) {
        const args = extractArgs(trimmed, alias);
        return { handler: loadHandler(cmd), args };
      }
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
