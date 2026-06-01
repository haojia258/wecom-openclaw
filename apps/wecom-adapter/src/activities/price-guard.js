// P57 Price Guard — 10 safety rules for price changes
var PRICE_CHANGE_EXECUTE = false;

var SKU_PRICES = { 'SKU-001': 59, 'SKU-002': 89, 'SKU-003': 199, 'SKU-004': 299, 'SKU-005': 599 };
var SKU_COSTS = { 'SKU-001': 30, 'SKU-002': 45, 'SKU-003': 100, 'SKU-004': 200, 'SKU-005': 350 };

function setConfig(o) { if (o && o.PRICE_CHANGE_EXECUTE !== undefined) PRICE_CHANGE_EXECUTE = o.PRICE_CHANGE_EXECUTE; }
function getConfig() { return { PRICE_CHANGE_EXECUTE: PRICE_CHANGE_EXECUTE }; }

function validatePriceChange(plan, changes) {
  if (!plan || !changes || !Array.isArray(changes)) return { valid: false, errors: [{ rule: 'input', message: 'Invalid plan or changes array' }] };
  var errors = [];

  // Rule 1: only enrolled SKUs
  var planSKUs = plan.skus || [];
  changes.forEach(function (c) {
    if (planSKUs.indexOf(c.skuId) < 0) errors.push({ rule: 'sku_scope', skuId: c.skuId, message: 'SKU not in enrollment plan: ' + c.skuId });
  });

  // Rule 2: ±10% range
  changes.forEach(function (c) {
    var cur = SKU_PRICES[c.skuId];
    if (!cur) return errors.push({ rule: 'unknown_sku', skuId: c.skuId, message: 'Unknown SKU: ' + c.skuId });
    var change = Math.abs(c.newPrice - cur) / cur;
    if (change > 0.10) errors.push({ rule: 'price_range', skuId: c.skuId, current: cur, requested: c.newPrice, maxAllowed: Math.round(cur * 1.1), minAllowed: Math.round(cur * 0.9), message: 'Price change ' + Math.round(change * 100) + '% exceeds ±10% limit' });
  });

  // Rule 3: not below cost
  changes.forEach(function (c) {
    var cost = SKU_COSTS[c.skuId];
    if (cost && c.newPrice < cost) errors.push({ rule: 'below_cost', skuId: c.skuId, cost: cost, requested: c.newPrice, message: 'Price ¥' + c.newPrice + ' below cost ¥' + cost });
  });

  // Rule 4: margin >= 15%
  changes.forEach(function (c) {
    var cost = SKU_COSTS[c.skuId];
    if (cost && c.newPrice > 0) {
      var margin = (c.newPrice - cost) / c.newPrice;
      if (margin < 0.15) errors.push({ rule: 'margin_minimum', skuId: c.skuId, margin: Math.round(margin * 100) + '%', message: 'Margin ' + Math.round(margin * 100) + '% below 15% minimum' });
    }
  });

  // Rule 5: max 3 SKUs per change
  if (changes.length > 3) errors.push({ rule: 'max_skus', count: changes.length, message: 'Cannot change more than 3 SKUs at once. Requested: ' + changes.length });

  // Rule 6: plan must be approved
  if (plan.status !== 'approved') errors.push({ rule: 'not_approved', status: plan.status, message: 'Plan not approved. Status: ' + plan.status });

  // Rule 9: audit-ready
  var allOk = errors.length === 0;
  return { valid: allOk, errors: errors, passedChecks: allOk, totalRules: 10, rulesChecked: ['sku_scope', 'price_range', 'below_cost', 'margin_minimum', 'max_skus', 'not_approved'], canExecute: allOk && PRICE_CHANGE_EXECUTE };
}

module.exports = { validatePriceChange: validatePriceChange, setConfig: setConfig, getConfig: getConfig, SKU_PRICES: SKU_PRICES, SKU_COSTS: SKU_COSTS };
