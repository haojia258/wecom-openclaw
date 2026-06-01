'use strict';
// P14.6 — Menu Registry: 9 top-level Enterprise OS entries
var MENUS = [
  { id: 'dashboard',   name: '总控',    emoji: '🏠',  command: '/总控',    aliases: ['/总控', '/dashboard'],             description: '企业仪表盘：GMV/订单/利润/运营概览',          subCommands: ['/状态', '/企业'],                reviewOnly: true },
  { id: 'operations',  name: '运营',    emoji: '📊',  command: '/运营',    aliases: ['/运营', '/operations'],             description: '运营中心：投流/ROI/CTR/预算/策略',          subCommands: ['/投流中心', '/营销'],             reviewOnly: true },
  { id: 'campaigns',   name: '活动',    emoji: '🎯',  command: '/活动',    aliases: ['/活动', '/campaigns'],              description: '活动管理：报名/利润/风险/活动数据',        subCommands: ['/活动利润', '/活动报名'],          reviewOnly: true },
  { id: 'video',       name: '视频',    emoji: '🎬',  command: '/视频',    aliases: ['/视频', '/video'],                  description: '视频工作台：计划/脚本/素材匹配',           subCommands: ['/视频素材', '/视频计划'],          reviewOnly: true },
  { id: 'risk',        name: '风险',    emoji: '⚠️',  command: '/风险',    aliases: ['/风险', '/risk'],                   description: '风险监控：售后/退款/库存/安全审计',        subCommands: ['/风险', '/ai任务 僵尸'],          reviewOnly: true },
  { id: 'ai',          name: 'AI',      emoji: '🤖',  command: '/AI',      aliases: ['/AI', '/ai'],                        description: 'AI 工作台：任务/调度/Agent/开源雷达',      subCommands: ['/ai任务', '/ai调度', '/开源雷达'], reviewOnly: true },
  { id: 'board',       name: '董事会',  emoji: '📋',  command: '/董事会',  aliases: ['/董事会', '/board'],                 description: '董事会视图：目标/策略/审计/决策',           subCommands: ['/目标', '/策略'],                 reviewOnly: true },
  { id: 'goals',       name: '目标',    emoji: '🎯',  command: '/目标',    aliases: ['/目标', '/goals'],                   description: '目标管理：Goal Registry/进度/对齐',        subCommands: ['/目标', '/goal'],                 reviewOnly: true },
  { id: 'autonomous',  name: '自治公司', emoji: '⚡', command: '/自治公司', aliases: ['/自治公司', '/autonomous', '/闭环'], description: '自治循环：每日运营/自动任务/审计闭环',     subCommands: ['/自治公司', '/闭环'],              reviewOnly: true }
];

function listMenus() { return MENUS; }

function getMenu(id) { return MENUS.find(function (m) { return m.id === id; }) || null; }

function findByCommand(cmd) {
  return MENUS.find(function (m) {
    return m.aliases.indexOf(cmd) >= 0 || m.command === cmd;
  }) || null;
}

function findByAlias(alias) {
  return MENUS.find(function (m) { return m.aliases.indexOf(alias) >= 0; }) || null;
}

function validateMenu(menu) {
  var e = [];
  if (!menu.id) e.push('Missing id');
  if (!menu.name) e.push('Missing name');
  if (!menu.command) e.push('Missing command');
  if (menu.reviewOnly !== true) e.push('reviewOnly must be true');
  return { valid: e.length === 0, errors: e };
}

function allReviewOnly() { return MENUS.every(function (m) { return m.reviewOnly === true; }); }

module.exports = { listMenus: listMenus, getMenu: getMenu, findByCommand: findByCommand, findByAlias: findByAlias, validateMenu: validateMenu, allReviewOnly: allReviewOnly, MENUS: MENUS };
