'use strict';
// P14.6 — Enterprise OS Command Handler for /总控 and 9 entry points
var renderer = require('../enterprise-os/menu-renderer');
var router = require('../enterprise-os/menu-router');
var registry = require('../enterprise-os/menu-registry');
var desc = 'Enterprise OS 命令总控: /总控 /运营 /活动 /视频 /风险 /AI /董事会 /目标 /自治公司 (REVIEW_ONLY)';

async function execute(ctx, args) {
  args = (args || '').trim();
  renderer.saveMenuJSON();
  renderer.writeAudit('command_invoke', { args: args });

  if (!args) return renderer.renderOverview();

  // Route through alias map
  var result = router.route(args);
  if (!result.found) return renderer.renderRouteResult(args);

  return renderer.renderMenuView(result.menuId);
}

module.exports = { execute: execute, desc: desc };
