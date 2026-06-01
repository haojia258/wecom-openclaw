// P57 Price Executor
var fs = require('fs'); var path = require('path');
var guard = require('./price-guard');
var STORE_DIR = path.join(__dirname, '..', '..', 'storage', 'activities');
var approval = require('./approval-action');

function loadPlans() { try { return JSON.parse(fs.readFileSync(path.join(STORE_DIR, 'enrollment-plans.json'), 'utf8')); } catch (e) { return []; } }
function loadHistory() { try { return JSON.parse(fs.readFileSync(path.join(STORE_DIR, 'history.json'), 'utf8')); } catch (e) { return []; } }
function saveHistory(d) { fs.writeFileSync(path.join(STORE_DIR, 'history.json'), JSON.stringify(d, null, 2), 'utf8'); }
function writeAudit(ev, data) { var h = loadHistory(); h.unshift({ eventType: ev, planId: data.planId, detail: data, createdAt: new Date().toISOString() }); saveHistory(h); return h[0]; }

var pricePlans = {};

function createPricePlan(planId, changes) {
  if (!planId || !changes) return { error: 'Missing planId or changes' };
  var plans = loadPlans();
  var plan = plans.find(function (p) { return p.planId === planId; });
  if (!plan) return { error: 'Plan not found: ' + planId };

  var v = guard.validatePriceChange(plan, changes);
  writeAudit('price_plan_created', { planId: planId, changes: changes, validation: v });

  if (!v.valid) {
    writeAudit('price_blocked', { planId: planId, errors: v.errors });
    return {
      blocked: true, planId: planId,
      message: '⛔ 调价计划被拒绝。\n\n' + v.errors.map(function (e) { return '• 规则' + e.rule + ': ' + e.message; }).join('\n'),
      errors: v.errors
    };
  }

  var ppId = 'pp-' + Date.now().toString(36);
  pricePlans[ppId] = { pricePlanId: ppId, planId: planId, changes: changes, status: 'price_pending_confirm', validated: true, createdAt: new Date().toISOString() };

  return {
    created: true, pricePlanId: ppId, planId: planId, changes: changes, status: 'price_pending_confirm',
    message: '✅ 调价计划已生成\n\n计划ID: ' + ppId + '\n涉及 SKU: ' + changes.map(function (c) { return c.skuId + ' ¥' + c.currentPrice + '→¥' + c.newPrice + ' (' + (c.newPrice > c.currentPrice ? '+' : '') + Math.round((c.newPrice - c.currentPrice) / c.currentPrice * 100) + '%)'; }).join('\n') + '\n\n发送 /价格 调价确认 ' + ppId + ' CONFIRM 确认执行',
    requiresConfirm: true
  };
}

function confirmPrice(pricePlanId, token) {
  if (!pricePlanId) return { error: 'Missing pricePlanId' };
  if (token !== 'CONFIRM') return { error: 'Missing CONFIRM token' };

  var pp = pricePlans[pricePlanId];
  if (!pp) return { error: 'Price plan not found: ' + pricePlanId };
  if (pp.status !== 'price_pending_confirm') return { error: 'Price plan not pending confirm. Status: ' + pp.status };

  if (!guard.getConfig().PRICE_CHANGE_EXECUTE) {
    writeAudit('price_blocked', { pricePlanId: pricePlanId, reason: 'PRICE_CHANGE_EXECUTE=false' });
    return { executed: false, blocked: true, pricePlanId: pricePlanId, message: '⛔ 调价被阻断。PRICE_CHANGE_EXECUTE=false' };
  }

  pp.status = 'price_executed_mock';
  pp.executedAt = new Date().toISOString();
  var result = { executed: true, mock: true, pricePlanId: pricePlanId, status: 'price_executed_mock', message: '✅ MOCK 调价执行成功\n\n计划ID: ' + pricePlanId + '\n状态: price_executed_mock\n\n⚠️ Mock only. Set PRICE_CHANGE_EXECUTE=true for real execution.' };
  writeAudit('price_executed_mock', { pricePlanId: pricePlanId, status: 'price_executed_mock' });
  return result;
}

function status(pricePlanId) {
  var pp = pricePlans[pricePlanId];
  if (!pp) return { error: 'Price plan not found: ' + pricePlanId };
  return {
    pricePlanId: pp.pricePlanId, planId: pp.planId, status: pp.status, changes: pp.changes,
    message: '📊 调价状态: ' + pp.status + '\n计划ID: ' + pp.pricePlanId + '\n涉及: ' + (pp.changes || []).map(function (c) { return c.skuId + ' ¥' + c.currentPrice + '→¥' + c.newPrice; }).join(', ')
  };
}

module.exports = { createPricePlan: createPricePlan, confirmPrice: confirmPrice, status: status, guardConfig: guard.getConfig, guard: guard };
