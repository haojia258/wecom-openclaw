'use strict';

/**
 * DAG Executor Plan — DAG 并行调度计划格式化
 *
 * 将 DAG Scheduler 的输出格式化为人类可读的执行计划。
 * 纯 plan-only：不执行任何 Agent，不调用 dispatch。
 */

var AGENT_ICONS = {
  codex: '\u{1F4BB}',
  workbuddy: '\u{1F527}',
  deepseek: '\u{1F9E0}',
  doubao: '\u270D\uFE0F',
};

var PRIORITY_ICONS = {
  1: '\u{1F534}',
  2: '\u{1F7E0}',
  3: '\u{1F7E1}',
  4: '\u{1F7E2}',
  5: '\u{1F535}',
};

var AGENT_ROLE = {
  codex: '代码生成 & PR 创建',
  workbuddy: '只读审计 & 系统状态检查',
  deepseek: '只读审查 & 风险分析',
  doubao: '内容生成 & 文案撰写',
};

/**
 * 获取执行级别信息
 * @param {object[][]} stages - topologicalSort 返回的 stages
 * @returns {{ level: number, nodes: object[], type: string, nodeCount: number }[]}
 */
function getExecutionLevels(stages) {
  var levels = [];
  for (var i = 0; i < stages.length; i++) {
    var stage = stages[i];
    var type = stage.length > 1 ? 'parallel' : 'sequential';
    levels.push({
      level: i + 1,
      nodes: stage,
      type: type,
      nodeCount: stage.length,
    });
  }
  return levels;
}

/**
 * 格式化单个 DAG 节点
 * @param {DAGNode} node
 * @returns {string}
 */
function formatNode(node) {
  var icon = AGENT_ICONS[node.agent] || '\u{2753}';
  var pIcon = PRIORITY_ICONS[node.priority] || '\u{26AB}';
  return pIcon + ' ' + icon + ' ' + node.agent + ' [' + node.command + ']';
}

/**
 * 格式化 DAG 执行计划（简洁版，适合 WeCom 消息）
 * @param {object} scheduleResult - schedule() 返回值
 * @param {{ blockedNodes?: string[], totalBlocked?: number }} [rbacInfo] - applyRBAC 返回值
 * @returns {string}
 */
function formatDAGPlan(scheduleResult, rbacInfo) {
  var lines = [];
  var levels = getExecutionLevels(scheduleResult.stages);

  lines.push('DAG Execution Plan');
  lines.push('==================');
  lines.push('');

  for (var i = 0; i < levels.length; i++) {
    var level = levels[i];
    var stageLabel = 'Stage ' + level.level;

    if (level.type === 'parallel') {
      stageLabel += ': [parallel] (' + level.nodeCount + ' agents)';
    } else {
      stageLabel += ': [sequential]';
    }

    if (i > 0) {
      stageLabel += ' — depends on Stage ' + i;
    }

    lines.push(stageLabel);

    for (var j = 0; j < level.nodes.length; j++) {
      var node = level.nodes[j];
      var nodeLine = '  ' + (node.blocked ? '\u{274C} ' : '\u{25C9} ') + node.agent;
      nodeLine += ' \u2192 ' + node.command;
      nodeLine += ' [P' + node.priority + ']';
      if (node.blocked) {
        nodeLine += ' — BLOCKED: ' + (node.blockReason || 'unknown');
      }
      lines.push(nodeLine);
    }

    lines.push('');
  }

  // 统计信息
  lines.push('---');
  lines.push('Total Stages: ' + scheduleResult.totalStages);
  lines.push('Total Nodes: ' + scheduleResult.totalNodes);
  lines.push('Max Parallelism: ' + getMaxParallelism(levels));

  // Blocked 信息
  if (rbacInfo && rbacInfo.totalBlocked > 0) {
    lines.push('');
    lines.push('\u{26A0}\u{FE0F} Blocked Nodes: ' + rbacInfo.totalBlocked + ' (original denied: ' + (rbacInfo.originalDenied || 0) + ')');
    if (rbacInfo.blockedNodes && rbacInfo.blockedNodes.length > 0) {
      for (var k = 0; k < Math.min(rbacInfo.blockedNodes.length, 5); k++) {
        lines.push('  \u{274C} ' + rbacInfo.blockedNodes[k]);
      }
      if (rbacInfo.blockedNodes.length > 5) {
        lines.push('  ... and ' + (rbacInfo.blockedNodes.length - 5) + ' more');
      }
    }
  }

  return lines.join('\n');
}

/**
 * 获取最大并行度
 * @param {object[]} levels
 * @returns {number}
 */
function getMaxParallelism(levels) {
  var max = 0;
  for (var i = 0; i < levels.length; i++) {
    if (levels[i].nodeCount > max) {
      max = levels[i].nodeCount;
    }
  }
  return max;
}

/**
 * 格式化 DAG 执行计划（详细版，含依赖关系）
 * @param {object} scheduleResult - schedule() 返回值
 * @param {{ blockedNodes?: string[], totalBlocked?: number }} [rbacInfo]
 * @returns {string}
 */
function formatDAGPlanDetailed(scheduleResult, rbacInfo) {
  var lines = [];
  var dag = scheduleResult.dag;
  var levels = getExecutionLevels(scheduleResult.stages);

  lines.push('DAG Execution Plan (Detailed)');
  lines.push('=============================');
  lines.push('');

  // 依赖图概览
  lines.push('Dependency Graph:');
  if (dag && dag.edges && dag.edges.length > 0) {
    for (var e = 0; e < dag.edges.length; e++) {
      var edge = dag.edges[e];
      lines.push('  ' + edge.from + ' \u2192 ' + edge.to);
    }
  } else {
    lines.push('  (no dependencies — all nodes independent)');
  }
  lines.push('');

  // 阶段详情
  for (var i = 0; i < levels.length; i++) {
    var level = levels[i];
    var stageLabel = 'Stage ' + level.level + ': ';
    stageLabel += level.type === 'parallel' ? '[PARALLEL]' : '[SEQUENTIAL]';

    lines.push(stageLabel);
    lines.push('-'.repeat(40));

    for (var j = 0; j < level.nodes.length; j++) {
      var node = level.nodes[j];
      var icon = AGENT_ICONS[node.agent] || '?';
      var statusIcon = node.blocked ? '\u{274C}' : '\u{2705}';

      lines.push('  ' + statusIcon + ' ' + icon + ' ' + node.agent);
      lines.push('     Command: ' + node.command);
      lines.push('     Priority: P' + node.priority);
      lines.push('     Reason: ' + node.reason);
      if (node.dependsOn && node.dependsOn.length > 0) {
        lines.push('     Depends On: [' + node.dependsOn.join(', ') + ']');
      }
      if (node.blocked) {
        lines.push('     BLOCKED: ' + (node.blockReason || 'reason unknown'));
      }
      lines.push('');
    }
  }

  // Footer
  lines.push('---');
  lines.push('Total: ' + scheduleResult.totalStages + ' stages, ' + scheduleResult.totalNodes + ' nodes');

  // Blocked summary
  if (rbacInfo && rbacInfo.totalBlocked > 0) {
    lines.push('Blocked: ' + rbacInfo.totalBlocked + ' nodes (RBAC deny + downstream propagation)');
  }

  lines.push('');
  lines.push('\u{26A0}\u{FE0F} This is a DAG Runtime Plan only. No agents will be executed.');
  lines.push('Human confirmation required for each stage.');

  return lines.join('\n');
}

/**
 * 格式化被跳过（blocked）节点的报告
 * @param {string[]} blockedNodeIds
 * @returns {string}
 */
function formatBlockedReport(blockedNodeIds) {
  if (!blockedNodeIds || blockedNodeIds.length === 0) {
    return '';
  }
  var lines = [];
  lines.push('Blocked Nodes Report');
  lines.push('====================');
  for (var i = 0; i < blockedNodeIds.length; i++) {
    lines.push('  \u{274C} ' + blockedNodeIds[i]);
  }
  lines.push('');
  lines.push('These nodes are blocked due to Runtime RBAC deny or downstream propagation.');
  lines.push('They are excluded from the DAG Execution Plan.');
  return lines.join('\n');
}

module.exports = {
  formatDAGPlan: formatDAGPlan,
  formatDAGPlanDetailed: formatDAGPlanDetailed,
  formatBlockedReport: formatBlockedReport,
  getExecutionLevels: getExecutionLevels,
  formatNode: formatNode,
  AGENT_ICONS: AGENT_ICONS,
  PRIORITY_ICONS: PRIORITY_ICONS,
};
