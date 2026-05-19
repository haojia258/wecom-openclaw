/**
 * 投流规则增强层 (DeepSeek v2)
 * 包含: ROI分层 / CTR/CVR异常 / 放量/停投/预算/SKU建议 / 缺数据fallback
 * 不依赖GPT, 规则可解释, 阈值集中管理
 */

// ---------- 阈值配置 ----------
const THRESHOLDS = {
  // ROI 分层 (实际ROI)
  roi: {
    EXCELLENT: 2.0,      // 极高效率
    GOOD: 1.2,           // 良好
    WARNING: 0.8,        // 低于警告线
    STOP: 0.5,           // 停投线
  },
  // CTR 异常区间 (百分比)
  ctr: {
    TOO_LOW: 1.0,        // <1% 极低
    NORMAL_MIN: 1.0,
    NORMAL_MAX: 15.0,
    TOO_HIGH: 15.0,      // >15% 可能虚假点击
  },
  // CVR 异常区间 (百分比)
  cvr: {
    TOO_LOW: 0.5,        // <0.5% 转化极差
    NORMAL_MIN: 0.5,
    NORMAL_MAX: 10.0,
    TOO_HIGH: 10.0,      // >10% 需核实归因
  },
  // 放量条件
  scale: {
    MIN_ROI_FOR_SCALE: 1.5,
    MIN_CLICKS: 200,
    BUDGET_USAGE_RATIO: 0.8,  // 消耗已达预算80%
    SCALE_PERCENT: 25,        // 默认放量25%
  },
  // 停投条件
  stop: {
    MIN_CLICKS_FOR_STOP: 500,
    MIN_IMPRESSIONS_FOR_STOP: 10000,
  },
  // 预算建议
  budget: {
    INCREASE_RATIO_HIGH: 1.5,   // ROI>2.0 增50%
    INCREASE_RATIO_GOOD: 1.3,   // ROI>1.5 增30%
    DECREASE_RATIO: 0.7,        // ROI<0.8 降30%
  },
  // 缺数据 fallback
  fallback: {
    DEFAULT_ROI: 1.0,
    DEFAULT_CTR: 2.0,
    DEFAULT_CVR: 1.0,
    USE_CPC_THRESHOLD: 2.5,     // 无ROI时，若CPC>2.5元则警告
  }
};

// ---------- 辅助函数 ----------
function safeNumber(val, fallback = 0) {
  const n = parseFloat(val);
  return isNaN(n) ? fallback : n;
}

// ROI 分层评估
function evaluateROI(roi) {
  if (roi >= THRESHOLDS.roi.EXCELLENT) return { level: 'excellent', action: 'strong_scale', msg: 'ROI极高，强烈建议放量' };
  if (roi >= THRESHOLDS.roi.GOOD) return { level: 'good', action: 'scale', msg: 'ROI良好，可适度增加预算' };
  if (roi >= THRESHOLDS.roi.WARNING) return { level: 'warning', action: 'optimize', msg: 'ROI偏低，建议优化素材或人群' };
  if (roi >= THRESHOLDS.roi.STOP) return { level: 'poor', action: 'reduce', msg: 'ROI较差，建议降低预算或修改出价' };
  return { level: 'critical', action: 'stop', msg: 'ROI极差，建议立即停投' };
}

// CTR/CVR 异常判断
function evaluateCTR(ctr) {
  if (ctr < THRESHOLDS.ctr.TOO_LOW) return { abnormal: true, type: 'too_low', msg: '点击率过低，检查创意/定向' };
  if (ctr > THRESHOLDS.ctr.TOO_HIGH) return { abnormal: true, type: 'too_high', msg: '点击率异常偏高，警惕虚假流量' };
  return { abnormal: false, msg: 'CTR正常' };
}

function evaluateCVR(cvr) {
  if (cvr < THRESHOLDS.cvr.TOO_LOW) return { abnormal: true, type: 'too_low', msg: '转化率过低，检查落地页/商品' };
  if (cvr > THRESHOLDS.cvr.TOO_HIGH) return { abnormal: true, type: 'too_high', msg: '转化率异常偏高，核对归因' };
  return { abnormal: false, msg: 'CVR正常' };
}

// 放量建议
function getScaleSuggestion(roi, cost, budget, clicks) {
  if (roi >= THRESHOLDS.scale.MIN_ROI_FOR_SCALE && clicks >= THRESHOLDS.scale.MIN_CLICKS) {
    const usage = cost / budget;
    if (usage >= THRESHOLDS.scale.BUDGET_USAGE_RATIO) {
      return { action: 'scale_budget', percent: THRESHOLDS.scale.SCALE_PERCENT, msg: `消耗接近预算，建议增加${THRESHOLDS.scale.SCALE_PERCENT}%预算` };
    }
    return { action: 'scale_delivery', msg: 'ROI优秀且点击足够，可放开定向或提价抢量' };
  }
  return null;
}

// 停投建议
function getStopSuggestion(roi, clicks, impressions, cost) {
  if (roi < THRESHOLDS.roi.STOP && clicks >= THRESHOLDS.stop.MIN_CLICKS_FOR_STOP) {
    return { action: 'stop', urgency: 'high', msg: 'ROI低于停投线且点击量充足，立即停投' };
  }
  if (roi < THRESHOLDS.roi.WARNING && impressions >= THRESHOLDS.stop.MIN_IMPRESSIONS_FOR_STOP) {
    return { action: 'stop', urgency: 'medium', msg: '曝光量大但ROI差，建议停投或替换素材' };
  }
  return null;
}

// 预算建议 (独立)
function getBudgetSuggestion(roi, cost, budget) {
  if (roi >= THRESHOLDS.roi.EXCELLENT && cost >= budget * 0.9) {
    const newBudget = Math.round(budget * THRESHOLDS.budget.INCREASE_RATIO_HIGH);
    return { action: 'increase_budget', amount: newBudget, msg: `ROI极佳且预算将尽，建议日预算增至${newBudget}` };
  }
  if (roi >= THRESHOLDS.roi.GOOD && cost >= budget * 0.8) {
    const newBudget = Math.round(budget * THRESHOLDS.budget.INCREASE_RATIO_GOOD);
    return { action: 'increase_budget', amount: newBudget, msg: `ROI良好，可增加预算至${newBudget}` };
  }
  if (roi < THRESHOLDS.roi.WARNING) {
    const newBudget = Math.round(budget * THRESHOLDS.budget.DECREASE_RATIO);
    return { action: 'decrease_budget', amount: newBudget, msg: `ROI偏低，建议降低预算至${newBudget}以减少亏损` };
  }
  return null;
}

// SKU 适配建议 (基于CTR/CVR组合)
function getSKUAdvice(ctr, cvr, productType = 'general') {
  const ctrEval = evaluateCTR(ctr);
  const cvrEval = evaluateCVR(cvr);
  if (!ctrEval.abnormal && !cvrEval.abnormal) return null;

  if (ctrEval.abnormal && ctrEval.type === 'too_high' && !cvrEval.abnormal) {
    return { action: 'check_creative', msg: '点击率极高但转化一般，检查创意是否误导或价格虚高' };
  }
  if (ctrEval.abnormal && ctrEval.type === 'too_low' && cvrEval.abnormal && cvrEval.type === 'too_low') {
    return { action: 'change_sku_or_lander', msg: '点击和转化双低，强烈建议更换SKU或彻底重做落地页' };
  }
  if (!ctrEval.abnormal && cvrEval.abnormal && cvrEval.type === 'too_low') {
    return { action: 'optimize_checkout', msg: '点击正常但转化低，优化商品详情/价格/信任标识' };
  }
  if (cvrEval.abnormal && cvrEval.type === 'too_high') {
    return { action: 'verify_conversion', msg: '转化率异常高，请核对转化追踪是否重复或作弊' };
  }
  return { action: 'review_sku', msg: 'CTR/CVR组合异常，建议人工排查SKU和受众匹配度' };
}

// 缺数据 Fallback
function applyFallback(metrics) {
  const result = { ...metrics };
  if (result.roi === undefined || result.roi === null || isNaN(result.roi)) {
    result.roi = THRESHOLDS.fallback.DEFAULT_ROI;
    result.roi_fallback = true;
  }
  if (result.ctr === undefined || result.ctr === null || isNaN(result.ctr)) {
    result.ctr = THRESHOLDS.fallback.DEFAULT_CTR;
    result.ctr_fallback = true;
  }
  if (result.cvr === undefined || result.cvr === null || isNaN(result.cvr)) {
    result.cvr = THRESHOLDS.fallback.DEFAULT_CVR;
    result.cvr_fallback = true;
  }
  // 特殊: 无ROI但CPC过高时警告
  if (result.roi_fallback && result.cpc > THRESHOLDS.fallback.USE_CPC_THRESHOLD) {
    result.cpc_warning = `缺少ROI数据，但CPC=${result.cpc}元偏高，请检查转化追踪`;
  }
  return result;
}

// ---------- 主分析函数 ----------
function analyzeAdPerformance(rawData) {
  // 归一化输入
  const data = {
    roi: safeNumber(rawData.roi),
    ctr: safeNumber(rawData.ctr),
    cvr: safeNumber(rawData.cvr),
    cost: safeNumber(rawData.cost),
    budget: safeNumber(rawData.budget, 1000),
    clicks: safeNumber(rawData.clicks),
    impressions: safeNumber(rawData.impressions),
    cpc: safeNumber(rawData.cpc, rawData.cost / (rawData.clicks || 1)),
    productType: rawData.productType || 'general',
  };

  // Fallback 缺失字段
  const enriched = applyFallback(data);

  const suggestions = [];

  // 1. ROI 分层建议
  const roiEval = evaluateROI(enriched.roi);
  suggestions.push(`[ROI] ${roiEval.msg} → 动作: ${roiEval.action}`);

  // 2. CTR/CVR 异常
  const ctrEval = evaluateCTR(enriched.ctr);
  if (ctrEval.abnormal) suggestions.push(`[CTR] ${ctrEval.msg}`);

  const cvrEval = evaluateCVR(enriched.cvr);
  if (cvrEval.abnormal) suggestions.push(`[CVR] ${cvrEval.msg}`);

  // 3. 放量建议
  const scale = getScaleSuggestion(enriched.roi, enriched.cost, enriched.budget, enriched.clicks);
  if (scale) suggestions.push(`[放量] ${scale.msg} → ${scale.action}${scale.percent ? ` +${scale.percent}%` : ''}`);

  // 4. 停投建议
  const stop = getStopSuggestion(enriched.roi, enriched.clicks, enriched.impressions, enriched.cost);
  if (stop) suggestions.push(`[停投] ${stop.msg} (紧急度:${stop.urgency}) → 动作:${stop.action}`);

  // 5. 预算建议
  const budgetAdv = getBudgetSuggestion(enriched.roi, enriched.cost, enriched.budget);
  if (budgetAdv) suggestions.push(`[预算] ${budgetAdv.msg} → 新预算:${budgetAdv.amount}`);

  // 6. SKU适配建议
  const skuAdv = getSKUAdvice(enriched.ctr, enriched.cvr, enriched.productType);
  if (skuAdv) suggestions.push(`[SKU] ${skuAdv.msg} → 动作:${skuAdv.action}`);

  // 7. 缺数据提醒
  if (enriched.roi_fallback) suggestions.push(`[缺数据] 使用默认ROI(${THRESHOLDS.fallback.DEFAULT_ROI})评估，请尽快接入转化回传`);
  if (enriched.cpc_warning) suggestions.push(`[缺数据] ${enriched.cpc_warning}`);

  // 限制输出长度 (不超过600字)
  let output = `📊 投流分析报告 (DeepSeek规则引擎)\n${suggestions.slice(0, 8).join('\n')}`;
  if (output.length > 600) output = output.substring(0, 600) + '…';

  return { summary: output, actions: suggestions.map(s => s.split('→')[1]?.trim()).filter(Boolean) };
}

// ---------- 向后兼容层 (供 ads-score-model.js / ads-analysis.js 使用) ----------
// 旧版使用 RULES 和 determineActions，新版使用 THRESHOLDS 和分析函数
const RULES_COMPAT = {
  ROI: {
    CRITICAL_LOW: THRESHOLDS.roi.STOP,    // 0.5
    LOW: THRESHOLDS.roi.WARNING,           // 0.8
    NORMAL: THRESHOLDS.roi.GOOD,           // 1.2
    GOOD: THRESHOLDS.roi.EXCELLENT,        // 2.0
  },
  CTR: {
    CRITICAL_LOW: THRESHOLDS.ctr.TOO_LOW / 100,  // 0.01
    LOW: THRESHOLDS.ctr.NORMAL_MIN / 100,        // 0.01
    NORMAL: 0.03,
  },
  CVR: {
    CRITICAL_LOW: THRESHOLDS.cvr.TOO_LOW / 100,  // 0.005
    LOW: THRESHOLDS.cvr.NORMAL_MIN / 100,        // 0.005
    NORMAL: 0.05,
  },
  SPEND: { HIGH_DAILY: 5000 },
  SCORE_WEIGHTS: {
    ROI_HEALTH: 0.35,
    CONVERSION_QUALITY: 0.25,
    SCALE_OPPORTUNITY: 0.25,
    RISK_PENALTY: 0.15,
  },
};

function determineActions(normalized) {
  const { roi, ctr, cvr, spend } = normalized;
  const actions = { stop: false, scaleDown: false, scaleUp: false, focusSku: null, riskFlags: [] };
  if (roi < RULES_COMPAT.ROI.CRITICAL_LOW) { actions.stop = true; actions.riskFlags.push('ROI_TOO_LOW'); }
  else if (roi < RULES_COMPAT.ROI.LOW) { actions.scaleDown = true; actions.riskFlags.push('ROI_LOW'); }
  if (ctr < RULES_COMPAT.CTR.CRITICAL_LOW) actions.riskFlags.push('CTR_TOO_LOW');
  if (cvr < RULES_COMPAT.CVR.CRITICAL_LOW) actions.riskFlags.push('CVR_TOO_LOW');
  if (spend > RULES_COMPAT.SPEND.HIGH_DAILY && roi < RULES_COMPAT.ROI.LOW) {
    actions.scaleDown = true; actions.riskFlags.push('SPEND_TOO_HIGH_LOW_ROI');
  }
  if (roi >= RULES_COMPAT.ROI.GOOD && ctr >= RULES_COMPAT.CTR.NORMAL && cvr >= RULES_COMPAT.CVR.NORMAL) {
    actions.scaleUp = true;
  }
  return actions;
}

module.exports = {
  THRESHOLDS,
  RULES: RULES_COMPAT,            // 向后兼容
  evaluateROI,
  evaluateCTR,
  evaluateCVR,
  getScaleSuggestion,
  getStopSuggestion,
  getBudgetSuggestion,
  getSKUAdvice,
  applyFallback,
  analyzeAdPerformance,
  determineActions,               // 向后兼容
};
