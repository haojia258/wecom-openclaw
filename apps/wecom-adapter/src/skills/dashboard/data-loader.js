'use strict';

/**
 * data-loader.js — Dashboard 数据加载器
 *
 * 从现有模块聚合所有 Dashboard 所需数据。
 * 所有模块延迟加载，缺失时优雅降级。
 *
 * 安全约束：
 *   - 只读（不调用 create/update/write 方法）
 *   - 不修改 .env/nginx/Vault
 *   - 不触发真实业务写操作
 */

// ─── 延迟加载辅助 ──────────────────────────────────────────

function safeRequire(modulePath) {
  try {
    return require(modulePath);
  } catch (_) {
    return null;
  }
}

function safeGet(mod, method) {
  if (!mod || typeof mod[method] !== 'function') return null;
  try {
    var result = mod[method]();
    return result && result.success !== false ? result : null;
  } catch (_) {
    return null;
  }
}

function safeGetWithParam(mod, method, param) {
  if (!mod || typeof mod[method] !== 'function') return null;
  try {
    var result = mod[method](param);
    return result && result.success !== false ? result : null;
  } catch (_) {
    return null;
  }
}

// ─── 模块加载 ──────────────────────────────────────────────

var _modules = {};

function getModule(name, relativePath) {
  if (_modules[name] === undefined) {
    _modules[name] = safeRequire(relativePath);
  }
  return _modules[name];
}

// ─── 公共 API ──────────────────────────────────────────────

/**
 * 加载所有 Dashboard 数据
 * @returns {object} 聚合数据
 */
function loadDashboardData() {
  return {
    kpi: loadKpiData(),
    mission: loadMissionData(),
    loop: loadLoopData(),
    board: loadBoardData(),
    strategy: loadStrategyData(),
    approval: loadApprovalData(),
    agent: loadAgentData(),
    budget: loadBudgetData(),
    organization: loadOrganizationData(),
    // 模拟业务数据（兜底）
    commerce: getCommerceSnapshot(),
  };
}

// ─── KPI 数据 ──────────────────────────────────────────────

function loadKpiData() {
  var mod = getModule('kpi', '../../kpi-engine/kpi-store');
  var targets = safeGet(mod, 'listTargets');
  var alerts = safeGet(mod, 'scanAlerts');

  var items = [];
  if (targets && targets.targets) {
    items = targets.targets;
  }

  var gmv = 0, profit = 0, roi = 0, refundRate = 0;
  items.forEach(function (t) {
    if (t.type === 'gmv') gmv = t.target || 0;
    if (t.type === 'profit') profit = t.target || 0;
    if (t.type === 'roi') roi = t.target || 0;
    if (t.type === 'refund_rate') refundRate = t.target || 0;
  });

  // 如果模块无数据，使用 mock
  if (items.length === 0) {
    gmv = 48200;
    profit = 12300;
    roi = 2.35;
    refundRate = 4.2;
  }

  return {
    gmv: gmv,
    profit: profit,
    roi: roi,
    refundRate: refundRate,
    targets: items,
    alerts: alerts ? alerts.alerts || [] : [],
  };
}

// ─── Mission 数据 ──────────────────────────────────────────

function loadMissionData() {
  var gen = getModule('mission-gen', '../../mission-generator/mission-generator');
  var missions = safeGet(gen, 'listMissions');

  var list = [];
  if (missions && missions.missions) {
    list = missions.missions;
  }

  var created = list.length;
  var success = list.filter(function (m) { return m.status === 'completed'; }).length;
  var failed = list.filter(function (m) { return m.status === 'failed'; }).length;
  var running = list.filter(function (m) { return m.status === 'running' || m.status === 'created'; }).length;
  var blocked = list.filter(function (m) { return m.status === 'blocked'; }).length;

  if (created === 0) {
    created = 8;
    success = 6;
    failed = 1;
    running = 1;
    blocked = 0;
  }

  var successRate = created > 0 ? Math.round((success / created) * 100) : 0;

  return {
    created: created,
    success: success,
    failed: failed,
    running: running,
    blocked: blocked,
    successRate: successRate,
    list: list.slice(0, 5),
  };
}

// ─── Company Loop 数据 ─────────────────────────────────────

function loadLoopData() {
  var mod = getModule('loop', '../../company-loop/company-loop-engine');

  var loops = {};
  var dailyStats = { loops: 0, missions: 0 };

  if (mod) {
    // 尝试读取内部状态
    try {
      var status = mod.getLoopStatus ? mod.getLoopStatus() : null;
      if (status) {
        loops = status;
      }
    } catch (_) {}
  }

  var phases = ['Observe', 'Analyze', 'Strategy', 'Board', 'Execute', 'Learn'];
  var phaseStatus = {};
  phases.forEach(function (p) {
    var key = p.toLowerCase();
    phaseStatus[key] = { status: 'completed', time: null };
  });

  return {
    phases: phaseStatus,
    daily: {
      loops: dailyStats.loops || 1,
      missions: dailyStats.missions || 5,
      maxLoops: 1,
      maxMissions: 5,
    },
    status: 'idle',
  };
}

// ─── Board 数据 ────────────────────────────────────────────

function loadBoardData() {
  var mod = getModule('board', '../../executive-board/board-store');
  var reviews = safeGet(mod, 'listReviews');
  var report = safeGet(mod, 'generateReport');

  var members = ['CEO Agent', 'COO Agent', 'CTO Agent', 'CMO Agent', 'CFO Agent'];
  var votes = {};
  members.forEach(function (m) { votes[m] = 'Approve'; });

  var total = 0, inReview = 0, completed = 0;
  if (reviews && reviews.reviews) {
    total = reviews.total || reviews.reviews.length;
    inReview = reviews.reviews.filter(function (r) { return r.status === 'in_review'; }).length;
    completed = reviews.reviews.filter(function (r) { return r.status === 'completed'; }).length;
  }

  if (total === 0) {
    total = 5;
    inReview = 0;
    completed = 5;
  }

  return {
    members: members,
    votes: votes,
    reviews: {
      total: total,
      in_review: inReview,
      completed: completed,
    },
  };
}

// ─── Strategy 数据 ─────────────────────────────────────────

function loadStrategyData() {
  var mod = getModule('strategy', '../../strategy/strategy-engine');
  var report = safeGet(mod, 'getReport');

  var strategies = [];
  if (report && report.strategies) {
    strategies = report.strategies;
  }

  if (strategies.length === 0) {
    strategies = [
      { id: 's1', type: 'growth', text: '提升主力款曝光', status: 'active' },
      { id: 's2', type: 'efficiency', text: '优先参加高利润活动', status: 'active' },
      { id: 's3', type: 'risk_reduction', text: '控制低 ROI 投流', status: 'active' },
    ];
  }

  return {
    strategies: strategies,
    total: strategies.length,
    active: strategies.filter(function (s) { return s.status === 'active'; }).length,
  };
}

// ─── Approval 数据 ─────────────────────────────────────────

function loadApprovalData() {
  var mod = getModule('approval', '../../approval-center/approval-store');
  var report = safeGet(mod, 'generateReport');
  var pending = safeGet(mod, 'getPending');

  var total = 0, approved = 0, rejected = 0, pendingCount = 0;
  if (report && report.report) {
    total = report.report.total || 0;
    approved = report.report.approved || 0;
    rejected = report.report.rejected || 0;
    pendingCount = report.report.pending || 0;
  }

  if (pending && pending.requests) {
    pendingCount = pending.total || pending.requests.length;
  }

  if (total === 0) {
    total = 3;
    approved = 2;
    rejected = 0;
    pendingCount = 1;
  }

  return {
    total: total,
    approved: approved,
    rejected: rejected,
    pending: pendingCount,
  };
}

// ─── Agent 数据 ────────────────────────────────────────────

function loadAgentData() {
  var mod = getModule('agent', '../../agent-bus/agent-bus-store');

  var agents = [];
  if (mod && typeof mod.listAgents === 'function') {
    try {
      var result = mod.listAgents();
      if (result && result.agents) agents = result.agents;
    } catch (_) {}
  }

  if (agents.length === 0) {
    agents = [
      { name: 'WorkBuddy', agent_type: 'workbuddy', status: 'online' },
      { name: 'Codex', agent_type: 'codex', status: 'online' },
      { name: 'DeepSeek', agent_type: 'deepseek', status: 'online' },
      { name: 'Doubao', agent_type: 'doubao', status: 'online' },
    ];
  }

  var online = agents.filter(function (a) { return a.status === 'online'; }).length;
  var offline = agents.filter(function (a) { return a.status === 'offline'; }).length;
  var degraded = agents.filter(function (a) { return a.status === 'degraded'; }).length;

  return {
    agents: agents,
    online: online,
    offline: offline,
    degraded: degraded,
    total: agents.length,
  };
}

// ─── Budget 数据 ───────────────────────────────────────────

function loadBudgetData() {
  var mod = getModule('budget', '../../budget-engine/budget-store');
  var report = safeGet(mod, 'generateReport');

  var totalLimit = 0, totalUsed = 0, overBudget = 0;
  if (report && report.report) {
    totalLimit = report.report.total_limit || 0;
    totalUsed = report.report.total_used || 0;
    overBudget = report.report.over_budget || 0;
  }

  if (totalLimit === 0) {
    totalLimit = 50000;
    totalUsed = 18500;
  }

  return {
    totalLimit: totalLimit,
    totalUsed: totalUsed,
    remaining: totalLimit - totalUsed,
    overBudget: overBudget,
    usageRate: totalLimit > 0 ? Math.round((totalUsed / totalLimit) * 100) : 0,
  };
}

// ─── Organization 数据 ─────────────────────────────────────

function loadOrganizationData() {
  var mod = getModule('organization', '../../organization/organization-store');
  var roles = safeGet(mod, 'getRoles');
  var orgGraph = safeGet(mod, 'getOrgGraph');

  var roleList = [];
  if (roles && roles.roles) {
    roleList = roles.roles;
  }

  if (roleList.length === 0) {
    roleList = [
      { role: 'CEO', level: 1, domains: ['all'] },
      { role: 'COO', level: 2, domains: ['commerce', 'customer'] },
      { role: 'CTO', level: 2, domains: ['devops'] },
      { role: 'CMO', level: 2, domains: ['marketing', 'commerce'] },
      { role: 'CFO', level: 2, domains: ['all'] },
    ];
  }

  return {
    roles: roleList,
    graph: orgGraph ? orgGraph.graph || null : null,
  };
}

// ─── Commerce 快照（模拟业务数据） ─────────────────────────

function getCommerceSnapshot() {
  return {
    gmv: 48200,
    profit: 12300,
    roi: 2.35,
    refundRate: 4.2,
    inventoryRisk: 2,
    campaignGain: 3200,
    sku: {
      '6桶': { profit: 5200, stock: '正常', price: 168 },
      '12桶': { profit: 4800, stock: '低', price: 298 },
      '18桶': { profit: 2300, stock: '正常', price: 428 },
    },
    topCampaigns: [
      { name: '618大促', gain: 2100 },
      { name: '节盟计划', gain: 1100 },
    ],
    adRoi: 2.85,
    adSuggestion: '观察',
    lowStockSkus: ['12桶'],
    restockSuggestion: '12桶库存偏低，建议补货 50 件',
  };
}

// ─── 导出 ──────────────────────────────────────────────────

module.exports = {
  loadDashboardData: loadDashboardData,
  // 细粒度加载（供测试用）
  _loadKpiData: loadKpiData,
  _loadMissionData: loadMissionData,
  _loadLoopData: loadLoopData,
  _loadBoardData: loadBoardData,
  _loadStrategyData: loadStrategyData,
  _loadApprovalData: loadApprovalData,
  _loadAgentData: loadAgentData,
  _loadBudgetData: loadBudgetData,
  _loadOrganizationData: loadOrganizationData,
  _getCommerceSnapshot: getCommerceSnapshot,
};
