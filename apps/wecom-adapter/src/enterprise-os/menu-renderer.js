'use strict';
// P14.6 — Menu Renderer: WeCom markdown output
var registry = require('./menu-registry');
var router = require('./menu-router');
var fs = require('fs');
var path = require('path');
var MENU_JSON_PATH = path.resolve(__dirname, '../../../storage/orchestrator/menus/enterprise-menu.json');
var AUDIT_PATH = path.resolve(__dirname, '../../../storage/orchestrator/audit-p14-6.jsonl');

function ensureDirs() { var d = path.dirname(MENU_JSON_PATH); if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); }

function renderOverview() {
  var menus = registry.listMenus();
  var lines = [
    '## 🏢 Enterprise OS — 命令总控',
    '',
    'REVIEW_ONLY=true — 不自动执行生产变更',
    '',
    '| 入口 | 命令 | 子命令数 | 简介 |',
    '|------|------|----------|------|'
  ];
  menus.forEach(function (m) {
    lines.push('| ' + m.emoji + ' ' + m.name + ' | ' + m.command + ' | ' + m.subCommands.length + ' | ' + m.description.split('：')[0] + ' |');
  });
  lines.push('');
  lines.push('输入 /总控 /运营 /活动 /视频 /风险 /AI /董事会 /目标 /自治公司 进入');
  lines.push('');
  lines.push('REVIEW_ONLY=true');
  return lines.join('\n');
}

function renderMenuView(menuId) {
  var m = registry.getMenu(menuId);
  if (!m) return '❌ 菜单不存在: ' + menuId + '\n\n' + renderOverview();

  var lines = [
    '## ' + m.emoji + ' ' + m.name + ' — ' + m.description,
    '',
    '| 字段 | 值 |',
    '|------|-----|',
    '| 入口命令 | ' + m.command + ' |',
    '| 别名 | ' + m.aliases.join(', ') + ' |',
    '| reviewOnly | ' + m.reviewOnly + ' |',
    '',
    '### 子命令'
  ];
  m.subCommands.forEach(function (c) { lines.push('- ' + c); });
  lines.push('');
  lines.push('REVIEW_ONLY=true');
  return lines.join('\n');
}

function renderRouteResult(input) {
  var r = router.route(input);
  if (!r.found) return '❌ 未匹配到入口: ' + (input || '(empty)') + '\n\n' + renderOverview();

  return [
    '## ' + r.emoji + ' 路由到: ' + r.menuName,
    '',
    r.description,
    '',
    '入口: ' + r.command,
    '子命令: ' + r.subCommands.join(', '),
    '',
    'REVIEW_ONLY=true'
  ].join('\n');
}

function saveMenuJSON() {
  ensureDirs();
  var data = {
    generatedAt: new Date().toISOString(),
    menus: registry.listMenus().map(function (m) {
      return { id: m.id, name: m.name, emoji: m.emoji, command: m.command, aliases: m.aliases, subCommands: m.subCommands, reviewOnly: m.reviewOnly };
    }),
    reviewOnly: true
  };
  fs.writeFileSync(MENU_JSON_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

function writeAudit(event, detail) {
  ensureDirs();
  var entry = JSON.stringify({ ts: new Date().toISOString(), event: event, detail: detail || {} }) + '\n';
  fs.appendFileSync(AUDIT_PATH, entry, 'utf-8');
}

module.exports = {
  renderOverview: renderOverview, renderMenuView: renderMenuView,
  renderRouteResult: renderRouteResult, saveMenuJSON: saveMenuJSON, writeAudit: writeAudit,
  MENU_JSON_PATH: MENU_JSON_PATH, AUDIT_PATH: AUDIT_PATH
};
