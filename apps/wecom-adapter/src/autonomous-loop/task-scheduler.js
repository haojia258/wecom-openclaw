'use strict';

// P17 Task Scheduler — generates daily tasks with Agent assignment
var agentRegistry;
try { agentRegistry = require('../agent-runtime/agent-capability-registry'); } catch (e) {}

var taskGraph;
try { taskGraph = require('../agent-runtime/task-graph'); } catch (e) {}

var DAILY_TASK_TEMPLATES = [
  { title: '每日GMV统计', type: 'analysis', role: 'analysis', suggestedAgent: 'deepseek', priority: 1 },
  { title: '订单数据分析', type: 'analysis', role: 'analysis', suggestedAgent: 'deepseek', priority: 1 },
  { title: '利润核算', type: 'analysis', role: 'analysis', suggestedAgent: 'deepseek', priority: 1 },
  { title: '退款/售后风险检查', type: 'risk', role: 'risk', suggestedAgent: 'deepseek', priority: 2 },
  { title: '库存预警检查', type: 'validation', role: 'validation', suggestedAgent: 'workbuddy', priority: 2 },
  { title: '投流ROI分析', type: 'roi', role: 'analysis', suggestedAgent: 'deepseek', priority: 2 },
  { title: 'CTR趋势分析', type: 'analysis', role: 'analysis', suggestedAgent: 'deepseek', priority: 3 },
  { title: '转化率优化建议', type: 'strategy', role: 'analysis', suggestedAgent: 'deepseek', priority: 3 },
  { title: '素材更新检查', type: 'artifact', role: 'develop', suggestedAgent: 'node-a', priority: 3 },
  { title: '视频计划生成', type: 'video', role: 'develop', suggestedAgent: 'codex', priority: 3 },
  { title: '脚本优化建议', type: 'development', role: 'develop', suggestedAgent: 'codex', priority: 4 },
  { title: '营销预算建议', type: 'analysis', role: 'analysis', suggestedAgent: 'deepseek', priority: 4 },
  { title: '活动收益分析', type: 'analysis', role: 'analysis', suggestedAgent: 'deepseek', priority: 4 },
  { title: '系统健康检查', type: 'smoke_test', role: 'validation', suggestedAgent: 'node-a', priority: 5 },
  { title: '每日审计报告', type: 'audit', role: 'audit', suggestedAgent: 'workbuddy', priority: 5 }
];

/**
 * Generate daily task schedule
 */
function generateDailySchedule(date, collectData) {
  var tasks = [];
  var graphId = null;

  // Try to create Task Graph if available
  if (taskGraph) {
    try {
      var g = taskGraph.createGraph({ title: 'Daily Loop ' + date, owner: 'autonomous-loop', goal: 'daily_operations' });
      graphId = g.id;
    } catch (e) {}
  }

  // Generate tasks from templates, filtered by priority
  DAILY_TASK_TEMPLATES.forEach(function (tpl, i) {
    var task = {
      taskId: 'daily-' + date + '-' + (i + 1),
      title: tpl.title,
      type: tpl.type,
      role: tpl.role,
      priority: tpl.priority,
      agent: assignAgent(tpl),
      status: 'pending',
      reviewRequired: true,
      reviewOnly: true,
      requiresHumanApproval: true,
      data: collectData || {},
      createdAt: new Date().toISOString()
    };

    // Attach to Task Graph if available
    if (taskGraph && graphId) {
      try {
        taskGraph.addTask(graphId, {
          taskId: task.taskId,
          title: task.title,
          status: 'pending',
          reviewRequired: true,
          dependsOn: [],
          artifacts: []
        });
      } catch (e) {}
    }

    tasks.push(task);
  });

  return {
    date: date,
    taskCount: tasks.length,
    graphId: graphId,
    tasks: tasks,
    reviewOnly: true
  };
}

/**
 * Assign Agent to a task template
 */
function assignAgent(tpl) {
  // Try Agent Registry first
  if (agentRegistry) {
    try {
      var best = agentRegistry.selectBestAgent({ type: tpl.type, title: tpl.title });
      if (best) return { agentId: typeof best === "string" ? best : best.agentId, method: "registry" };
    } catch (e) {}
  }

  // Fallback to template suggestion
  if (tpl.suggestedAgent) return { agentId: tpl.suggestedAgent, method: 'template' };

  // Default routing
  var routing = { analysis: 'deepseek', risk: 'deepseek', roi: 'deepseek', strategy: 'deepseek',
    video: 'codex', development: 'codex', patch: 'codex',
    validation: 'workbuddy', audit: 'workbuddy', execution_review: 'workbuddy',
    artifact: 'node-a', smoke_test: 'node-a', readonly_check: 'node-a' };
  return { agentId: routing[tpl.type] || 'workbuddy', method: 'default' };
}

/**
 * Summarize agent assignments
 */
function summarizeAssignments(tasks) {
  var summary = {};
  tasks.forEach(function (t) {
    var aid = t.agent ? t.agent.agentId : 'unknown';
    summary[aid] = (summary[aid] || 0) + 1;
  });
  return summary;
}

module.exports = {
  generateDailySchedule: generateDailySchedule,
  assignAgent: assignAgent,
  summarizeAssignments: summarizeAssignments,
  DAILY_TASK_TEMPLATES: DAILY_TASK_TEMPLATES
};
