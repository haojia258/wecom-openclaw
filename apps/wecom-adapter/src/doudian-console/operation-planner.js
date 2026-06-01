// P52 Operation Planner — generates preview plans, blocks direct execution
var fs = require('fs'); var path = require('path');
var pcp = require('./actions/product-create-plan');
var pup = require('./actions/price-update-plan');
var osp = require('./actions/order-ship-plan');
var qcp = require('./actions/qianchuan-plan');
var screenshot = require('./screenshot-artifact');
var PLANS_FILE = path.join(__dirname, '..', '..', 'storage', 'doudian-console', 'operation-plans.json');

function loadPlans() { try { return JSON.parse(fs.readFileSync(PLANS_FILE, 'utf8')); } catch (e) { return []; } }
function savePlans(p) { fs.writeFileSync(PLANS_FILE, JSON.stringify(p, null, 2), 'utf8'); }

function createPlan(type, data) {
  var plan;
  if (type === 'product_create') plan = pcp.generate(data);
  else if (type === 'price_update') plan = pup.generate(data);
  else if (type === 'order_ship') plan = osp.generate(data);
  else if (type === 'qianchuan') plan = qcp.generate(data);
  else return { error: 'Unknown plan type: ' + type };
  var plans = loadPlans(); plans.unshift(plan); savePlans(plans);
  var scr = screenshot.capture(type + '-plan');
  plan.screenshotArtifact = scr;
  return plan;
}

function getPlans() { return loadPlans(); }

function getStatus() {
  var session = require('./session-manager').getStatus();
  return { console: { status: session.loggedIn ? 'connected' : 'disconnected', account: session.account, reviewOnly: true }, capabilities: ['product_create', 'price_update', 'order_ship', 'qianchuan', 'screenshot'], planned: loadPlans().length };
}

module.exports = { createPlan: createPlan, getPlans: getPlans, getStatus: getStatus };
if (!fs.existsSync(PLANS_FILE)) savePlans([]);
