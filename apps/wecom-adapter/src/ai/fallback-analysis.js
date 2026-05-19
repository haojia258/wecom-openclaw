'use strict';

const { evaluate } = require('./score-model');

function buildFallbackReport(rawData = {}, trends = null) {
  const scores = evaluate(rawData);

  const lines = [
    '\ud83d\udcca \u4eca\u65e5\u8fd0\u8425\u5206\u6790\uff08\u672c\u5730\u56de\u9000\uff09',
    '',
    '1. \u4eca\u65e5\u8fd0\u8425\u6458\u8981',
    `\u603b\u8fd0\u8425\u5206\uff1a${scores.totalScore.score}`,
    '',
    '2. \u98ce\u9669',
    `\u552e\u540e\u98ce\u9669\u5206\uff1a${scores.aftersaleRisk.score}`,
    `\u98ce\u9669\u539f\u56e0\uff1a${scores.aftersaleRisk.reasons.join('\uff1b')}`,
    '',
    '3. SKU\u5efa\u8bae',
    `SKU\u5229\u6da6\u8d28\u91cf\u5206\uff1a${scores.skuProfitQuality.score}`,
    `\u5efa\u8bae\uff1a${scores.skuProfitQuality.nextAction}`,
    '',
    '4. \u6d3b\u52a8\u5efa\u8bae',
    `\u6d3b\u52a8\u673a\u4f1a\u5206\uff1a${scores.activityChance.score}`,
    `\u5efa\u8bae\uff1a${scores.activityChance.nextAction}`,
    '',
    '5. \u4e0b\u4e00\u6b65\u52a8\u4f5c',
    `\u4f18\u5148\u52a8\u4f5c\uff1a${scores.totalScore.nextAction}`,
  ];

  if (trends && Array.isArray(trends.summary)) {
    lines.push('');
    lines.push('6. \u8fde\u7eed\u8fd0\u8425\u8d8b\u52bf');
    for (const t of trends.summary) lines.push(`- ${t}`);
  }

  return lines.join('\n');
}

async function generateAnalysis({ rawData, enhancer, trends }) {
  const fallback = buildFallbackReport(rawData, trends);

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
