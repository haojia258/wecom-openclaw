'use strict';

/**
 * agent-task.js - /任务 命令处理器
 *
 * 格式: /任务 <agent> <内容>
 * agent: codex | workbuddy | deepseek | doubao
 */

const { dispatch, validateAgent, getSupportedAgents } = require('../orchestrator/v2/agent-dispatcher');
const { securityCheck } = require('../orchestrator/v2/commander-policy');

function formatResult(dispatchResult) {
  if (!dispatchResult.success) {
    return '任务创建失败:\n' + dispatchResult.error;
  }

  const result = dispatchResult.result;
  const lines = [
    '任务已创建',
    'Task ID: ' + dispatchResult.task_id,
    'Agent: ' + result.agent,
    '模式: ' + result.mode,
    '预计耗时: ' + result.estimated_time,
    '',
    '执行计划:',
    result.plan,
    ''
  ];

  if (result.security_warnings && result.security_warnings.length) {
    lines.push('安全提示:');
    result.security_warnings.forEach(function(w) { lines.push('  ⚠ ' + w); });
  }

  return lines.join('\n');
}

const desc = '创建 AI 任务 /任务 <agent> <内容>';

async function execute(ctx, args) {
  const trimmed = (args || '').trim();

  if (!trimmed) {
    return '错误: 任务内容不能为空\n\n格式: /任务 <agent> <内容>\nAgent: ' + getSupportedAgents().join(' | ');
  }

  // 解析 args: 第一个单词为 agent，其余为 content
  const spaceIdx = trimmed.indexOf(' ');
  let agent, content;

  if (spaceIdx === -1) {
    agent = trimmed;
    content = '';
  } else {
    agent = trimmed.slice(0, spaceIdx);
    content = trimmed.slice(spaceIdx + 1);
  }

  const agentCheck = validateAgent(agent);
  if (!agentCheck.valid) {
    return '错误: ' + agentCheck.reason + '\n\n支持的 Agent: ' + getSupportedAgents().join(', ');
  }

  if (!content || content.trim().length === 0) {
    return '错误: 任务内容不能为空\n\n格式: /任务 <agent> <内容>\nAgent: ' + getSupportedAgents().join(' | ');
  }

  const result = await dispatch({ agent: agent, content: content, command: '/任务', userId: ctx.fromUser });
  return formatResult(result);
}

module.exports = { execute: execute, desc: desc };
