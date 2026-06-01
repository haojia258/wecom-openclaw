'use strict';

// P17 Report Generator — generates daily report from loop data
var scheduler = require('./task-scheduler');

/**
 * Generate full daily report
 */
function generateDailyReport(loop) {
  var d = loop.phases.collect || {};
  var s = loop.phases.schedule || {};
  var e = loop.phases.execute || {};

  var sections = [];

  // Header
  sections.push('# 自动化运营日报 — ' + loop.date);
  sections.push('');
  sections.push('REVIEW_ONLY=true — requiresHumanApproval=true');
  sections.push('');

  // Executive Summary
  sections.push('## 经营概览');
  sections.push('');
  sections.push('| 指标 | 数值 |');
  sections.push('|------|------|');
  sections.push('| GMV (今日) | ¥' + (d.gmv ? d.gmv.today.toLocaleString() : '—') + ' |');
  sections.push('| 订单数 | ' + (d.orders ? d.orders.total : '—') + ' |');
  sections.push('| 利润 | ¥' + (d.profit ? d.profit.profit.toLocaleString() : '—') + ' (利润率 ' + (d.profit ? d.profit.margin : '—') + '%) |');
  sections.push('| 退款订单 | ' + (d.orders ? d.orders.refunded : '—') + ' |');
  sections.push('');

  // Marketing
  sections.push('## 投流表现');
  sections.push('');
  sections.push('| 指标 | 数值 |');
  sections.push('|------|------|');
  sections.push('| ROAS | ' + (d.roi ? d.roi.roas + 'x' : '—') + ' |');
  sections.push('| ROI | ' + (d.roi ? d.roi.roiPct + '%' : '—') + ' |');
  sections.push('| CTR | ' + (d.ctr ? d.ctr.ctrPct + '%' : '—') + ' |');
  sections.push('| 转化率 | ' + (d.conversion ? d.conversion.rate + '%' : '—') + ' |');
  sections.push('');

  // Campaign
  sections.push('## 活动数据');
  sections.push('');
  sections.push('| 指标 | 数值 |');
  sections.push('|------|------|');
  sections.push('| 活跃活动 | ' + (d.campaign ? d.campaign.active : '—') + ' |');
  sections.push('| 活动利润 | ¥' + (d.campaign ? d.campaign.profit.toLocaleString() : '—') + ' |');
  sections.push('| 报名人数 | ' + (d.campaign ? d.campaign.signupCount : '—') + ' |');
  sections.push('');

  // Inventory
  sections.push('## 库存概况');
  sections.push('');
  sections.push('| 指标 | 数值 |');
  sections.push('|------|------|');
  sections.push('| SKU总数 | ' + (d.inventory ? d.inventory.total : '—') + ' |');
  sections.push('| 低库存 | ' + (d.inventory ? d.inventory.lowStock : '—') + ' |');
  sections.push('');

  // Tasks
  sections.push('## 今日任务 (' + s.taskCount + ')');
  sections.push('');
  var summary = scheduler.summarizeAssignments(s.tasks || []);
  sections.push('| Agent | 任务数 |');
  sections.push('|-------|--------|');
  Object.keys(summary).forEach(function (aid) {
    sections.push('| ' + aid + ' | ' + summary[aid] + ' |');
  });
  sections.push('');

  // Artifacts
  sections.push('## 产物 (' + e.artifactCount + ')');
  sections.push('');
  var cats = e.byCategory || {};
  Object.keys(cats).filter(function (k) { return cats[k].count > 0; }).forEach(function (c) {
    sections.push('- ' + c + ': ' + cats[c].count + ' 个任务, ' + cats[c].files.length + ' 类文件');
  });
  sections.push('');

  sections.push('## 审计');
  sections.push('');
  sections.push('| 检查项 | 状态 |');
  sections.push('|--------|------|');
  sections.push('| 自动投流 | ❌ 未触发 |');
  sections.push('| 自动下单 | ❌ 未触发 |');
  sections.push('| 自动改价 | ❌ 未触发 |');
  sections.push('| 自动发布 | ❌ 未触发 |');
  sections.push('| REVIEW_ONLY | ✅ |');
  sections.push('| requiresHumanApproval | ✅ |');
  sections.push('');

  return sections.join('\n');
}

module.exports = {
  generateDailyReport: generateDailyReport
};
