'use strict';

const { evaluate } = require('./score-model');

function buildFallbackReport(rawData = {}) {
  const scores = evaluate(rawData);

  const lines = [
    '📊 今日运营分析（本地回退）',
    '',
    '1. 今日运营摘要',
    `总运营分：${scores.totalScore.score}`,
    '',
    '2. 风险',
    `售后风险分：${scores.aftersaleRisk.score}`,
    `风险原因：${scores.aftersaleRisk.reasons.join('；')}`,
    '',
    '3. SKU建议',
    `SKU利润质量分：${scores.skuProfitQuality.score}`,
    `建议：${scores.skuProfitQuality.nextAction}`,
    '',
    '4. 活动建议',
    `活动机会分：${scores.activityChance.score}`,
    `建议：${scores.activityChance.nextAction}`,
    '',
    '5. 下一步动作',
    `优先动作：${scores.totalScore.nextAction}`,
  ];

  return lines.join('\n');
}

async function generateAnalysis({ rawData, enhancer }) {
  const fallback = buildFallbackReport(rawData);

  if (typeof enhancer !== 'function') return fallback;

  try {
    const result = await enhancer();
    if (!result || !String(result).trim()) return fallback;
    return String(result).trim();
  } catch (_) {
    return fallback;
  }
}

module.exports = {
  buildFallbackReport,
  generateAnalysis,
};
