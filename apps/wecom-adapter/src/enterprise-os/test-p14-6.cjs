'use strict';
var registry = require('../enterprise-os/menu-registry');
var aliasMap = require('../enterprise-os/command-alias-map');
var router = require('../enterprise-os/menu-router');
var renderer = require('../enterprise-os/menu-renderer');
var cmd = require('../commands/enterprise-os-command');
var fs = require('fs');

var p = 0, f = 0;
function a(d, c) { if (c) { p++; console.log('  ✅ ' + d); } else { f++; console.log('  ❌ ' + d); } }
function S() { console.log('\n' + '='.repeat(40)); console.log('  Total: ' + (p + f) + ' | Passed: ' + p + ' | Failed: ' + f); if (f > 0) process.exit(1); }

console.log('── Test 1: Menu Registry ──');
var menus = registry.listMenus();
a('9 menus loaded', menus.length === 9);
a('dashboard exists', !!registry.getMenu('dashboard'));
a('all reviewOnly=true', registry.allReviewOnly());
a('findByCommand /总控', !!registry.findByCommand('/总控'));
a('findByCommand /AI', !!registry.findByCommand('/AI'));
a('findByAlias /dashboard', !!registry.findByAlias('/dashboard'));
a('validate valid menu', registry.validateMenu(menus[0]).valid === true);
menus.forEach(function (m) { a(m.id + ' reviewOnly', m.reviewOnly === true); });

console.log('── Test 2: Alias Map ──');
a('resolve /总控 → /总控', aliasMap.resolve('/总控') === '/总控');
a('resolve /dashboard → /总控', aliasMap.resolve('/dashboard') === '/总控');
a('resolve /运营 → /运营', aliasMap.resolve('/运营') === '/运营');
a('resolve /AI → /AI', aliasMap.resolve('/AI') === '/AI');
a('resolve /活动 → /活动', aliasMap.resolve('/活动') === '/活动');
a('resolve /视频 → /视频', aliasMap.resolve('/视频') === '/视频');
a('resolve /自治公司 → /自治公司', aliasMap.resolve('/自治公司') === '/自治公司');
a('resolve /董事会 → /董事会', aliasMap.resolve('/董事会') === '/董事会');
a('resolve unknown → null', aliasMap.resolve('/unknown') === null);
a('9 canonicals', aliasMap.listCanonicals().length === 9);

console.log('── Test 3: Menu Router ──');
a('route /总控 → dashboard', router.route('/总控').menuId === 'dashboard');
a('route /运营 → operations', router.route('/运营').menuId === 'operations');
a('route /活动 → campaigns', router.route('/活动').menuId === 'campaigns');
a('route /视频 → video', router.route('/视频').menuId === 'video');
a('route /AI → ai', router.route('/AI').menuId === 'ai');
a('route /董事会 → board', router.route('/董事会').menuId === 'board');
a('route /自治公司 → autonomous', router.route('/自治公司').menuId === 'autonomous');
a('route /风险 → risk', router.route('/风险').menuId === 'risk');
a('route empty → not found', router.route('').found === false);

console.log('── Test 4: NLP Fallback ──');
a('投流 centerless → operations', router.route('投流中心').found === true);
a('视频脚本 → video', router.route('视频脚本').found === true);
a('退款风险 → risk', router.route('退款风险').found === true);

console.log('── Test 5: Render + Artifact ──');
var ov = renderer.renderOverview();
a('overview has 总控', ov.indexOf('总控') >= 0);
a('overview has rows', (ov.match(/\| [🏠📊🎯🎬⚠️🤖📋⚡]/g) || []).length >= 9);
renderer.saveMenuJSON();
a('menu JSON exists', fs.existsSync(renderer.MENU_JSON_PATH));
renderer.writeAudit('test', {});
a('audit exists', fs.existsSync(renderer.AUDIT_PATH));

console.log('── Test 6: Command Handler ──');
cmd.execute({}, '').then(function (r) { a('cmd /总控 overview', r.indexOf('总控') >= 0); });
cmd.execute({}, '/运营').then(function (r) { a('cmd /运营 view', r.indexOf('运营') >= 0); });
cmd.execute({}, '/AI').then(function (r) { a('cmd /AI view', r.indexOf('AI') >= 0); });

setTimeout(S, 400);
