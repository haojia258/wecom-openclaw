'use strict';

/**
 * commander-command.js - /总控 命令处理器 (P7.3 Commander Runtime v1)
 *
 * 格式:
 *   /总控 <目标描述>              → 统一总控规划
 *   /总控 列表                    → 列出所有支持的目标
 *   /总控 状态                    → Commander Runtime 状态
 *   /总控 能力                    → Agent 能力矩阵 (含 RBAC)
 *
 * 支持命令:
 *   /总控 提升GMV到5万
 *   /总控 降低退款率
 *   /总控 提高ROI
 *   /总控 优化企业微信稳定性
 *
 * 约束:
 *   - 不调用 agent-dispatcher.execute()
 *   - 不自动 confirm
 *   - 不自动执行任何命令
 *   - plan-only
 *
 * 基于分支: feature/commander-runtime-v1 → develop
 */

var commanderRuntime = require('../orchestrator/v2/commander-runtime');
var { validateGoal, listGoals } = require('../orchestrator/v2/agent-queue-builder');

var desc = '统一总控层 /总控 <目标描述>  |  /总控 列表|状态|能力';

// ─── 子命令: /总控 列表 ─────────────────────────────────────

async function handleList() {
  var goals = listGoals();
  var lines = [
    '\uD83C\uDFAF Commander Runtime — 支持的目标类型',
    '\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501',
    '',
  ];

  for (var i = 0; i < goals.length; i++) {
    lines.push((i + 1) + '. ' + goals[i].label);
    lines.push('   ' + goals[i].description);
  }

  lines.push('');
  lines.push('用法: /总控 <目标名称>');
  lines.push('示例:');
  lines.push('  /总控 提升GMV');
  lines.push('  /总控 提高ROI');
  lines.push('  /总控 降低退款率');
  lines.push('  /总控 优化企业微信稳定性');
  lines.push('');
  lines.push('其他命令:');
  lines.push('  /总控 状态  \u2014 Commander Runtime 状态');
  lines.push('  /总控 能力  \u2014 Agent 能力矩阵 (含 Runtime RBAC)');
  return lines.join('\n');
}

// ─── 子命令: /总控 状态 ─────────────────────────────────────

async function handleStatus() {
  var status = commanderRuntime.getCommanderStatus();
  var capabilityMatrix = commanderRuntime.getAgentCapabilityMatrix();

  var lines = [
    '\uD83D\uDCCA Commander Runtime 状态',
    '\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501',
    'Agent:     ' + status.agent,
    '模式:      ' + status.mode,
    '版本:      ' + status.version,
    '可用目标:  ' + (status.goals || []).join(', '),
    '',
    '功能:',
  ];

  for (var i = 0; i < status.features.length; i++) {
    lines.push('  \u2713 ' + status.features[i]);
  }

  lines.push('');
  lines.push('约束:');

  for (var j = 0; j < status.constraints.length; j++) {
    lines.push('  \u26D4 ' + status.constraints[j]);
  }

  lines.push('');
  lines.push('Agent 能力矩阵 (Runtime RBAC):');

  for (var k = 0; k < capabilityMatrix.length; k++) {
    var c = capabilityMatrix[k];
    lines.push('  ' + (c.icon || '') + ' ' + c.agent + ': ' + c.role);

    var testCmds = Object.keys(c.rbacTests);
    for (var t = 0; t < testCmds.length; t++) {
      var cmd = testCmds[t];
      var result = c.rbacTests[cmd];
      var icon = result.startsWith('DENY') ? '\u274C' : '\u2705';
      lines.push('    ' + icon + ' ' + cmd + ' \u2192 ' + result);
    }
  }

  return lines.join('\n');
}

// ─── 子命令: /总控 能力 ─────────────────────────────────────

async function handleCapabilities() {
  var matrix = commanderRuntime.getAgentCapabilityMatrix();

  var lines = [
    '\uD83D\uDEE1 Commander Runtime — Agent 能力矩阵',
    '\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501',
    '',
  ];

  for (var i = 0; i < matrix.length; i++) {
    var agent = matrix[i];
    lines.push(agent.icon + ' ' + agent.agent);
    lines.push('  角色: ' + agent.role);
    lines.push('  RBAC 权限矩阵:');

    var cmds = Object.keys(agent.rbacTests);
    for (var j = 0; j < cmds.length; j++) {
      var cmd = cmds[j];
      var result = agent.rbacTests[cmd];
      var icon = result.startsWith('DENY') ? '\u274C' : '\u2705';
      lines.push('    ' + icon + ' ' + cmd + ' \u2192 ' + result);
    }
    lines.push('');
  }

  lines.push('\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501');
  lines.push('\u2139\uFE0F 注: "ALLOW" 表示该 Agent 有此命令权限, "DENY" 表示被 RBAC 拒绝');

  return lines.join('\n');
}

// ─── 主入口: /总控 <目标> ───────────────────────────────────

/**
 * 处理 /总控 <目标>
 */
async function handleGoal(goal) {
  if (!goal || goal === '') {
    return [
      '\u26A0 错误: 目标不能为空',
      '',
      '用法: /总控 <目标名称>',
      '',
      '示例:',
      '/总控 提升GMV',
      '/总控 提高ROI',
      '/总控 降低退款率',
      '/总控 优化企业微信稳定性',
      '/总控 提升GMV到5万',
      '',
      '使用 /总控 列表 查看所有支持的目标。',
    ].join('\n');
  }

  // 执行 Commander Runtime
  var result = await commanderRuntime.execute({ goal: goal });

  if (!result.success) {
    return result.output;
  }

  return result.output;
}

// ─── 统一入口 ───────────────────────────────────────────────

/**
 * 处理 /总控 命令
 *
 * @param {object} ctx   - 上下文 (user, corpId 等)
 * @param {string} args  - 用户输入参数
 * @returns {Promise<string>}
 */
async function execute(ctx, args) {
  var input = (args || '').trim();

  // 无参数 → 帮助
  if (!input) {
    return [
      '[Commander Runtime]',
      '',
      'P7.3 Commander Runtime v1 — 统一总控层',
      '',
      '支持的目标:',
      '\u2022 提升GMV (含 "到5万" 等金额后缀)',
      '\u2022 提高ROI',
      '\u2022 降低退款率',
      '\u2022 优化企业微信稳定性',
      '',
      '子命令:',
      '/总控 列表    \u2014 查看所有支持的目标',
      '/总控 状态    \u2014 Commander Runtime 状态',
      '/总控 能力    \u2014 Agent 能力矩阵',
      '',
      '示例:',
      '/总控 提升GMV到5万',
      '/总控 降低退款率',
    ].join('\n');
  }

  // ─── 子命令路由 ───
  if (input === '列表' || input === 'list') {
    return handleList();
  }

  if (input === '状态' || input === 'status') {
    return handleStatus();
  }

  if (input === '能力' || input === 'capabilities' || input === 'cap') {
    return handleCapabilities();
  }

  // ─── 支持带金额/数值后缀的目标 ───
  // "提升GMV到5万" → 提取核心目标 "提升GMV"
  var coreGoal = _normalizeGoal(input);

  // ─── 执行 Commander Runtime ───
  return handleGoal(coreGoal);
}

// ─── 辅助: 目标标准化 ──────────────────────────────────────

/**
 * 将用户输入标准化为核心目标名
 * 支持: "提升GMV到5万" → "提升GMV"
 *       "提升gmv" → "提升GMV"
 *
 * @param {string} input
 * @returns {string}
 */
function _normalizeGoal(input) {
  if (!input) return input;

  // 规范化映射表
  var normalizeMap = {
    '提升gmv':    '提升GMV',
    '提高roi':    '提高ROI',
    '降低退款率':  '降低退款率',
    '优化企业微信稳定性': '优化企业微信稳定性',
    // P8.5.1 — Controlled Execution Goal Pack
    'staging health check':       'staging health check',
    'staging 健康检查':            'staging 健康检查',
    '灰度健康检查':                '灰度健康检查',
    'npm test dry-run':           'npm test dry-run',
    '测试 dry-run':               '测试 dry-run',
    '运行测试计划':                '运行测试计划',
    '运行时审计':                  '运行时审计',
    'staging 审计':               'staging 审计',
    'pm2 状态检查':               'pm2 状态检查',
    'gateway 验证':               'gateway 验证',
    '网关验证':                    '网关验证',
    'agent host 到 gateway 验证':  'agent host 到 gateway 验证',
  };

  var lower = input.toLowerCase().trim();

  // 1. 精确匹配映射表
  if (normalizeMap[lower]) {
    return normalizeMap[lower];
  }

  // 2. 前缀匹配: "提升GMV到5万" → 提取已知目标前缀
  var prefixes = ['提升gmv', '提高roi', '降低退款率', '优化企业微信稳定性'];
  for (var i = 0; i < prefixes.length; i++) {
    if (lower.startsWith(prefixes[i])) {
      // 尝试直接验证核心目标
      var check = validateGoal(prefixes[i]);
      if (check.valid) {
        return normalizeMap[prefixes[i]] || prefixes[i];
      }
    }
  }

  // 3. P8.5.1: Staging 关键词匹配（必须在业务目标模糊匹配之前）
  if (lower.indexOf('staging') !== -1 || lower.indexOf('灰度') !== -1) {
    if (lower.indexOf('health') !== -1 || lower.indexOf('健康') !== -1) {
      return 'staging health check';
    }
    if (lower.indexOf('npm') !== -1 || lower.indexOf('test') !== -1 || lower.indexOf('测试') !== -1 || lower.indexOf('dry') !== -1) {
      return 'npm test dry-run';
    }
    if (lower.indexOf('审计') !== -1 || lower.indexOf('audit') !== -1) {
      return '运行时审计';
    }
    if (lower.indexOf('gateway') !== -1 || lower.indexOf('网关') !== -1) {
      return 'gateway 验证';
    }
    // 默认: staging 健康检查
    return 'staging health check';
  }
  if ((lower.indexOf('npm test') !== -1 || lower.indexOf('测试 dry') !== -1) && (lower.indexOf('dry') !== -1 || lower.indexOf('运行') !== -1)) {
    return 'npm test dry-run';
  }
  if (lower.indexOf('运行时审计') !== -1 || (lower.indexOf('pm2') !== -1 && lower.indexOf('状态') !== -1)) {
    return '运行时审计';
  }
  if (lower.indexOf('gateway') !== -1 && lower.indexOf('验证') !== -1) {
    return 'gateway 验证';
  }
  if (lower.indexOf('agent host') !== -1) {
    if (lower.indexOf('gateway') !== -1 || lower.indexOf('验证') !== -1) {
      return 'gateway 验证';
    }
  }

  // 4. 模糊包含匹配
  if (lower.indexOf('gmv') !== -1 || lower.indexOf('提升') !== -1 && lower.indexOf('gm') !== -1) {
    return '提升GMV';
  }
  if (lower.indexOf('roi') !== -1) {
    return '提高ROI';
  }
  if (lower.indexOf('退款') !== -1 || lower.indexOf('退货') !== -1) {
    return '降低退款率';
  }
  if (lower.indexOf('企业微信') !== -1 || lower.indexOf('wecom') !== -1) {
    return '优化企业微信稳定性';
  }

  // 5. 回退：直接尝试验证原始输入
  var directCheck = validateGoal(input);
  if (directCheck.valid) {
    return input;
  }

  // 6. 保持原样，交给 commanderRuntime.execute 做最终验证
  return input;
}

module.exports = { execute: execute, desc: desc };
