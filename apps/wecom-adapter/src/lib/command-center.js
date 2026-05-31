'use strict';

/**
 * command-center.js - 统一指令注册中心
 * v1.12 - 接入 Dashboard v3 四入口（/总控 /监控 /董事会 /运营驾驶舱）
 */

// 指令注册表
// 每个条目: { file: 'commands/xxx', aliases: ['/别名1', '/别名2'] }
const skillAgent = require('../agents/skill-agent');

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
  '/审查': { file: '../commands/ai-review', aliases: ['/审', '/ai-review', '/review', '/代码审查'] },
  '/技能': { file: '../commands/skills',  aliases: ['/skill', '/技能列表', '/skills'] },
  '/活动': { file: '../commands/activity', aliases: ['/activity', '/推广活动', '/活动查询', '/大促'] },
  '/活动利润': { file: '../commands/activity-profit', aliases: ['/profit-activity', '/利润活动', '/活动收益'] },
  '/活动报名': { file: '../commands/activity-enroll', aliases: ['/参加', '/报名', '/enroll', '/自动报名'] },
  '/任务':   { file: '../commands/agent-task', aliases: ['/task', '/v2任务'] },
  '/进度':   { file: '../commands/task-progress', aliases: ['/progress', '/任务进度'] },
  '/任务列表': { file: '../commands/task-list', aliases: ['/tasklist', '/所有任务'] },
  '/阻断项': { file: '../commands/task-blockers', aliases: ['/blockers', '/阻塞'] },
  '/风险告警': { file: '../commands/risk-alert', aliases: ['/alert', '/告警', '/风险扫描', '/risk-alert'] },
  '/补丁':   { file: '../commands/patch',  aliases: ['/patch', '/补丁管理'] },
  '/监控':   { file: '../commands/dashboard', aliases: ['/monitor', '/health', '/生产监控'] },
  '/ai任务': { file: '../commands/ai-task', aliases: ['/aitask', '/AI任务', '/ai-task'] },
  '/今日运营': { file: '../commands/today-ops', aliases: ['/todayops', '/运营日报', '/日报'] },
  '/ai审计':   { file: '../commands/ai-audit',  aliases: ['/aiaudit', '/AI审计', '/ai审计'] },
  '/ai灰度': { file: '../commands/ai-grayscale', aliases: ['/aigray'] },
  '/目标':   { file: '../commands/goal-command', aliases: ['/goal', '/计划', '/拆解'] },
  '/总控':   { file: '../commands/dashboard', aliases: ['/ceo', '/dashboard', '/总控台'] },
  '/董事会':   { file: '../commands/board-command', aliases: ['/board', '/executive'] },
  '/运营驾驶舱': { file: '../commands/dashboard', aliases: ['/ops-dashboard', '/运营大屏'] },
  '/初始化':   { file: '../commands/company-init-command', aliases: ['/init', '/初始化配置'] },
  '/视频任务': { file: '../commands/video-mission-command', aliases: ['/酸辣粉视频', '/每日视频', '/生成视频'] },
  '/视频进度': { file: '../commands/video-mission-command', aliases: ['/视频状态', '/内容进度'] },
  '/视频复盘': { file: '../commands/video-mission-command', aliases: ['/内容复盘', '/短视频复盘'] },
  '/同步素材': { file: '../commands/asset-sync-command', aliases: ['/更新素材', '/拉取素材', '/素材同步'] },
  '/活动筛选': { file: '../commands/cost-activity-command', aliases: ['/活动报名建议', '/算活动'] },
  '/成本核算': { file: '../commands/cost-activity-command', aliases: ['/保本价', '/商品成本'] },
  '/素材库':   { file: '../commands/product-asset-command', aliases: ['/素材摘要'] },
  '/素材扫描': { file: '../commands/product-asset-command', aliases: ['/扫描素材'] },
  '/素材报告': { file: '../commands/product-asset-command', aliases: ['/素材缺口'] },
  '/周报':     { file: '../commands/kpi-command', aliases: ['/weekly'] },
  '/月报':     { file: '../commands/kpi-command', aliases: ['/monthly'] },
  '/预算':     { file: '../commands/budget-command', aliases: ['/budget'] },
  '/预算分析': { file: '../commands/budget-command', aliases: ['/预算诊断'] },
  '/预算建议': { file: '../commands/budget-command', aliases: ['/预算方案'] },
  '/策略':     { file: '../commands/strategy-command', aliases: ['/strategy', '/经营策略'] },
  '/经营规划': { file: '../commands/strategy-command', aliases: ['/7天计划', '/运营计划'] },
  '/记忆':     { file: '../commands/memory-command', aliases: ['/memory', '/记忆库'] },
  '/经营历史': { file: '../commands/memory-command', aliases: ['/历史数据', '/运营历史'] },
  '/记忆存档': { file: '../commands/memory-command', aliases: ['/存档', '/保存快照'] },
  '/决策':     { file: '../commands/decision-command', aliases: ['/decide', '/决策建议'] },
  '/决策分析': { file: '../commands/decision-command', aliases: ['/决策详情', '/decision-analysis'] },
  '/目标':     { file: '../commands/goal-command', aliases: ['/goals', '/目标管理'] },
  '/目标设置': { file: '../commands/goal-command', aliases: ['/设置目标'] },
  '/目标状态': { file: '../commands/goal-command', aliases: ['/目标进度'] },
  '/执行计划': { file: '../commands/execution-command', aliases: ['/任务计划', '/plan'] },
  '/董事会会议': { file: '../commands/board-meeting-command', aliases: ['/mab', '/multi-agent-board'] },
  '/自治公司':   { file: '../commands/autonomous-command', aliases: ['/autonomous', '/闭环'] },
'/开源雷达': { file: '../commands/oss-radar', aliases: ['/oss-radar', '/oss', '/开源'] },
'/worker分发': { file: '../commands/worker-dispatch', aliases: ['/dispatch', '/多节点调度', '/workers'] },
  '/素材状态': { file: '../commands/asset-foundation', aliases: ['/素材统计', '/素材搜索'] },
  '/视频素材': { file: '../commands/video-material-command', aliases: ['/video-material', '/素材匹配', '/视频计划'] },
  '/版本':       { file: '../commands/version-command', aliases: ['/version', '/ver'] },
  '/状态':       { file: '../commands/version-command', aliases: ['/status', '/health'] },
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
    return { handler: loadHandler(trimmed), args: '', cmd: trimmed };
  }

  // 2. 精确匹配别名
  for (const [cmd, entry] of Object.entries(REGISTRY)) {
    if (entry.aliases && entry.aliases.includes(trimmed)) {
      return { handler: loadHandler(cmd), args: '', cmd: cmd };
    }
  }

  // 3. 前缀匹配主命令（带参数）
  // 按命令名长度降序排列，优先匹配更长的命令（避免 /ai 匹配 /ai调度）
  const sortedCmds = Object.keys(REGISTRY).sort((a, b) => b.length - a.length);
  for (const cmd of sortedCmds) {
    if (trimmed.startsWith(cmd) && trimmed.length > cmd.length) {
      const args = extractArgs(trimmed, cmd);
      return { handler: loadHandler(cmd), args, cmd: cmd };
    }
  }

  // 4. 前缀匹配别名（带参数）
  // 全局排序避免短别名抢前缀（如 /ai 抢先匹配 /ai-review）
  const allAliases = [];
  for (const [cmd, entry] of Object.entries(REGISTRY)) {
    if (!entry.aliases) continue;
    for (const alias of entry.aliases) {
      allAliases.push({ cmd, alias });
    }
  }
  allAliases.sort((a, b) => b.alias.length - a.alias.length);
  for (const { cmd, alias } of allAliases) {
    if (trimmed.startsWith(alias) && trimmed.length > alias.length) {
      const args = extractArgs(trimmed, alias);
      return { handler: loadHandler(cmd), args, cmd: cmd };
    }
  }


  // 5. Skill Layer 回退（非 REGISTRY 命令，作为 resolve 的最后一级回退）
  if (skillAgent && typeof skillAgent.execute === 'function') {
    const { resolveSkill } = require('../skills');
    const skillResult = resolveSkill(trimmed);
    if (skillResult) {
      return { handler: skillAgent.execute.bind(null, trimmed), args: '', cmd: '/技能' };
    }
  }

  // 6. NLP 报名闭环路由：发送"参加"/"报名"自动进入利润分析闭环
  const ENROLL_KEYWORDS = ['参加', '报名活动', '我要报名', '自动报名', '帮我报名', '推荐报名'];
  const hasEnrollKW = ENROLL_KEYWORDS.some(function(kw) {
    return trimmed.includes(kw);
  });
  if (hasEnrollKW && trimmed.length > 1) {
    try {
      const enrollMod = require('../commands/activity-enroll');
      if (enrollMod && typeof enrollMod.execute === 'function') {
        return { handler: enrollMod.execute, args: trimmed, cmd: '/活动报名' };
      }
    } catch (_) {
      // 静默回退
    }
  }

  // 7. NLP 自由文本回退：关键词触发活动查询
  // 无需 / 前缀，自然语言描述也能触发
  const ACTIVITY_KEYWORDS = [
    '推广活动', '官方活动', '平台活动', '618', '大促',
    '节盟', '抖音商城活动', '促销活动',
    '优惠活动', '补贴活动', '有什么活动', '活动利润', '利润对比', '收益对比', '活动收益', '参加活动'
  ];
  const hasActivityKW = ACTIVITY_KEYWORDS.some(function(kw) {
    return trimmed.includes(kw);
  });
  if (hasActivityKW && trimmed.length > 2) {
    try {
      const activityMod = require('../commands/activity');
      if (activityMod && typeof activityMod.execute === 'function') {
        return { handler: activityMod.execute, args: trimmed, cmd: '/活动' };
      }
    } catch (_) {
      // 如果 activity 模块不存在，静默回退
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
