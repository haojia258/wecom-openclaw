'use strict';
// P14.6 — Menu Router: resolves command → menu entry
var registry = require('./menu-registry');
var aliasMap = require('./command-alias-map');

function route(input) {
  var cmd = (input || '').trim();
  if (!cmd) return { found: false, reason: 'empty' };

  var canonical = aliasMap.resolve(cmd);
  var menu = canonical ? registry.findByCommand(canonical) : registry.findByCommand(cmd);

  if (!menu) {
    // NLP fallback: keyword matching
    var keywords = {
      '总控|dashboard|仪表盘|首页': 'dashboard',
      '运营|投流|roi|ctr|营销|预算': 'operations',
      '活动|campaign|报名': 'campaigns',
      '视频|video|素材|脚本': 'video',
      '风险|risk|风控|售后|退款': 'risk',
      'AI|ai|任务|调度|开源|agent|worker': 'ai',
      '董事会|board|目标|策略|goal': 'board',
      '自治|autonomous|闭环|loop': 'autonomous'
    };
    for (var pattern in keywords) {
      var regex = new RegExp(pattern, 'i');
      if (regex.test(cmd)) { menu = registry.getMenu(keywords[pattern]); break; }
    }
  }

  return menu ? {
    found: true,
    menuId: menu.id,
    menuName: menu.name,
    emoji: menu.emoji,
    command: menu.command,
    description: menu.description,
    subCommands: menu.subCommands,
    reviewOnly: menu.reviewOnly
  } : { found: false, reason: 'no_menu', input: cmd };
}

module.exports = { route: route };
