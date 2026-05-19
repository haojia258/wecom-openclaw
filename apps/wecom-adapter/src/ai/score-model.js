'use strict';

const RULES = require('./rules');

function toNumber(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(v, min = 0, max = 100) {
  return Math.max(min, Math.min(max, v));
}

function scoreWithReasons(name, base, penalties, nextAction) {
  const penaltyValue = penalties.reduce((acc, p) => acc + p.value, 0);
  const score = clamp(base - penaltyValue);
  return {
    name,
    score,
    reasons: penalties.length ? penalties.map((p) => p.reason) : ['指标稳定'],
    deductions: penalties.length ? penalties.map((p) => ({ item: p.item, value: p.value })) : [],
    nextAction,
  };
}

function evaluate(data) {
  const gmvRatio = toNumber(data?.gmv?.ratio, 1);
  const aftersaleRate = toNumber(data?.aftersale?.rate, 0);
  const riskLevel = toNumber(data?.risk?.level, 0);
  const roi = toNumber(data?.activity?.roi, 2);
  const skuProfitRate = toNumber(data?.skuProfit?.avgMargin, 0.2);

  const gmvPenalties = [];
  if (gmvRatio < RULES.GMV_LOW_THRESHOLD) {
    gmvPenalties.push({ item: 'GMV增长偏弱', value: 25, reason: 'GMV低于预警阈值，需优先拉升转化与客单' });
  }

  const aftersalePenalties = [];
  if (aftersaleRate > RULES.AFTERSALE_WARNING) {
    aftersalePenalties.push({ item: '售后率偏高', value: 30, reason: '售后率高于阈值，可能侵蚀利润与评分' });
  }
  if (riskLevel > RULES.RISK_HIGH_THRESHOLD) {
    aftersalePenalties.push({ item: '风险等级高', value: 20, reason: '风险信号偏高，需快速排查异常订单与投诉' });
  }

  const activityPenalties = [];
  if (roi < RULES.ROI_WARNING) {
    activityPenalties.push({ item: '活动ROI低', value: 25, reason: '活动投入产出偏低，存在预算浪费风险' });
  }

  const skuPenalties = [];
  if (skuProfitRate < RULES.SKU_PROFIT_WARNING) {
    skuPenalties.push({ item: 'SKU利润率偏低', value: 25, reason: '低利润SKU占比高，利润质量受压' });
  }

  const gmvHealth = scoreWithReasons('GMV健康度', RULES.SCORE_BASE, gmvPenalties, '检查流量入口与高转化商品详情页');
  const aftersaleRisk = scoreWithReasons('售后风险', RULES.SCORE_BASE, aftersalePenalties, '排查高频售后SKU并修复描述与履约问题');
  const activityChance = scoreWithReasons('活动机会', RULES.SCORE_BASE, activityPenalties, '收缩低ROI活动并加码高回报渠道');
  const skuProfitQuality = scoreWithReasons('SKU利润质量', RULES.SCORE_BASE, skuPenalties, '优化定价与组合包，提升高毛利SKU占比');

  const totalScore = clamp(Math.round((gmvHealth.score + aftersaleRisk.score + activityChance.score + skuProfitQuality.score) / 4));

  return {
    gmvHealth,
    aftersaleRisk,
    activityChance,
    skuProfitQuality,
    totalScore: {
      name: '总运营分',
      score: totalScore,
      reasons: ['综合四个核心维度计算得出'],
      deductions: [],
      nextAction: totalScore < 75 ? '先控风险再拉增长，按优先级逐项修复' : '保持节奏，继续优化利润与活动效率',
    },
  };
}

module.exports = {
  evaluate,
};
