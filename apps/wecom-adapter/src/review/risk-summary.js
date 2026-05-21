/**
 * 风险摘要统计模块
 * 输入：历史审查结果数组
 * 输出：highRiskCount, forbiddenHits, riskTrend, summary
 */

const { analyzeRisk } = require('./risk-policy');

/**
 * 计算风险趋势 (比较最近两个时间段的平均风险分)
 * @param {Array} results - 审查结果数组，每个元素包含 { timestamp, files }
 * @returns {string} 'up' | 'down' | 'stable'
 */
function calculateRiskTrend(results) {
  if (!results || results.length < 2) return 'stable';

  // 按时间戳排序
  const sorted = [...results].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  const mid = Math.floor(sorted.length / 2);
  const firstHalf = sorted.slice(0, mid);
  const secondHalf = sorted.slice(mid);

  const avgFirst = firstHalf.reduce((sum, r) => sum + (r.riskScore || 0), 0) / firstHalf.length;
  const avgSecond = secondHalf.reduce((sum, r) => sum + (r.riskScore || 0), 0) / secondHalf.length;

  if (avgSecond - avgFirst > 5) return 'up';
  if (avgFirst - avgSecond > 5) return 'down';
  return 'stable';
}

/**
 * 生成摘要文本
 * @param {number} highRiskCount
 * @param {number} totalForbiddenHits
 * @param {string} trend
 * @returns {string}
 */
function generateSummary(highRiskCount, totalForbiddenHits, trend) {
  const parts = [];
  if (highRiskCount > 0) parts.push(`${highRiskCount} 个高风险 PR`);
  if (totalForbiddenHits > 0) parts.push(`${totalForbiddenHits} 次违禁命中`);
  if (trend === 'up') parts.push('风险呈上升趋势');
  else if (trend === 'down') parts.push('风险呈下降趋势');
  else parts.push('风险趋势稳定');
  return parts.join('，');
}

/**
 * 从原始 PR 数据生成风险统计摘要
 * @param {Array} prData - 每个元素包含 { files, timestamp }
 * @returns {Object} { highRiskCount, forbiddenHits, riskTrend, summary }
 */
function buildRiskSummary(prData) {
  if (!Array.isArray(prData) || prData.length === 0) {
    return {
      highRiskCount: 0,
      forbiddenHits: 0,
      riskTrend: 'stable',
      summary: '暂无审查数据',
    };
  }

  const enrichedResults = [];
  let totalForbiddenHits = 0;
  let highRiskCount = 0;

  for (const item of prData) {
    const { files, timestamp = new Date().toISOString() } = item;
    const riskResult = analyzeRisk(files);
    enrichedResults.push({
      timestamp,
      riskScore: riskResult.riskScore,
      forbiddenHits: riskResult.forbiddenHits,
      level: riskResult.level,
    });
    totalForbiddenHits += riskResult.forbiddenHits.length;
    if (riskResult.level === 'high' || riskResult.level === 'critical') {
      highRiskCount++;
    }
  }

  const riskTrend = calculateRiskTrend(enrichedResults);
  const summary = generateSummary(highRiskCount, totalForbiddenHits, riskTrend);

  return {
    highRiskCount,
    forbiddenHits: totalForbiddenHits,
    riskTrend,
    summary,
  };
}

/**
 * 增量更新统计 (基于新 PR 和之前摘要)
 * @param {Object} previousSummary - 之前返回的摘要对象
 * @param {Object} newPrData - 新 PR 数据 { files, timestamp }
 * @returns {Object} 更新后的摘要
 */
function updateRiskSummary(previousSummary, newPrData) {
  const { files, timestamp } = newPrData;
  const riskResult = analyzeRisk(files);
  const newHighRisk = (riskResult.level === 'high' || riskResult.level === 'critical') ? 1 : 0;
  const newForbiddenHits = riskResult.forbiddenHits.length;

  const updated = {
    highRiskCount: (previousSummary.highRiskCount || 0) + newHighRisk,
    forbiddenHits: (previousSummary.forbiddenHits || 0) + newForbiddenHits,
    riskTrend: previousSummary.riskTrend || 'stable',
    summary: '',
  };
  updated.summary = generateSummary(updated.highRiskCount, updated.forbiddenHits, updated.riskTrend);
  return updated;
}

module.exports = {
  calculateRiskTrend,
  generateSummary,
  buildRiskSummary,
  updateRiskSummary,
};
