'use strict';

/**
 * cost-activity-handler.js — 全成本核算 + 活动利润筛选引擎
 *
 * REVIEW_ONLY 模式：只计算、只展示、只生成审批单。
 * 不执行 real_activity_signup / real_price_change。
 *
 * 安全约束：
 *   - 只读计算与展示
 *   - real_activity_signup / real_price_change 必须 CEO 审批
 *   - 所有成本快照、建议价、审批动作写入审计
 *   - 不修改 .env/nginx/Vault/密钥
 */

var fs = require('fs');
var path = require('path');
var crypto = require('crypto');

var MISSION_ID = 'doudian-cost-activity-pricing';
var MISSION_PATH = path.join(__dirname, '..', '..', '..', 'config', 'missions', MISSION_ID + '.mission.json');

// ─── 审计 ──────────────────────────────────────────────────

var auditLog = [];

function auditEvent(event, data) {
  var entry = {
    ts: new Date().toISOString(),
    mission: MISSION_ID,
    event: event,
    id: 'ca_' + Date.now().toString(36) + '_' + crypto.randomBytes(2).toString('hex'),
    data: data || {}
  };
  auditLog.push(entry);
  return entry;
}

function getAuditLog(limit) {
  return auditLog.slice(-(limit || 50)).reverse();
}

// ─── 配置 ──────────────────────────────────────────────────

function loadConfig() {
  try { return JSON.parse(fs.readFileSync(MISSION_PATH, 'utf-8')); } catch (_) { return null; }
}

// ─── 计算引擎 ──────────────────────────────────────────────

function calculateCost(sku, rates) {
  var purchase = sku.bucket_count * sku.purchase_cost_per_bucket;
  var packaging = sku.packaging_cost;
  var shipping = sku.shipping_cost;
  var baseCost = purchase + packaging + shipping;

  var price = sku.current_price || baseCost * 2;
  var commission = price * rates.platform_commission_rate;
  var paymentFee = price * rates.payment_fee_rate;
  var refundLoss = price * rates.refund_loss_rate;
  var adsAlloc = (rates.ads_allocation || {}).fallback || 0;

  var totalCost = baseCost + commission + paymentFee + refundLoss + adsAlloc;
  var breakEvenPrice = totalCost / (1 - 0.05); // 默认 5% 活动折扣
  var suggestedPrice = totalCost / (1 - 0.20); // 20% 目标毛利率
  var margin = price - totalCost;
  var marginRate = price > 0 ? margin / price : 0;

  return {
    sku: sku.sku,
    name: sku.name,
    role: sku.role,
    baseCost: {
      purchase: Math.round(purchase * 100) / 100,
      packaging: packaging,
      shipping: shipping,
      subtotal: Math.round(baseCost * 100) / 100
    },
    variableCost: {
      commission: Math.round(commission * 100) / 100,
      paymentFee: Math.round(paymentFee * 100) / 100,
      refundLoss: Math.round(refundLoss * 100) / 100,
      adsAllocation: adsAlloc,
      subtotal: Math.round((commission + paymentFee + refundLoss + adsAlloc) * 100) / 100
    },
    totalCost: Math.round(totalCost * 100) / 100,
    breakEvenPrice: Math.round(breakEvenPrice * 100) / 100,
    suggestedPrice: Math.round(suggestedPrice * 100) / 100,
    currentPrice: price,
    margin: Math.round(margin * 100) / 100,
    marginRate: Math.round(marginRate * 1000) / 10,
    profitPerUnit: Math.round(margin * 100) / 100
  };
}

function runFullCostCalculation(config) {
  if (!config) config = loadConfig();
  if (!config) return { success: false, error: '配置不存在' };

  var products = config.cost_model.products;
  var rates = config.cost_model.default_rates;
  var results = products.map(function (sku) { return calculateCost(sku, rates); });

  auditEvent('cost_snapshot_created', { productCount: results.length });
  results.forEach(function (r) {
    auditEvent('break_even_price_calculated', { sku: r.sku, totalCost: r.totalCost, breakEven: r.breakEvenPrice });
  });

  return { success: true, results: results, config: config };
}

// ─── 活动筛选 ──────────────────────────────────────────────

function screenActivities(config, costResults) {
  if (!config) config = loadConfig();
  if (!config) return { success: false, error: '配置不存在' };

  // 模拟官方活动列表
  var mockActivities = [
    { id: 'act_618', name: '618大促', discountRate: 0.10, type: 'platform', budgetRequired: 200 },
    { id: 'act_july', name: '7月清凉节', discountRate: 0.05, type: 'platform', budgetRequired: 100 },
    { id: 'act_flash', name: '限时秒杀', discountRate: 0.15, type: 'flash_sale', budgetRequired: 300 },
    { id: 'act_newuser', name: '新用户专享', discountRate: 0.20, type: 'promotion', budgetRequired: 50 },
    { id: 'act_brand', name: '品牌日', discountRate: 0.08, type: 'brand', budgetRequired: 150 },
    { id: 'act_clearance', name: '清仓特卖', discountRate: 0.25, type: 'clearance', budgetRequired: 50 },
  ];

  auditEvent('activity_list_fetched', { count: mockActivities.length });

  var screenResults = [];
  var rules = config.activity_screening_rules;
  var approvalRules = config.approval_rules;

  mockActivities.forEach(function (act) {
    var canJoin = true;
    var skipReasons = [];
    var riskLevel = 'low';
    var requiresApproval = false;

    // 清仓模式检查
    if (act.type === 'clearance') {
      if (!rules.clearance_mode || !rules.clearance_mode.enabled) {
        canJoin = false;
        skipReasons.push('clearance_required_but_clearance_mode_disabled');
      }
      if (rules.clearance_mode && rules.clearance_mode.requires_ceo_approval) {
        requiresApproval = true;
      }
    }

    // 对每个 SKU 检查
    var skuResults = costResults.map(function (cr) {
      var discountedPrice = cr.currentPrice * (1 - act.discountRate);
      var marginAtDiscount = discountedPrice - cr.totalCost;
      var marginRateAtDiscount = discountedPrice > 0 ? marginAtDiscount / discountedPrice : 0;

      var skuCanJoin = true;
      var skuReasons = [];

      if (discountedPrice < cr.breakEvenPrice) {
        skuCanJoin = false;
        skuReasons.push('price_below_break_even');
      }
      if (marginRateAtDiscount < rules.minimum_activity_margin_rate) {
        skuCanJoin = false;
        skuReasons.push('negative_margin');
      }
      if (skuReasons.length > 0) canJoin = false;

      return {
        sku: cr.sku,
        name: cr.name,
        currentPrice: cr.currentPrice,
        discountedPrice: Math.round(discountedPrice * 100) / 100,
        cost: cr.totalCost,
        marginAtDiscount: Math.round(marginAtDiscount * 100) / 100,
        marginRate: Math.round(marginRateAtDiscount * 1000) / 10,
        canJoin: skuCanJoin,
        reasons: skuReasons
      };
    });

    // 风险评级
    if (act.discountRate > 0.15) riskLevel = 'high';
    else if (act.discountRate > 0.08) riskLevel = 'medium';
    if (act.budgetRequired > 200) { requiresApproval = true; riskLevel = riskLevel === 'low' ? 'medium' : riskLevel; }

    // 审批检查
    if (approvalRules.ceo_approval_required.indexOf('real_activity_signup') !== -1) {
      requiresApproval = true;
    }
    if (approvalRules.ceo_approval_required.indexOf('expected_budget_spend>200') !== -1 && act.budgetRequired > 200) {
      requiresApproval = true;
    }

    screenResults.push({
      activity: act,
      canJoin: canJoin,
      skipReasons: skipReasons,
      riskLevel: riskLevel,
      requiresApproval: requiresApproval,
      skuResults: skuResults,
      recommendation: canJoin ? (riskLevel === 'high' ? '谨慎参加' : '建议参加') : '不建议参加'
    });
  });

  auditEvent('activity_screened', {
    total: screenResults.length,
    recommended: screenResults.filter(function (s) { return s.canJoin; }).length,
    needsApproval: screenResults.filter(function (s) { return s.requiresApproval; }).length,
  });

  return { success: true, results: screenResults, config: config };
}

// ─── Markdown 格式化 ───────────────────────────────────────

function formatCostReport(costResults) {
  var lines = [];
  lines.push('# 📊 酸辣粉全成本核算报告');
  lines.push('');
  lines.push('> 模式: REVIEW_ONLY | 仅计算展示，不执行任何操作');
  lines.push('');

  // 摘要
  lines.push('## 💰 成本明细');
  lines.push('');
  lines.push('| SKU | 采购 | 包装 | 物流 | 佣金 | 支付 | 退款 | 全成本 | 保本价 | 建议价 | 当前价 | 毛利 | 毛利率 |');
  lines.push('|-----|------|------|------|------|------|------|--------|--------|--------|--------|------|--------|');

  costResults.forEach(function (r) {
    lines.push(
      '| ' + r.name +
      ' | ¥' + r.baseCost.purchase +
      ' | ¥' + r.baseCost.packaging +
      ' | ¥' + r.baseCost.shipping +
      ' | ¥' + r.variableCost.commission +
      ' | ¥' + r.variableCost.paymentFee +
      ' | ¥' + r.variableCost.refundLoss +
      ' | **¥' + r.totalCost + '**' +
      ' | **¥' + r.breakEvenPrice + '**' +
      ' | ¥' + r.suggestedPrice +
      ' | ¥' + r.currentPrice +
      ' | ¥' + r.margin +
      ' | ' + r.marginRate + '% |'
    );
  });

  lines.push('');
  lines.push('> 保本价 = 全成本 / (1 - 5%活动折扣)');
  lines.push('> 建议价 = 全成本 / (1 - 20%目标毛利率)');
  lines.push('');

  // 公式
  lines.push('## 📐 计算公式');
  lines.push('');
  lines.push('```');
  lines.push('全成本 = 采购成本 + 包装费 + 物流费 + 平台佣金(4%) + 支付手续费(0.6%) + 退款损失(3%)');
  lines.push('保本价 = 全成本 / (1 - 活动折扣率)');
  lines.push('建议价 = 全成本 / (1 - 20%)');
  lines.push('```');
  lines.push('');

  return lines.join('\n');
}

function formatActivityScreenReport(screenResults) {
  var lines = [];
  lines.push('# 🎪 酸辣粉活动利润筛选报告');
  lines.push('');
  lines.push('> 模式: REVIEW_ONLY | 仅筛选展示，不自动报名');
  lines.push('');

  var recommended = screenResults.filter(function (s) { return s.canJoin; });
  var needApproval = screenResults.filter(function (s) { return s.requiresApproval; });

  lines.push('## 📊 筛选摘要');
  lines.push('');
  lines.push('| 指标 | 值 |');
  lines.push('|------|-----|');
  lines.push('| 总活动数 | **' + screenResults.length + '** |');
  lines.push('| 可参加 | **' + recommended.length + '** ✅ |');
  lines.push('| 不建议 | **' + (screenResults.length - recommended.length) + '** ❌ |');
  lines.push('| 需CEO审批 | **' + needApproval.length + '** ⏸️ |');
  lines.push('');

  // 活动明细
  lines.push('## 🏷 活动明细');
  lines.push('');

  screenResults.forEach(function (sr) {
    var icon = sr.canJoin ? (sr.riskLevel === 'high' ? '🟡' : '🟢') : '🔴';
    var approvalTag = sr.requiresApproval ? ' ⏸️需审批' : '';
    lines.push('### ' + icon + ' ' + sr.activity.name + approvalTag);
    lines.push('');
    lines.push('| 属性 | 值 |');
    lines.push('|------|-----|');
    lines.push('| 类型 | ' + sr.activity.type + ' |');
    lines.push('| 折扣率 | ' + (sr.activity.discountRate * 100) + '% |');
    lines.push('| 预算需求 | ¥' + sr.activity.budgetRequired + ' |');
    lines.push('| 建议 | **' + sr.recommendation + '** |');
    lines.push('| 风险 | ' + sr.riskLevel + ' |');
    if (sr.skipReasons.length > 0) {
      lines.push('| 跳过原因 | ' + sr.skipReasons.join(', ') + ' |');
    }
    lines.push('');

    // SKU 明细
    lines.push('| SKU | 当前价 | 折扣价 | 成本 | 折扣毛利 | 可参加 |');
    lines.push('|-----|--------|--------|------|----------|--------|');
    sr.skuResults.forEach(function (skr) {
      var joinIcon = skr.canJoin ? '✅' : '❌';
      lines.push('| ' + skr.name + ' | ¥' + skr.currentPrice + ' | ¥' + skr.discountedPrice + ' | ¥' + skr.cost + ' | ¥' + skr.marginAtDiscount + ' | ' + joinIcon + ' |');
    });
    lines.push('');
  });

  lines.push('---');
  lines.push('> 🔒 REVIEW_ONLY — 不自动报名，real_activity_signup 需 CEO 审批');
  lines.push('> 使用 /活动报名 生成审批单 | 使用 /董事会 审批');

  return lines.join('\n');
}

// ─── 审批单生成 ────────────────────────────────────────────

function generateApprovalRequest(config, screenResults) {
  var needApproval = screenResults.filter(function (s) { return s.canJoin && s.requiresApproval; });
  var lines = [];

  lines.push('# ⏸️ 活动报名审批单');
  lines.push('');
  lines.push('> 以下活动需 CEO 审批后方可报名');
  lines.push('');

  if (needApproval.length === 0) {
    lines.push('✅ 当前无可报名活动，或所有活动无需审批。');
    auditEvent('approval_requested', { count: 0, message: 'no approval needed' });
    return lines.join('\n');
  }

  lines.push('| # | 活动 | 折扣率 | 预算 | 风险 | 建议 |');
  lines.push('|---|------|--------|------|------|------|');
  needApproval.forEach(function (sr, i) {
    lines.push('| ' + (i + 1) + ' | ' + sr.activity.name + ' | ' + (sr.activity.discountRate * 100) + '% | ¥' + sr.activity.budgetRequired + ' | ' + sr.riskLevel + ' | ' + sr.recommendation + ' |');
  });
  lines.push('');

  lines.push('## ⚠️ 需要审批的动作');
  lines.push('');
  lines.push('- real_activity_signup: **必须 CEO 审批**');
  lines.push('- real_price_change: **必须 CEO 审批**');
  lines.push('- expected_budget_spend>' + (config.cost_model.minimum_activity_margin_rate * 100) + '%: 需 CFO+CEO 确认');
  lines.push('');

  lines.push('> 请在 /董事会 中审批，或发送 /审计 查看完整审计日志');

  auditEvent('approval_requested', {
    count: needApproval.length,
    activities: needApproval.map(function (s) { return s.activity.id; })
  });

  return lines.join('\n');
}

// ─── 公共 API ──────────────────────────────────────────────

function runCostCalculation() {
  var config = loadConfig();
  if (!config) return { success: false, report: '❌ 配置不存在' };

  var costResult = runFullCostCalculation(config);
  if (!costResult.success) return costResult;

  var report = formatCostReport(costResult.results);
  return { success: true, report: report, results: costResult.results };
}

function runActivityScreening() {
  var config = loadConfig();
  if (!config) return { success: false, report: '❌ 配置不存在' };

  var costResult = runFullCostCalculation(config);
  if (!costResult.success) return { success: false, report: costResult.error };

  var screenResult = screenActivities(config, costResult.results);
  if (!screenResult.success) return { success: false, report: screenResult.error };

  var report = formatActivityScreenReport(screenResult.results);
  return { success: true, report: report, costResults: costResult.results, screenResults: screenResult.results };
}

function runApprovalRequest() {
  var config = loadConfig();
  if (!config) return { success: false, report: '❌ 配置不存在' };

  var costResult = runFullCostCalculation(config);
  var screenResult = screenActivities(config, costResult.results);
  var report = generateApprovalRequest(config, screenResult.results);
  return { success: true, report: report };
}

module.exports = {
  runCostCalculation: runCostCalculation,
  runActivityScreening: runActivityScreening,
  runApprovalRequest: runApprovalRequest,
  getAuditLog: getAuditLog,
  loadConfig: loadConfig,
  // 内部导出
  _calculateCost: calculateCost,
  _screenActivities: screenActivities,
  _formatCostReport: formatCostReport,
  _formatActivityScreenReport: formatActivityScreenReport,
  _generateApprovalRequest: generateApprovalRequest,
  MISSION_PATH: MISSION_PATH,
};
