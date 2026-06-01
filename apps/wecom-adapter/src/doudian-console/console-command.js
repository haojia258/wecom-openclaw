// P52 Console Command — entry points
var session = require('./session-manager');
var planner = require('./operation-planner');
var screenshot = require('./screenshot-artifact');
var audit = require('./console-audit');
var approval = require('./console-approval');

function handle(cmd) {
  var n = (cmd || '').toLowerCase().replace(/^\//, '').replace(/\s+/g, ' ').trim();
  if (n.indexOf('运营 后台状态') >= 0 || n.indexOf('抖店后台 状态') >= 0) return { status: session.getStatus(), plannerStatus: planner.getStatus() };
  if (n.indexOf('运营 后台登录') >= 0 || n.indexOf('抖店后台 登录') >= 0) { var r = session.login(); audit.logLogin({ userId: 'admin', status: 'success' }); return r; }
  if (n.indexOf('运营 后台截图') >= 0 || n.indexOf('抖店后台 截图') >= 0) { var s = screenshot.capture('Dashboard'); audit.logScreenshot({ userId: 'admin' }); return s; }
  if (n.indexOf('运营 后台计划') >= 0 || n.indexOf('抖店后台 计划') >= 0) return planner.getPlans();
  if (n.indexOf('运营 商品上架预览') >= 0) return approval.check('product_publish', {});
  if (n.indexOf('运营 商品改价预览') >= 0) return approval.check('price_update', {});
  if (n.indexOf('运营 订单发货预览') >= 0) return approval.check('shipment_execute', {});
  if (n.indexOf('运营 千川投流预览') >= 0) return approval.check('ads_execute', {});
  return { error: 'Unknown command. Try: 后台状态 / 后台登录 / 后台截图 / 后台计划' };
}
module.exports = { handle: handle };
