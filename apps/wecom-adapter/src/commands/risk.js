'use strict';

/**
 * /风险 命令
 * v1.0 - 读取售后/退款数据，展示风险预警
 */

const fs = require('fs');
const config = require('../lib/config');

// 读取 JSON，失败返回 null
function readJson(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

async function execute(ctx) {
  const lines = ['⚠️ 风险预警'];
  lines.push('');

  const now = new Date();
  let hasRisk = false;

  // 1. 售后/退款数据
  const aftersales = readJson(config.AFTERSALES_FILE);
  const report = readJson(config.SYNC_REPORT_FILE);
  const compass = readJson(config.COMPASS_FILE);

  // 数据时间
  let dataSourceTime = 0;
  if (aftersales && aftersales.timestamp) {
    dataSourceTime = Math.max(dataSourceTime, new Date(aftersales.timestamp).getTime());
  }
  if (report && report.timestamp) {
    dataSourceTime = Math.max(dataSourceTime, new Date(report.timestamp).getTime());
  }
  if (dataSourceTime > 0) {
    lines.push('【数据时间】');
    lines.push(new Date(dataSourceTime).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }));
    lines.push('');
  }

  // 2. 退款率风险
  lines.push('【退款/售后】');
  if (report && report.summary) {
    const s = report.summary;
    const refundCount = s.totalRefunds || 0;
    const refundRate = parseFloat((s.refundRate || '0').replace('%', '')) / 100;

    lines.push('退款笔数: ' + refundCount);
    lines.push('退款率: ' + (s.refundRate || '数据缺失'));

    if (refundRate > 0.3) {
      lines.push('🔴 高风险：退款率 > 30%，建议排查商品质量和描述');
      hasRisk = true;
    } else if (refundRate > 0.15) {
      lines.push('🟡 中风险：退款率 > 15%，关注最近退款原因');
      hasRisk = true;
    } else if (refundCount === 0) {
      lines.push('🟢 退款率为 0，表现良好');
    } else {
      lines.push('🟢 退款率在安全范围内');
    }
  } else {
    lines.push('数据缺失，无法判断退款风险');
  }
  lines.push('');

  // 3. 退款原因分布
  if (aftersales && aftersales.aftersales && aftersales.aftersales.length > 0) {
    lines.push('【退款原因】');
    const reasonCount = {};
    for (const a of aftersales.aftersales) {
      const r = a.reason || '未知';
      reasonCount[r] = (reasonCount[r] || 0) + 1;
    }
    for (const [r, cnt] of Object.entries(reasonCount)) {
      lines.push('  ' + r + ': ' + cnt + '笔');
    }
    lines.push('');
  }

  // 4. 体验分风险
  lines.push('【体验分】');
  let expScore = null;
  if (compass) {
    if (compass['近1天'] && compass['近1天']['体验分'] !== undefined) {
      expScore = compass['近1天']['体验分'];
    } else if (compass.summary && compass.summary.experienceScore !== undefined) {
      expScore = compass.summary.experienceScore;
    }
  }
  if (expScore !== null && expScore > 0) {
    lines.push('当前体验分: ' + expScore);
    if (expScore < 4.0) {
      lines.push('🔴 严重：体验分 < 4.0，可能导致流量降权！');
      hasRisk = true;
    } else if (expScore < 4.5) {
      lines.push('🟡 偏低：体验分 < 4.5，重点关注物流时效和售后响应');
      hasRisk = true;
    } else {
      lines.push('🟢 体验分正常');
    }
  } else {
    lines.push('数据缺失（compass 数据不可用）');
  }
  lines.push('');

  // 5. 综合结论
  if (!hasRisk) {
    lines.push('✅ 暂无高风险预警');
  }

  return lines.join('\n');
}

module.exports = { execute, desc: '风险预警' };
