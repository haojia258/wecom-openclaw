'use strict';

/**
 * mission-manager.js — Mission 配置管理器
 *
 * 加载 config/missions/*.mission.json 并管理任务生命周期。
 *
 * 安全约束：
 *   - REVIEW_ONLY 模式：不执行真实发布/投流/下单
 *   - real_publish_to_douyin 和 real_ads_launch 必须 CEO 审批
 *   - forbidden_without_approval 动作绝对禁止自动执行
 *   - 不修改 .env/nginx/Vault/密钥
 */

var fs = require('fs');
var path = require('path');
var crypto = require('crypto');

// ─── 配置路径 ──────────────────────────────────────────────

var MISSIONS_DIR = path.join(__dirname, '..', '..', '..', 'config', 'missions');

// ─── Mission 运行时状态 ────────────────────────────────────

var missionRuns = {};
var auditLog = [];

// ─── 配置加载 ──────────────────────────────────────────────

function loadMissionConfig(missionId) {
  try {
    var filePath = path.join(MISSIONS_DIR, missionId + '.mission.json');
    if (!fs.existsSync(filePath)) return null;
    var raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function listMissionConfigs() {
  try {
    if (!fs.existsSync(MISSIONS_DIR)) return [];
    return fs.readdirSync(MISSIONS_DIR)
      .filter(function (f) { return f.endsWith('.mission.json'); })
      .map(function (f) { return f.replace('.mission.json', ''); });
  } catch (e) {
    return [];
  }
}

// ─── 审计日志 ──────────────────────────────────────────────

function audit(event, details) {
  var entry = {
    event: event,
    details: details || {},
    timestamp: new Date().toISOString(),
    id: 'audit_' + Date.now().toString(36) + '_' + crypto.randomBytes(2).toString('hex')
  };
  auditLog.push(entry);
  return entry;
}

function getAuditLog(limit) {
  limit = limit || 50;
  return auditLog.slice(-limit).reverse();
}

// ─── Mission 生命周期 ──────────────────────────────────────

function createMissionRun(missionId) {
  var config = loadMissionConfig(missionId);
  if (!config) return { success: false, error: 'Mission 配置不存在: ' + missionId };

  if (!config.mission.enabled) {
    return { success: false, error: 'Mission 已禁用: ' + config.mission.name };
  }

  var runId = 'run_' + Date.now().toString(36) + '_' + crypto.randomBytes(2).toString('hex');
  var run = {
    run_id: runId,
    mission_id: missionId,
    mission_name: config.mission.name,
    status: 'created',
    review_mode: config.mission.review_mode || 'REVIEW_ONLY',
    dag_nodes: {},
    created_at: new Date().toISOString(),
    started_at: null,
    completed_at: null,
    outputs: null,
    approval_required: [],
  };

  // 初始化 DAG 节点状态
  if (config.dag && config.dag.nodes) {
    config.dag.nodes.forEach(function (node) {
      run.dag_nodes[node.id] = {
        id: node.id,
        name: node.name,
        agent: node.agent,
        type: node.type,
        status: 'pending',
        depends_on: node.depends_on || [],
      };
    });
  }

  missionRuns[runId] = run;
  audit('mission_created', { mission_id: missionId, run_id: runId, name: config.mission.name });
  return { success: true, run: run, config: config };
}

function getMissionRun(runId) {
  return missionRuns[runId] || null;
}

function getLatestRun(missionId) {
  var runs = Object.values(missionRuns)
    .filter(function (r) { return r.mission_id === missionId; })
    .sort(function (a, b) { return new Date(b.created_at) - new Date(a.created_at); });
  return runs[0] || null;
}

// ─── DAG 推进 ──────────────────────────────────────────────

var NODE_ORDER = {
  'read': 0, 'content_generation': 1, 'review': 2,
  'planning': 3, 'approval': 4, 'execution': 5,
  'observe': 6, 'analysis': 7, 'write': 8
};

function advanceNode(run, nodeId) {
  var node = run.dag_nodes[nodeId];
  if (!node) return { success: false, error: '未知节点: ' + nodeId };

  // 检查依赖
  var deps = node.depends_on || [];
  for (var i = 0; i < deps.length; i++) {
    var depNode = run.dag_nodes[deps[i]];
    if (!depNode || depNode.status !== 'completed') {
      return { success: false, error: '依赖未完成: ' + deps[i] };
    }
  }

  // 推进状态
  if (node.status === 'pending') node.status = 'running';
  else if (node.status === 'running') {
    node.status = 'completed';
    node.completed_at = new Date().toISOString();
  }

  audit('dag_node_' + node.status, { run_id: run.run_id, node_id: nodeId, node_name: node.name });

  return { success: true, node: node };
}

function runFullDAG(run, config) {
  var nodes = config.dag.nodes;
  var results = [];
  var approvalsRequired = [];

  for (var i = 0; i < nodes.length; i++) {
    var node = nodes[i];
    var nodeState = run.dag_nodes[node.id];

    // 跳过已完成节点
    if (nodeState.status === 'completed') {
      results.push({ node_id: node.id, status: 'skipped', reason: 'already_completed' });
      continue;
    }

    // 检查是否为审批节点
    if (node.type === 'approval') {
      nodeState.status = 'requires_approval';
      approvalsRequired.push({
        node_id: node.id,
        name: node.name,
        required_for: node.required_for || [],
      });
      run.approval_required = approvalsRequired;
      results.push({ node_id: node.id, status: 'requires_approval' });
      audit('approval_required', { node_id: node.id, node_name: node.name });
      continue;
    }

    // 模拟 DAG 执行（REVIEW_ONLY 模式）
    nodeState.status = 'running';
    results.push({ node_id: node.id, status: 'running' });
    nodeState.status = 'completed';
    nodeState.completed_at = new Date().toISOString();
    results.push({ node_id: node.id, status: 'completed' });
    audit('script_generated', { node_id: node.id, node_name: node.name });
  }

  // 检查最终状态
  var allCompleted = nodes.every(function (n) {
    return run.dag_nodes[n.id].status === 'completed' || run.dag_nodes[n.id].status === 'requires_approval';
  });

  if (allCompleted && approvalsRequired.length === 0) {
    run.status = 'completed';
    run.completed_at = new Date().toISOString();
  } else if (allCompleted && approvalsRequired.length > 0) {
    run.status = 'awaiting_approval';
  }

  return {
    success: true,
    results: results,
    approvals_required: approvalsRequired,
    run_status: run.status,
  };
}

// ─── 安全检查 ──────────────────────────────────────────────

function checkSafety(action, config) {
  var rules = config.approval_rules;

  // 1. 禁止项检查
  if (rules.forbidden_without_approval && rules.forbidden_without_approval.indexOf(action) !== -1) {
    return { allowed: false, reason: 'FORBIDDEN_WITHOUT_APPROVAL: ' + action, requiresApproval: true };
  }

  // 2. CEO 审批检查
  if (rules.ceo_approval_required && rules.ceo_approval_required.indexOf(action) !== -1) {
    return { allowed: false, reason: 'CEO_APPROVAL_REQUIRED: ' + action, requiresApproval: true, approvers: ['CEO'] };
  }

  // 3. 自动批准检查
  if (rules.auto_approve && rules.auto_approve.indexOf(action) !== -1) {
    return { allowed: true, reason: 'AUTO_APPROVE: ' + action, requiresApproval: false };
  }

  // 4. 默认：需要审批
  return { allowed: false, reason: 'DEFAULT_REQUIRES_APPROVAL: ' + action, requiresApproval: true };
}

// ─── 报告生成 ──────────────────────────────────────────────

function generateMissionStatus(markdown) {
  var missionId = markdown.mission_id || 'mission_doudian_suanlafen_daily_5_videos';
  var config = loadMissionConfig(missionId);
  if (!config) return '❌ Mission 配置不存在: ' + missionId;

  var run = getLatestRun(missionId);
  var lines = [];

  lines.push('# 🎬 ' + config.mission.name);
  lines.push('');
  lines.push('> 状态: ' + (run ? run.status : '未运行') + ' | 模式: ' + config.mission.review_mode);
  lines.push('> 域名: ' + config.mission.domain + ' | 负责人: ' + config.mission.owner_role);
  lines.push('');

  // DAG 进度
  if (run && run.dag_nodes) {
    lines.push('## 📊 DAG 进度');
    lines.push('');
    lines.push('| 节点 | Agent | 类型 | 状态 |');
    lines.push('|------|-------|------|------|');

    config.dag.nodes.forEach(function (node) {
      var state = run.dag_nodes[node.id];
      var status = state ? state.status : 'unknown';
      var icon = status === 'completed' ? '✅' : status === 'running' ? '🔄' :
                 status === 'requires_approval' ? '⏸️' : status === 'pending' ? '⏳' : '❓';
      lines.push('| ' + node.name + ' | ' + node.agent + ' | ' + node.type + ' | ' + icon + ' ' + status + ' |');
    });
    lines.push('');
  }

  // KPI 绑定
  if (config.kpi_bindings) {
    lines.push('## 📈 KPI 绑定');
    lines.push('');
    Object.keys(config.kpi_bindings).forEach(function (key) {
      var kpi = config.kpi_bindings[key];
      var target = kpi.target || kpi.target_gte || kpi.target_lte || 'N/A';
      lines.push('- **' + key + '**: 目标 ' + target);
    });
    lines.push('');
  }

  // 预算
  if (config.budget_bindings) {
    lines.push('## 💰 预算绑定');
    lines.push('');
    lines.push('> 月度总预算: ¥' + config.budget_bindings.monthly_total.toLocaleString());
    lines.push('');
    var budgetKeys = ['ads_budget', 'activity_budget', 'system_token_budget', 'reserve_budget'];
    budgetKeys.forEach(function (key) {
      var item = config.budget_bindings[key];
      if (item) {
        lines.push('- ' + key + ': ¥' + (item.amount || 0).toLocaleString() + ' (' + (item.owner_role || item.owner_roles || 'N/A') + ')');
      }
    });
    lines.push('');
  }

  // 审批规则摘要
  if (config.approval_rules) {
    lines.push('## 🔒 审批规则');
    lines.push('');
    lines.push('| 类别 | 数量 |');
    lines.push('|------|------|');
    lines.push('| 自动批准 | ' + (config.approval_rules.auto_approve || []).length + ' |');
    lines.push('| CEO审批 | ' + (config.approval_rules.ceo_approval_required || []).length + ' |');
    lines.push('| 禁止项 | ' + (config.approval_rules.forbidden_without_approval || []).length + ' |');
    lines.push('');
  }

  // 待审批
  if (run && run.approval_required && run.approval_required.length > 0) {
    lines.push('## ⏸️ 待审批项');
    lines.push('');
    run.approval_required.forEach(function (item) {
      lines.push('- **' + item.name + '**: ' + (item.required_for || []).join(', '));
    });
    lines.push('');
    lines.push('> ⚠️ 请在 /董事会 中审批');
    lines.push('');
  }

  lines.push('---');
  lines.push('> 🔒 REVIEW_ONLY — 不执行真实发布/投流/下单');
  lines.push('> 使用 /视频进度 查看实时状态');

  return lines.join('\n');
}

function generateVideoReport(markdown) {
  var missionId = markdown.mission_id || 'mission_doudian_suanlafen_daily_5_videos';
  var config = loadMissionConfig(missionId);
  if (!config) return '❌ Mission 配置不存在';

  var run = getLatestRun(missionId);
  var lines = [];

  lines.push('# 📊 酸辣粉视频复盘报告');
  lines.push('');

  // 配置摘要
  lines.push('## 🎬 视频配置');
  lines.push('');
  if (config.video_templates) {
    lines.push('| 模板 | 时长 | 卖点 |');
    lines.push('|------|------|------|');
    config.video_templates.forEach(function (t) {
      lines.push('| ' + t.name + ' | ' + t.duration_seconds + 's | ' + (t.selling_points || []).join('、') + ' |');
    });
    lines.push('');
  }

  // 发布策略
  if (config.publish_strategy && config.publish_strategy.slots) {
    lines.push('## 🕐 发布策略');
    lines.push('');
    config.publish_strategy.slots.forEach(function (slot) {
      lines.push(slot.index + '. ' + slot.time + ' — ' + slot.scene);
    });
    lines.push('');
  }

  // 本次运行摘要
  if (run) {
    lines.push('## 📊 本次运行');
    lines.push('');
    lines.push('| 指标 | 值 |');
    lines.push('|------|-----|');
    lines.push('| 运行 ID | `' + run.run_id + '` |');
    lines.push('| 状态 | ' + run.status + ' |');
    lines.push('| 创建时间 | ' + run.created_at + ' |');
    if (run.completed_at) {
      lines.push('| 完成时间 | ' + run.completed_at + ' |');
    }
    lines.push('');

    if (run.approval_required && run.approval_required.length > 0) {
      lines.push('## ⏸️ 待审批');
      lines.push('');
      run.approval_required.forEach(function (item) {
        lines.push('- ' + item.name + ': ' + (item.required_for || []).join(', '));
      });
      lines.push('');
    }
  }

  // KPI 建议
  lines.push('## 🎯 优化建议');
  lines.push('');
  lines.push('1. 爆款视频模板优先复用，低效模板暂停');
  lines.push('2. 投流 ROI < 1.8 时自动触发预算审查');
  lines.push('3. 22:00 夜宵窗口转化率较高，优先分配投流预算');
  lines.push('4. 花式吃法款点赞率优于其他模板，增加产出频率');
  lines.push('');

  lines.push('---');
  lines.push('> 🔒 REVIEW_ONLY — 所有真实发布/投流需 CEO 审批');

  return lines.join('\n');
}

// ─── 主入口 ────────────────────────────────────────────────

/**
 * 创建或运行 Mission
 * @param {string} missionId
 * @returns {object}
 */
function createOrRun(missionId) {
  var existing = getLatestRun(missionId);
  if (existing && (existing.status === 'created' || existing.status === 'running')) {
    return {
      success: true,
      run: existing,
      message: 'Mission 已在运行中: ' + existing.run_id,
    };
  }

  var result = createMissionRun(missionId);
  if (!result.success) return result;

  // 自动推进 DAG
  runFullDAG(result.run, result.config);

  return {
    success: true,
    run: result.run,
    config: result.config,
    message: (result.config.wecom_outputs && result.config.wecom_outputs.on_start) || '🎬 任务已启动',
  };
}

/**
 * 查询 Mission 状态
 */
function queryStatus(missionId) {
  return generateMissionStatus({ mission_id: missionId });
}

/**
 * 生成复盘报告
 */
function generateReport(missionId) {
  return generateVideoReport({ mission_id: missionId });
}

/**
 * 初始化 Scheduler 回调
 * 由 node-cron 调用，自动启动每日任务
 */
function schedulerCallback(missionId) {
  audit('scheduler_triggered', { mission_id: missionId });
  var result = createOrRun(missionId);
  return result;
}

module.exports = {
  // 配置加载
  loadMissionConfig: loadMissionConfig,
  listMissionConfigs: listMissionConfigs,

  // 生命周期
  createOrRun: createOrRun,
  queryStatus: queryStatus,
  generateReport: generateReport,
  getLatestRun: getLatestRun,

  // DAG
  runFullDAG: runFullDAG,
  advanceNode: advanceNode,

  // 安全
  checkSafety: checkSafety,

  // Scheduler
  schedulerCallback: schedulerCallback,

  // 审计
  audit: audit,
  getAuditLog: getAuditLog,

  // 内部导出（测试用）
  _createMissionRun: createMissionRun,
  _generateMissionStatus: generateMissionStatus,
  _generateVideoReport: generateVideoReport,
  MISSIONS_DIR: MISSIONS_DIR,
};
