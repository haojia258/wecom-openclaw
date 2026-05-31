'use strict';

/**
 * goal-manager.js — P14.2 Goal Manager
 *
 * 经营管理目标。
 * 管理 GMV/利润/ROI/增长/视频 目标，跟踪进度，
 * 与 P14.1 Decision Engine 联动生成目标驱动决策。
 *
 * REVIEW_ONLY — 目标设置供决策参考，不自动执行。
 */

var fs = require('fs');
var path = require('path');
var crypto = require('crypto');

var GOALS_PATH = path.join(__dirname, '..', '..', '..', 'storage', 'goals', 'goals.json');

// ─── 默认目标 ──────────────────────────────────────────────

var DEFAULT_GOALS = [
  { id: 'goal-gmv',      type: 'gmv',     name: 'GMV 目标',    target: 80000,  current: 48000, unit: '元/月',   priority: 'high',   deadline: '', enabled: true },
  { id: 'goal-profit',   type: 'profit',  name: '利润目标',     target: 24000,  current: 14400, unit: '元/月',   priority: 'high',   deadline: '', enabled: true },
  { id: 'goal-roi',      type: 'roi',     name: 'ROI 目标',     target: 2.5,    current: 2.2,   unit: '',         priority: 'high',   deadline: '', enabled: true },
  { id: 'goal-refund',   type: 'refund',  name: '退款率控制',   target: 0.03,   current: 0.03,  unit: '',         priority: 'normal', deadline: '', enabled: true },
  { id: 'goal-video',    type: 'video',   name: '视频日产量',   target: 5,      current: 5,     unit: '条/天',    priority: 'normal', deadline: '', enabled: true },
  { id: 'goal-mission',  type: 'mission', name: '任务成功率',   target: 0.95,   current: 0.92,  unit: '',         priority: 'normal', deadline: '', enabled: true },
  { id: 'goal-growth',   type: 'growth',  name: '月增长率',     target: 0.15,   current: 0.08,  unit: '',         priority: 'normal', deadline: '', enabled: true },
];

// ─── 加载/保存 ─────────────────────────────────────────────

function load() {
  try {
    if (fs.existsSync(GOALS_PATH)) {
      return JSON.parse(fs.readFileSync(GOALS_PATH, 'utf-8'));
    }
  } catch (_) {}
  return JSON.parse(JSON.stringify(DEFAULT_GOALS));
}

function save(goals) {
  var dir = path.dirname(GOALS_PATH);
  try { fs.mkdirSync(dir, { recursive: true }); } catch (_) {}
  fs.writeFileSync(GOALS_PATH, JSON.stringify(goals, null, 2), 'utf-8');
}

// ─── CRUD ──────────────────────────────────────────────────

function getAll() {
  return load();
}

function getById(id) {
  return load().find(function (g) { return g.id === id; }) || null;
}

function getByType(type) {
  return load().filter(function (g) { return g.type === type; });
}

function setGoal(id, updates) {
  var goals = load();
  var idx = goals.findIndex(function (g) { return g.id === id; });
  if (idx === -1) {
    var newGoal = JSON.parse(JSON.stringify(updates));
    newGoal.id = id;
    if (!newGoal.current) newGoal.current = 0;
    if (!newGoal.unit) newGoal.unit = '';
    if (!newGoal.priority) newGoal.priority = 'normal';
    newGoal.enabled = true;
    goals.push(newGoal);
  } else {
    Object.keys(updates).forEach(function (k) {
      if (updates[k] !== undefined) goals[idx][k] = updates[k];
    });
  }
  save(goals);
  return getById(id);
}

function updateProgress(id, currentValue) {
  var goals = load();
  var goal = goals.find(function (g) { return g.id === id; });
  if (!goal) return null;
  goal.current = currentValue;
  save(goals);
  return goal;
}

// ─── 进度分析 ──────────────────────────────────────────────

/**
 * 获取所有目标的进度报告
 * @returns {object} { goals[], summary }
 */
function getProgress() {
  var goals = load().filter(function (g) { return g.enabled; });
  var totalCompletion = 0;
  var counts = 0;

  var items = goals.map(function (g) {
    var rate = g.target > 0 ? g.current / g.target : 0;
    var status = rate >= 1.0 ? 'exceeded' : rate >= 0.8 ? 'on_track' : rate >= 0.5 ? 'at_risk' : 'behind';
    totalCompletion += Math.min(1, rate);
    counts++;
    return {
      id: g.id,
      name: g.name,
      type: g.type,
      target: g.target,
      current: g.current,
      unit: g.unit,
      completion: rate,
      status: status,
      priority: g.priority,
    };
  });

  // 按完成率升序（最差的排前面）
  items.sort(function (a, b) { return a.completion - b.completion; });

  return {
    goals: items,
    summary: {
      total: items.length,
      onTrack: items.filter(function (i) { return i.status === 'on_track' || i.status === 'exceeded'; }).length,
      atRisk: items.filter(function (i) { return i.status === 'at_risk'; }).length,
      behind: items.filter(function (i) { return i.status === 'behind'; }).length,
      exceeded: items.filter(function (i) { return i.status === 'exceeded'; }).length,
      avgCompletion: counts > 0 ? (totalCompletion / counts * 100).toFixed(1) : 0,
    },
  };
}

/**
 * 目标驱动的决策建议
 * 与 P14.1 Decision Engine 联动
 */
function getGoalDrivenDecisions() {
  var progress = getProgress();
  var decisions = [];

  progress.goals.forEach(function (g) {
    if (g.status === 'behind') {
      decisions.push({
        goalId: g.id,
        goalName: g.name,
        action: 'accelerate_' + g.type,
        priority: 'high',
        reason: g.name + ' 仅完成 ' + (g.completion * 100).toFixed(1) + '% (' + g.current + '/' + g.target + g.unit + ')，需紧急推进',
        suggestion: _getSuggestion(g),
      });
    } else if (g.status === 'at_risk') {
      decisions.push({
        goalId: g.id,
        goalName: g.name,
        action: 'monitor_' + g.type,
        priority: 'normal',
        reason: g.name + ' 完成 ' + (g.completion * 100).toFixed(1) + '% (' + g.current + '/' + g.target + g.unit + ')，需持续关注',
        suggestion: _getSuggestion(g),
      });
    }
  });

  return {
    drivers: decisions,
    summary: decisions.length + ' 项目标需要关注',
    generatedAt: new Date().toISOString(),
  };
}

function _getSuggestion(g) {
  switch (g.type) {
    case 'gmv': return '建议增加投流预算并扩展视频模板';
    case 'profit': return '建议优化成本结构，审查投放ROI';
    case 'roi': return '建议暂停低效计划，测试新素材';
    case 'refund': return '建议检查产品质量与售后流程';
    case 'video': return '建议增加视频产出到每日 8 条';
    case 'mission': return '建议审查失败任务，优化 Agent 配置';
    case 'growth': return '建议加大活动力度，测试新渠道';
    default: return '建议关注该指标并制定改善方案';
  }
}

// ─── 重置 ──────────────────────────────────────────────────

function resetToDefaults() {
  save(JSON.parse(JSON.stringify(DEFAULT_GOALS)));
  return getAll();
}

// ─── 导出 ──────────────────────────────────────────────────

module.exports = {
  GOALS_PATH: GOALS_PATH,
  DEFAULT_GOALS: DEFAULT_GOALS,
  getAll: getAll,
  getById: getById,
  getByType: getByType,
  setGoal: setGoal,
  updateProgress: updateProgress,
  getProgress: getProgress,
  getGoalDrivenDecisions: getGoalDrivenDecisions,
  resetToDefaults: resetToDefaults,
};
