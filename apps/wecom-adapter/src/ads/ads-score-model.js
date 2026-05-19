const { RULES } = require('./ads-rules');

/**
 * 评分模型：各维度0-100分，加权汇总
 * @param {Object} normalized
 * @returns {Object} { roiHealth, conversionQuality, scaleOpportunity, riskLevel, totalScore, details }
 */
function calculateScores(normalized) {
  const { roi, ctr, cvr, spend } = normalized;

  // 1. ROI健康度 (线性映射，假设 roi>=5为满分)
  let roiHealth = Math.min(100, (roi / 5) * 100);
  roiHealth = Math.max(0, Math.round(roiHealth));

  // 2. 转化质量（综合CTR+CVR）
  const ctrScore = Math.min(100, (ctr / 0.05) * 100);
  const cvrScore = Math.min(100, (cvr / 0.1) * 100);
  let conversionQuality = Math.round(ctrScore * 0.4 + cvrScore * 0.6);
  conversionQuality = Math.max(0, conversionQuality);

  // 3. 放量机会
  let scaleOpportunity = 0;
  if (roi >= RULES.ROI.GOOD) {
    scaleOpportunity = 90;
    if (spend < RULES.SPEND.HIGH_DAILY * 0.5) scaleOpportunity = 100;
  } else if (roi >= RULES.ROI.NORMAL) {
    scaleOpportunity = 60;
  } else {
    scaleOpportunity = Math.max(0, Math.round((roi / RULES.ROI.NORMAL) * 50));
  }

  // 4. 风险等级
  let riskLevel = 0;
  if (roi < RULES.ROI.CRITICAL_LOW) riskLevel = 90;
  else if (roi < RULES.ROI.LOW) riskLevel = 60;
  else if (roi < RULES.ROI.NORMAL) riskLevel = 30;
  if (ctr < RULES.CTR.LOW) riskLevel = Math.max(riskLevel, 40);
  if (cvr < RULES.CVR.LOW) riskLevel = Math.max(riskLevel, 50);
  if (spend > RULES.SPEND.HIGH_DAILY && roi < RULES.ROI.NORMAL) riskLevel = Math.max(riskLevel, 70);

  const riskPenaltyScore = 100 - riskLevel;
  const weights = RULES.SCORE_WEIGHTS;
  let totalScore = (
    roiHealth * weights.ROI_HEALTH +
    conversionQuality * weights.CONVERSION_QUALITY +
    scaleOpportunity * weights.SCALE_OPPORTUNITY +
    riskPenaltyScore * weights.RISK_PENALTY
  );
  totalScore = Math.round(Math.min(100, Math.max(0, totalScore)));

  return {
    roiHealth,
    conversionQuality,
    scaleOpportunity,
    riskLevel,
    totalScore,
  };
}

module.exports = { calculateScores };
