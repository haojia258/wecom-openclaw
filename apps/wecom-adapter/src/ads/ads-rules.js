/**
 * 投流分析规则系统
 * 集中管理所有判断阈值、风险级别与动作建议，便于调参
 */

const RULES = {
  ROI: {
    CRITICAL_LOW: 1.0,    // 严重偏低
    LOW: 2.0,             // 偏低
    NORMAL: 3.0,          // 正常
    GOOD: 5.0,            // 优秀
  },
  CTR: {
    CRITICAL_LOW: 0.005,  // 0.5%
    LOW: 0.01,            // 1%
    NORMAL: 0.03,
  },
  CVR: {
    CRITICAL_LOW: 0.01,   // 1%
    LOW: 0.02,
    NORMAL: 0.05,
  },
  SPEND: {
    HIGH_DAILY: 5000,     // 日消耗过高预警(元)
  },
  SCORE_WEIGHTS: {
    ROI_HEALTH: 0.35,
    CONVERSION_QUALITY: 0.25,
    SCALE_OPPORTUNITY: 0.25,
    RISK_PENALTY: 0.15,   // 风险扣分项(从总分中扣除)
  },
};

/**
 * 根据当前指标获取具体动作
 * @param {Object} normalized 标准化数据
 * @returns {Object} 动作集合 { stop, scaleDown, scaleUp, focusSku }
 */
function determineActions(normalized) {
  const { roi, ctr, cvr, spend } = normalized;
  const actions = {
    stop: false,
    scaleDown: false,
    scaleUp: false,
    focusSku: null,          // 推荐SKU（需外部传入可选项）
    riskFlags: [],
  };

  if (roi < RULES.ROI.CRITICAL_LOW) {
    actions.stop = true;
    actions.riskFlags.push('ROI_TOO_LOW');
  } else if (roi < RULES.ROI.LOW) {
    actions.scaleDown = true;
    actions.riskFlags.push('ROI_LOW');
  }

  if (ctr < RULES.CTR.CRITICAL_LOW) {
    actions.riskFlags.push('CTR_TOO_LOW');
  }
  if (cvr < RULES.CVR.CRITICAL_LOW) {
    actions.riskFlags.push('CVR_TOO_LOW');
  }

  if (spend > RULES.SPEND.HIGH_DAILY && roi < RULES.ROI.LOW) {
    actions.scaleDown = true;
    actions.riskFlags.push('SPEND_TOO_HIGH_LOW_ROI');
  }

  if (roi >= RULES.ROI.GOOD && ctr >= RULES.CTR.NORMAL && cvr >= RULES.CVR.NORMAL) {
    actions.scaleUp = true;
  }

  return actions;
}

module.exports = { RULES, determineActions };
