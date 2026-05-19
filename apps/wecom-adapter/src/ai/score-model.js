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
    reasons: penalties.length ? penalties.map((p) => p.reason) : ['\u6307\u6807\u7a33\u5b9a'],
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
    gmvPenalties.push({ item: 'GMV\u589e\u957f\u504f\u5f31', value: 25, reason: 'GMV\u4f4e\u4e8e\u9884\u8b66\u9608\u503c\uff0c\u9700\u4f18\u5148\u62c9\u5347\u8f6c\u5316\u4e0e\u5ba2\u5355' });
  }

  const aftersalePenalties = [];
  if (aftersaleRate > RULES.AFTERSALE_WARNING) {
    aftersalePenalties.push({ item: '\u552e\u540e\u7387\u504f\u9ad8', value: 30, reason: '\u552e\u540e\u7387\u9ad8\u4e8e\u9608\u503c\uff0c\u53ef\u80fd\u4fb5\u8680\u5229\u6da6\u4e0e\u8bc4\u5206' });
  }
  if (riskLevel > RULES.RISK_HIGH_THRESHOLD) {
    aftersalePenalties.push({ item: '\u98ce\u9669\u7b49\u7ea7\u9ad8', value: 20, reason: '\u98ce\u9669\u4fe1\u53f7\u504f\u9ad8\uff0c\u9700\u5feb\u901f\u6392\u67e5\u5f02\u5e38\u8ba2\u5355\u4e0e\u6295\u8bc9' });
  }

  const activityPenalties = [];
  if (roi < RULES.ROI_WARNING) {
    activityPenalties.push({ item: '\u6d3b\u52a8ROI\u4f4e', value: 25, reason: '\u6d3b\u52a8\u6295\u5165\u4ea7\u51fa\u504f\u4f4e\uff0c\u5b58\u5728\u9884\u7b97\u6d6a\u8d39\u98ce\u9669' });
  }

  const skuPenalties = [];
  if (skuProfitRate < RULES.SKU_PROFIT_WARNING) {
    skuPenalties.push({ item: 'SKU\u5229\u6da6\u7387\u504f\u4f4e', value: 25, reason: '\u4f4e\u5229\u6da6SKU\u5360\u6bd4\u9ad8\uff0c\u5229\u6da6\u8d28\u91cf\u53d7\u538b' });
  }

  const gmvHealth = scoreWithReasons('GMV\u5065\u5eb7\u5ea6', RULES.SCORE_BASE, gmvPenalties, '\u68c0\u67e5\u6d41\u91cf\u5165\u53e3\u4e0e\u9ad8\u8f6c\u5316\u5546\u54c1\u8be6\u60c5\u9875');
  const aftersaleRisk = scoreWithReasons('\u552e\u540e\u98ce\u9669', RULES.SCORE_BASE, aftersalePenalties, '\u6392\u67e5\u9ad8\u9891\u552e\u540eSKU\u5e76\u4fee\u590d\u63cf\u8ff0\u4e0e\u5c65\u7ea6\u95ee\u9898');
  const activityChance = scoreWithReasons('\u6d3b\u52a8\u673a\u4f1a', RULES.SCORE_BASE, activityPenalties, '\u6536\u7f29\u4f4eROI\u6d3b\u52a8\u5e76\u52a0\u7801\u9ad8\u56de\u62a5\u6e20\u9053');
  const skuProfitQuality = scoreWithReasons('SKU\u5229\u6da6\u8d28\u91cf', RULES.SCORE_BASE, skuPenalties, '\u4f18\u5316\u5b9a\u4ef7\u4e0e\u7ec4\u5408\u5305\uff0c\u63d0\u5347\u9ad8\u6bdb\u5229SKU\u5360\u6bd4');

  const totalScore = clamp(Math.round((gmvHealth.score + aftersaleRisk.score + activityChance.score + skuProfitQuality.score) / 4));

  return {
    gmvHealth,
    aftersaleRisk,
    activityChance,
    skuProfitQuality,
    totalScore: {
      name: '\u603b\u8fd0\u8425\u5206',
      score: totalScore,
      reasons: ['\u7efc\u5408\u56db\u4e2a\u6838\u5fc3\u7ef4\u5ea6\u8ba1\u7b97\u5f97\u51fa'],
      deductions: [],
      nextAction: totalScore < 75 ? '\u5148\u63a7\u98ce\u9669\u518d\u62c9\u589e\u957f\uff0c\u6309\u4f18\u5148\u7ea7\u9010\u9879\u4fee\u590d' : '\u4fdd\u6301\u8282\u594f\uff0c\u7ee7\u7eed\u4f18\u5316\u5229\u6da6\u4e0e\u6d3b\u52a8\u6548\u7387',
    },
  };
}

module.exports = {
  evaluate,
};
