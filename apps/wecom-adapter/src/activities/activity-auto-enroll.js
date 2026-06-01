// P53.1 Activity Auto-Enroll — Low-Risk Semi-Auto Mode
// AUTO_ACTIVITY_SCAN=true | AUTO_ENROLL_PLAN=true | AUTO_ENROLL_EXECUTE=false

var CONFIG = { AUTO_ACTIVITY_SCAN: true, AUTO_ACTIVITY_RECOMMEND: true, AUTO_ENROLL_PLAN: true, AUTO_ENROLL_EXECUTE: false, REVIEW_ONLY: true };
var LOW_RISK_RULES = { minProfit: 0, maxRiskLevel: 'low', noPriceChange: true, noStockChange: true, noAutoShip: true, sufficientStock: true, lowRefundRisk: true, noHighDeposit: true, noForcedAds: true };

var store = require('./activity-store');
var profitEngine = require('./activity-profit-engine');
var riskEngine = require('./activity-risk-engine');
var matcher = require('./activity-product-matcher');
var enrollment = require('./enrollment-planner');

function getConfig() { return CONFIG; }

function scanLowRisk() {
  var all = store.getAll();
  var candidates = [];
  all.forEach(function (a) {
    var profit = profitEngine.calculate(a);
    var risk = riskEngine.assess(a, parseFloat(profit.profitMargin) / 100);
    var matches = matcher.match(a);
    var stockOK = matches.every(function (m) { return m.stockSufficient; });

    var isLowRisk =
      profit.netProfit > LOW_RISK_RULES.minProfit &&
      risk.riskLevel === LOW_RISK_RULES.maxRiskLevel &&
      stockOK &&
      a.discount < 0.15; // no heavy price changes

    if (isLowRisk) {
      candidates.push({
        activity: a,
        profit: profit,
        risk: risk,
        matches: matches,
        recommendedAction: 'generate_plan',
        requiresApproval: true,
        autoMode: CONFIG.AUTO_ENROLL_PLAN
      });
    }
  });
  return { candidates: candidates, count: candidates.length, config: CONFIG, scannedAt: new Date().toISOString() };
}

function generatePlans() {
  var scan = scanLowRisk();
  var plans = [];
  scan.candidates.forEach(function (c) {
    if (CONFIG.AUTO_ENROLL_PLAN) {
      var plan = enrollment.createPlan(c.activity, c.activity.products);
      plans.push({
        activity: c.activity.name,
        planId: plan.planId,
        profit: c.profit.netProfit,
        riskLevel: c.risk.riskLevel,
        status: 'pending_approval',
        blocked: !CONFIG.AUTO_ENROLL_EXECUTE,
        message: 'Plan generated. Execution blocked — requires P48 approval.'
      });
    }
  });
  return { plans: plans, autoMode: true, reviewOnly: true, blocked: !CONFIG.AUTO_ENROLL_EXECUTE };
}

function enroll(candidate) {
  if (CONFIG.AUTO_ENROLL_EXECUTE) return { error: 'Direct enrollment is forbidden. Set AUTO_ENROLL_EXECUTE=false for safety.' };
  return { blocked: true, action: 'activity_enroll', requiresApproval: true, message: 'BLOCKED by P48 Audit Gate. Enrollment requires manual approval.', reviewOnly: true };
}

module.exports = { getConfig: getConfig, scanLowRisk: scanLowRisk, generatePlans: generatePlans, enroll: enroll, LOW_RISK_RULES: LOW_RISK_RULES };
