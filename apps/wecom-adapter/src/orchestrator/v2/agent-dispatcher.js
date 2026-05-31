'use strict';

/**
 * agent-dispatcher.js - Agent 调度器 (v2)
 *
 * 将任务分发到对应 AI Agent
 * 支持: codex, workbuddy, deepseek, doubao
 * P6.1: codex + confirm:create-pr → 委托 codex-agent 创建真实 PR
 * P6.2: workbuddy + confirm:audit → 委托 workbuddy-agent 执行只读审计
 * P6.3: deepseek + confirm:review → 委托 deepseek-agent 执行 PR 审查
 * P6.4: 接入 progress-reporter 推送企微消息
 * P6.7.1: RBAC 权限检查 (confirm: 级)
 * P7.2.1: AI Runtime RBAC (Agent 运行时权限层，叠加于 WeCom RBAC 之上)
 */

const { securityCheck, sanitizeOutput, generateTaskId } = require('./commander-policy');
const { createTask, updateTask } = require('./task-store');
const reporter = require('../../wecom/progress-reporter');
const { STATES } = require('./task-state-machine');
const { canUseConfirm } = require('../../auth/rbac');
const { checkConfirmPermission, buildDenyMessage } = require('../../runtime/ai-runtime-rbac');

const SUPPORTED_AGENTS = ['codex', 'workbuddy', 'deepseek', 'doubao'];

const AGENT_RESPONSES = {
  codex: function(content) {
    return {
      plan: [
        '[Codex] 分析任务: "' + content + '"',
        '[Codex] 步骤1: 理解需求上下文',
        '[Codex] 步骤2: 检索相关代码库',
        '[Codex] 步骤3: 生成实现方案',
        '[Codex] 步骤4: 验证方案可行性',
        '[Codex] plan-only 模式: 仅提供计划，不执行代码变更'
      ].join('\n'),
      estimatedTime: '~5 分钟'
    };
  },
  workbuddy: function(content) {
    return {
      plan: [
        '[WorkBuddy] 接收任务: "' + content + '"',
        '[WorkBuddy] 白名单校验通过',
        '[WorkBuddy] 分析工作空间上下文',
        '[WorkBuddy] 生成执行计划',
        '[WorkBuddy] plan-only 模式: 仅输出计划，等待确认'
      ].join('\n'),
      estimatedTime: '~3 分钟'
    };
  },
  deepseek: function(content) {
    return {
      plan: [
        '[DeepSeek] 深度分析: "' + content + '"',
        '[DeepSeek] 检索相关知识库',
        '[DeepSeek] 多维度推演',
        '[DeepSeek] 生成策略报告',
        '[DeepSeek] plan-only 模式: 仅提供策略建议'
      ].join('\n'),
      estimatedTime: '~8 分钟'
    };
  },
  doubao: function(content) {
    return {
      plan: [
        '[Doubao] 内容创作任务: "' + content + '"',
        '[Doubao] 分析创作方向',
        '[Doubao] 生成内容大纲',
        '[Doubao] 内容生成排队中',
        '[Doubao] plan-only 模式: 返回创作计划'
      ].join('\n'),
      estimatedTime: '~10 分钟'
    };
  }
};

/**
 * 安全调用 progress-reporter，失败不影响主流程
 */
function safeReport(fn) {
  try { fn(); } catch (_) { /* 推送失败不影响任务 */ }
}

function validateAgent(agent) {
  if (!agent) {
    return { valid: false, reason: 'Agent 名称不能为空' };
  }

  if (SUPPORTED_AGENTS.indexOf(agent.toLowerCase()) === -1) {
    return {
      valid: false,
      reason: '不支持的 Agent: "' + agent + '"。支持: ' + SUPPORTED_AGENTS.join(', ')
    };
  }

  return { valid: true };
}

async function dispatch(params) {
  const agent = params.agent;
  const content = params.content;
  const command = params.command;
  const userId = params.userId || 'unknown';
  const normalizedAgent = agent.toLowerCase();

  const agentCheck = validateAgent(normalizedAgent);
  if (!agentCheck.valid) {
    return {
      success: false,
      error: agentCheck.reason,
      task_id: null,
      result: null
    };
  }

  const security = securityCheck({ agent: normalizedAgent, content: content, command: command });
  if (!security.passed) {
    return {
      success: false,
      error: '安全检查失败:\n' + security.violations.map(function(v) { return '- ' + v; }).join('\n'),
      task_id: null,
      result: null
    };
  }

  const taskId = generateTaskId();

  const task = createTask({
    taskId: taskId,
    type: 'agent_task',
    agent: normalizedAgent,
    content: content
  });

  // P6.4: 任务创建通知
  safeReport(function() { reporter.reportTaskCreated(task); });

  // P6.2: workbuddy + confirm:audit → 委托 workbuddy-agent (真实只读审计)
  if (normalizedAgent === 'workbuddy' && content.indexOf('confirm:audit') !== -1) {
    // P6.7.1: WeCom RBAC 检查 — confirm:audit 需要 operator+
    var auditRbac = canUseConfirm(userId, 'confirm:audit');
    if (!auditRbac.allowed) {
      return { success: false, error: auditRbac.error, task_id: null, result: null };
    }

    // P7.2.1: AI Runtime RBAC 检查 — workbuddy 运行时权限
    var auditRuntimeRbac = checkConfirmPermission('workbuddy', 'confirm:audit');
    if (!auditRuntimeRbac.allowed) {
      updateTask(taskId, { status: STATES.FAILED, result: JSON.stringify({ reason: auditRuntimeRbac.reason }) });
      return {
        success: false,
        error: buildDenyMessage(auditRuntimeRbac, taskId),
        task_id: taskId,
        result: null
      };
    }

    // P6.6.2: PENDING → PLANNING → RUNNING
    updateTask(taskId, { status: STATES.PLANNING });
    updateTask(taskId, { status: STATES.RUNNING });

    var auditTask = Object.assign({}, task, { status: STATES.RUNNING, updated_at: new Date().toISOString() });
    safeReport(function() { reporter.reportStatusChange(auditTask, STATES.PENDING); });

    var auditResult = await workbuddyExecute(content, taskId, command);

    // P6.4: 根据结果报告
    if (auditResult.success) {
      safeReport(function() { reporter.reportTaskCompleted(Object.assign({}, task, { status: STATES.COMPLETED, updated_at: new Date().toISOString(), agent: 'workbuddy' })); });
    } else {
      safeReport(function() { reporter.reportTaskFailed(Object.assign({}, task, { status: STATES.FAILED, updated_at: new Date().toISOString(), agent: 'workbuddy' }), auditResult.error || 'unknown'); });
    }
    return auditResult;
  }

  // P6.1: codex + confirm:create-pr → 委托 codex-agent (真实 PR 创建)
  if (normalizedAgent === 'codex' && content.indexOf('confirm:create-pr') !== -1) {
    // P6.7.1: WeCom RBAC 检查 — confirm:create-pr 需要 admin
    var codexRbac = canUseConfirm(userId, 'confirm:create-pr');
    if (!codexRbac.allowed) {
      return { success: false, error: codexRbac.error, task_id: null, result: null };
    }

    // P7.2.1: AI Runtime RBAC 检查 — codex 运行时权限
    var codexRuntimeRbac = checkConfirmPermission('codex', 'confirm:create-pr');
    if (!codexRuntimeRbac.allowed) {
      updateTask(taskId, { status: STATES.FAILED, result: JSON.stringify({ reason: codexRuntimeRbac.reason }) });
      return {
        success: false,
        error: buildDenyMessage(codexRuntimeRbac, taskId),
        task_id: taskId,
        result: null
      };
    }

    // P6.6.2: PENDING → PLANNING → RUNNING
    updateTask(taskId, { status: STATES.PLANNING });
    updateTask(taskId, { status: STATES.RUNNING });

    var codexTask = Object.assign({}, task, { status: STATES.RUNNING, updated_at: new Date().toISOString() });
    safeReport(function() { reporter.reportStatusChange(codexTask, STATES.PENDING); });

    var codexResult = await codexExecute(content, taskId, command);

    if (codexResult.success) {
      safeReport(function() { reporter.reportTaskCompleted(Object.assign({}, task, { status: STATES.COMPLETED, updated_at: new Date().toISOString(), agent: 'codex' })); });
    } else {
      safeReport(function() { reporter.reportTaskFailed(Object.assign({}, task, { status: STATES.FAILED, updated_at: new Date().toISOString(), agent: 'codex' }), codexResult.error || 'unknown'); });
    }
    return codexResult;
  }

  // P6.3: deepseek + confirm:review → 委托 deepseek-agent (真实 PR 审查)
  if (normalizedAgent === 'deepseek' && content.indexOf('confirm:review') !== -1) {
    // P6.7.1: WeCom RBAC 检查 — confirm:review 需要 operator+
    var deepseekRbac = canUseConfirm(userId, 'confirm:review');
    if (!deepseekRbac.allowed) {
      return { success: false, error: deepseekRbac.error, task_id: null, result: null };
    }

    // P7.2.1: AI Runtime RBAC 检查 — deepseek 运行时权限
    var deepseekRuntimeRbac = checkConfirmPermission('deepseek', 'confirm:review');
    if (!deepseekRuntimeRbac.allowed) {
      updateTask(taskId, { status: STATES.FAILED, result: JSON.stringify({ reason: deepseekRuntimeRbac.reason }) });
      return {
        success: false,
        error: buildDenyMessage(deepseekRuntimeRbac, taskId),
        task_id: taskId,
        result: null
      };
    }

    // P6.6.2: PENDING → PLANNING → RUNNING
    updateTask(taskId, { status: STATES.PLANNING });
    updateTask(taskId, { status: STATES.RUNNING });

    var deepseekTask = Object.assign({}, task, { status: STATES.RUNNING, updated_at: new Date().toISOString() });
    safeReport(function() { reporter.reportStatusChange(deepseekTask, STATES.PENDING); });

    var deepseekResult = await deepseekExecute(content, taskId, command);

    if (deepseekResult.success) {
      safeReport(function() { reporter.reportTaskCompleted(Object.assign({}, task, { status: STATES.COMPLETED, updated_at: new Date().toISOString(), agent: 'deepseek' })); });
    } else {
      safeReport(function() { reporter.reportTaskFailed(Object.assign({}, task, { status: STATES.FAILED, updated_at: new Date().toISOString(), agent: 'deepseek' }), deepseekResult.error || 'unknown'); });
    }
    return deepseekResult;
  }

  // P6.6.2: PENDING → PLANNING → RUNNING
  updateTask(taskId, { status: STATES.PLANNING });
  updateTask(taskId, { status: STATES.RUNNING });
  var inProgressTask = Object.assign({}, task, { status: STATES.RUNNING, updated_at: new Date().toISOString() });

  // P6.4: 状态变更通知
  safeReport(function() { reporter.reportStatusChange(inProgressTask, STATES.PENDING); });

  const responseFn = AGENT_RESPONSES[normalizedAgent];
  const mockResponse = responseFn ? responseFn(content) : {
    plan: '[' + normalizedAgent + '] 任务已接收: "' + content + '"',
    estimatedTime: '未知'
  };

  const sanitizedPlan = sanitizeOutput(mockResponse.plan);

  const result = {
    task_id: taskId,
    agent: normalizedAgent,
    plan: sanitizedPlan,
    estimated_time: mockResponse.estimatedTime,
    mode: 'plan-only',
    security_warnings: security.warnings,
    timestamp: new Date().toISOString()
  };

  updateTask(taskId, {
    status: STATES.COMPLETED,
    result: JSON.stringify(result)
  });

  var completedTask = Object.assign({}, task, {
    status: STATES.COMPLETED,
    updated_at: new Date().toISOString(),
    result: JSON.stringify(result)
  });

  // P6.4: 任务完成通知
  safeReport(function() { reporter.reportTaskCompleted(completedTask); });

  return {
    success: true,
    task_id: taskId,
    result: result
  };
}

// ─── P6.1-P6.3 agent execute wrappers (内联避免重复延迟加载) ───

async function codexExecute(content, taskId, command) {
  try {
    const codexAgent = require('../../agents/codex-agent');
    return await codexAgent.execute({ content: content, taskId: taskId, command: command });
  } catch (e) {
    return { success: false, error: e.message };
  }
}

async function workbuddyExecute(content, taskId, command) {
  try {
    const workbuddyAgent = require('../../agents/workbuddy-agent');
    return await workbuddyAgent.execute({ content: content, taskId: taskId, command: command });
  } catch (e) {
    return { success: false, error: e.message };
  }
}

async function deepseekExecute(content, taskId, command) {
  try {
    const deepseekAgent = require('../../agents/deepseek-agent');
    return await deepseekAgent.execute({ content: content, taskId: taskId, command: command });
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function getSupportedAgents() {
  return SUPPORTED_AGENTS.slice();
}

function getAgentStatus(agent) {
  const normalizedAgent = agent.toLowerCase();
  if (SUPPORTED_AGENTS.indexOf(normalizedAgent) === -1) {
    return { agent: agent, available: false, reason: '不支持的 Agent' };
  }
  if (normalizedAgent === 'workbuddy') {
    return {
      agent: normalizedAgent,
      available: true,
      mode: 'plan-only + audit (confirm:audit)',
      model: 'workbuddy-agent'
    };
  }
  return {
    agent: normalizedAgent,
    available: true,
    mode: 'plan-only',
    model: AGENT_RESPONSES[normalizedAgent] ? 'mock' : 'unknown'
  };
}

module.exports = {
  dispatch: dispatch,
  validateAgent: validateAgent,
  getSupportedAgents: getSupportedAgents,
  getAgentStatus: getAgentStatus
};
