/**
 * 审查仪表板 v1
 * 提供高风险统计、违禁命中聚合、风险趋势、摘要
 */

const { analyzeRisk } = require('./risk-policy');
const { buildRiskSummary, updateRiskSummary } = require('./risk-summary');

// 内存存储 (生产环境应替换为持久化)
class ReviewDashboard {
  constructor() {
    this.prHistory = [];     // 存储 { files, timestamp, riskScore, forbiddenHits }
  }

  /**
   * 添加一次 PR 审查记录
   * @param {string[]} files - 文件路径数组
   * @param {string} timestamp - ISO 时间戳 (可选)
   * @returns {Object} 本次审查结果 + 更新后的仪表板统计
   */
  addReview(files, timestamp = new Date().toISOString()) {
    const riskResult = analyzeRisk(files);
    const record = {
      files,
      timestamp,
      riskScore: riskResult.riskScore,
      forbiddenHits: riskResult.forbiddenHits,
      level: riskResult.level,
    };
    this.prHistory.push(record);
    const dashboardStats = this.getStats();
    return {
      reviewResult: riskResult,
      dashboardStats,
    };
  }

  /**
   * 批量添加审查记录
   * @param {Array} reviews - [{ files, timestamp }]
   * @returns {Object} 聚合统计
   */
  addReviews(reviews) {
    for (const rev of reviews) {
      const riskResult = analyzeRisk(rev.files);
      this.prHistory.push({
        files: rev.files,
        timestamp: rev.timestamp || new Date().toISOString(),
        riskScore: riskResult.riskScore,
        forbiddenHits: riskResult.forbiddenHits,
        level: riskResult.level,
      });
    }
    return this.getStats();
  }

  /**
   * 获取当前仪表板统计数据
   * @returns {Object} { highRiskCount, forbiddenHits, riskTrend, summary }
   */
  getStats() {
    if (this.prHistory.length === 0) {
      return {
        highRiskCount: 0,
        forbiddenHits: 0,
        riskTrend: 'stable',
        summary: '暂无审查记录',
      };
    }

    // 构建 summary 所需的数据结构
    const prData = this.prHistory.map(record => ({
      files: record.files,
      timestamp: record.timestamp,
    }));
    return buildRiskSummary(prData);
  }

  /**
   * 获取详细历史 (含每次审查的明细)
   * @returns {Array}
   */
  getHistory() {
    return this.prHistory.map(record => ({
      timestamp: record.timestamp,
      riskScore: record.riskScore,
      forbiddenHits: record.forbiddenHits,
      level: record.level,
    }));
  }

  /**
   * 重置仪表板
   */
  reset() {
    this.prHistory = [];
  }
}

// 单例实例 (可选)
let instance = null;
function getDashboardInstance() {
  if (!instance) {
    instance = new ReviewDashboard();
  }
  return instance;
}

module.exports = {
  ReviewDashboard,
  getDashboardInstance,
};
