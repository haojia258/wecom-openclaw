const { RULES, determineActions } = require('./ads-rules');
const { calculateScores } = require('./ads-score-model');
const fs = require('fs');
const path = require('path');

/**
 * 标准化输入数据（后续从 logs/ads/ads-report_latest.json 读取）
 */
function normalize(raw) {
  // 支持嵌套或扁平结构，提取所需字段
  const data = raw.data || raw;
  return {
    spend: Number(data.spend) || 0,
    roi: Number(data.roi) || 0,
    ctr: Number(data.ctr) || 0,
    cvr: Number(data.cvr) || 0,
    impressions: Number(data.impressions) || 0,
    clicks: Number(data.clicks) || 0,
    orders: Number(data.orders) || 0,
    gmv: Number(data.gmv) || 0,
    // 可能附带SKU维度信息
    topSku: data.topSku || null,
    skuPerformance: data.skuPerformance || [],
  };
}

/**
 * 生成纯规则驱动的投流分析报告（中文，不超过600字，明确动作）
 */
function generateAnalysis(normalized) {
  const scores = calculateScores(normalized);
  const actions = determineActions(normalized);
  const { spend, roi, ctr, cvr, impressions, clicks, orders, gmv } = normalized;

  let report = '';

  // 1. 今日投流摘要
  report += `【今日投流摘要】\n`;
  report += `消耗：¥${spend.toFixed(2)}，展现：${impressions}，点击：${clicks}，成交：${orders}单，GMV：¥${gmv.toFixed(2)}\n`;
  report += `点击率：${(ctr*100).toFixed(2)}%，转化率：${(cvr*100).toFixed(2)}%，ROI：${roi.toFixed(2)}\n\n`;

  // 2. ROI分析
  report += `【ROI分析】\n`;
  if (roi >= RULES.ROI.GOOD) report += `✅ ROI优秀（≥${RULES.ROI.GOOD}），盈利能力强劲。\n`;
  else if (roi >= RULES.ROI.NORMAL) report += `🟢 ROI正常（${RULES.ROI.NORMAL}-${RULES.ROI.GOOD}），可维持当前投放。\n`;
  else if (roi >= RULES.ROI.LOW) report += `🟡 ROI偏低（${RULES.ROI.LOW}-${RULES.ROI.NORMAL}），需优化素材或人群。\n`;
  else if (roi >= RULES.ROI.CRITICAL_LOW) report += `🔴 ROI极低（${RULES.ROI.CRITICAL_LOW}-${RULES.ROI.LOW}），建议暂停高风险计划。\n`;
  else report += `⛔ ROI严重亏损（<${RULES.ROI.CRITICAL_LOW}），立即停投并排查落地页/选品。\n`;

  // 3. 放量/停投建议
  if (actions.stop) {
    report += `\n⛔ 【建议停投】：ROI严重不达标，立刻暂停所有投放计划，检查商品竞争力与投放设置。\n`;
  } else if (actions.scaleDown) {
    report += `⚠️ 【建议缩减预算】：当前ROI低于安全线，可将日预算降低30-50%，观察明日数据。\n`;
  }

  if (actions.scaleUp && !actions.stop) {
    report += `\n📈 【建议放量】：ROI、点击率、转化率均健康，可逐步提升预算20-30%。\n`;
  } else if (!actions.scaleUp && !actions.stop && roi >= RULES.ROI.NORMAL) {
    report += `\n🔹 【平稳投放】：维持现有预算，优化低效创意即可。\n`;
  }

  // 4. 推荐SKU
  if (normalized.topSku) {
    report += `\n🎯 【主力SKU推荐】："${normalized.topSku}" 表现最佳，可集中预算主推。\n`;
  } else if (normalized.skuPerformance && normalized.skuPerformance.length > 0) {
    const best = normalized.skuPerformance.reduce((a, b) => (a.roi || 0) > (b.roi || 0) ? a : b);
    report += `🎯 【SKU建议】："${best.name || best.id}" ROI最高，适合加投。\n`;
  }

  // 5. 风险提示
  const riskItems = [];
  if (actions.riskFlags.includes('CTR_TOO_LOW')) riskItems.push('点击率过低，素材吸引力不足');
  if (actions.riskFlags.includes('CVR_TOO_LOW')) riskItems.push('转化率异常，检查落地页体验');
  if (actions.riskFlags.includes('SPEND_TOO_HIGH_LOW_ROI')) riskItems.push('消耗过高但ROI低，可能无效流量');
  if (riskItems.length > 0) {
    report += `\n⚠️ 【风险提示】：${riskItems.join('；')}。\n`;
  }

  // 6. 评分
  report += `\n【综合评分】总投流分：${scores.totalScore}/100（ROI健康度：${scores.roiHealth}，转化质量：${scores.conversionQuality}，放量机会：${scores.scaleOpportunity}，风险等级：${scores.riskLevel}）\n`;

  // 7. 今日最优先动作
  report += `\n👉 【今日最优先动作】：`;
  if (actions.stop) {
    report += `立刻暂停全部计划，分析亏损原因。`;
  } else if (actions.scaleDown) {
    report += `缩减预算30%，并将预算集中到ROI最高的计划。`;
  } else if (actions.scaleUp) {
    report += `增加预算20%，重点投放高ROI SKU。`;
  } else {
    report += `保持现有投放，优化点击率/转化率较低的创意。`;
  }

  return report.substring(0, 600);   // 确保总长度不超过600字（按实际字符截断）
}

/**
 * 主入口：从文件读取最新投流报告并返回分析文本
 * @param {string} dataPath 可选，测试时可传入mock路径
 */
function analyzeLatest(dataPath = null) {
  const filePath = dataPath || path.resolve(__dirname, '../../../logs/ads/ads-report_latest.json');
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const normalized = normalize(raw);
  return generateAnalysis(normalized);
}

module.exports = { normalize, generateAnalysis, analyzeLatest };