// P58 Execution Center — unified status dashboard
var fs = require('fs'); var path = require('path');
var STORE_DIR = path.join(__dirname, '..', '..', 'storage', 'activities');

function load(fname) { try { return JSON.parse(fs.readFileSync(path.join(STORE_DIR, fname), 'utf8')); } catch (e) { return []; } }

function dashboard() {
  var plans = load('enrollment-plans.json');
  var hist = load('history.json');

  var pending = plans.filter(function (p) { return p.status === 'pending_approval'; }).length;
  var approved = plans.filter(function (p) { return p.status === 'approved'; }).length;
  var readyExecute = plans.filter(function (p) { return p.status === 'approved' && p.executionStatus === 'NOT_EXECUTED'; }).length;
  var executedMock = plans.filter(function (p) { return p.executionStatus && p.executionStatus.indexOf('EXECUTED') >= 0 && p.executionStatus !== 'NOT_EXECUTED'; }).length;
  var failed = plans.filter(function (p) { return p.executionStatus && p.executionStatus.indexOf('FAILED') >= 0; }).length;
  var rejected = plans.filter(function (p) { return p.status === 'rejected'; }).length;

  var pricePlansCreated = hist.filter(function (h) { return h.eventType === 'price_plan_created'; }).length;
  var priceBlocked = hist.filter(function (h) { return h.eventType === 'price_blocked'; }).length;
  var priceExecuted = hist.filter(function (h) { return h.eventType === 'price_executed_mock'; }).length;

  return [
    '📊 活动执行中心', '',
    '━━━━━━━━━━━━━━━━━━',
    '',
    '📋 报名计划',
    '  待审批: ' + pending,
    '  已审批: ' + approved,
    '  待执行: ' + readyExecute,
    '  已执行(MOCK): ' + executedMock,
    '  已拒绝: ' + rejected,
    '',
    '💰 调价计划',
    '  创建: ' + pricePlansCreated,
    '  阻断: ' + priceBlocked,
    '  执行(MOCK): ' + priceExecuted,
    '',
    '━━━━━━━━━━━━━━━━━━',
    '',
    '📜 审计历史: ' + hist.length + ' 条',
    '',
    '发送:',
    '/活动 执行历史 — 最近审计',
    '/活动 provider状态 — Provider 状态',
    '/活动 provider自检 — Dry Run'
  ].join('\n');
}

function historyList(limit) {
  limit = limit || 20;
  var hist = load('history.json');
  if (hist.length === 0) return '暂无执行历史。';

  var lines = ['📜 执行历史 (最近 ' + Math.min(limit, hist.length) + ' 条)', ''];
  hist.slice(0, limit).forEach(function (h, i) {
    var eType = h.eventType || 'unknown';
    var emoji = eType.indexOf('blocked') >= 0 || eType.indexOf('rejected') >= 0 ? '❌' : eType.indexOf('executed') >= 0 || eType.indexOf('approved') >= 0 ? '✅' : 'ℹ️';
    lines.push(emoji + ' ' + eType + ' | ' + (h.planId || h.pricePlanId || 'N/A') + ' | ' + (h.createdAt || '').substring(0, 19));
  });
  lines.push('', '审计文件: storage/activities/history.json');
  return lines.join('\n');
}

module.exports = { dashboard: dashboard, historyList: historyList };
