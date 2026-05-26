'use strict';

/**
 * chatgpt-bridge.js - ChatGPT 指令桥接处理器 (P8.0)
 *
 * 让 ChatGPT 指令直接进入 OpenClaw Commander Runtime。
 * 完整执行链:
 *
 *   1. WeCom RBAC          → canAccessCommand()
 *   2. AI Runtime RBAC     → checkAgentAction()
 *   3. Commander Runtime   → commanderRuntime.execute()
 *   4. DAG Scheduler       → dagScheduler.schedule()（Commander 内已集成）
 *   5. Controlled Exec     → controlled-executor（live 模式）
 *
 * 安全:
 *   - 默认 plan-only
 *   - live execution 必须 humanConfirmToken
 *   - 禁止绕过任何权限系统
 *   - 所有结果可回企业微信
 *
 * 基于分支: feature/chatgpt-bridge-v1 → develop
 */

var commanderCommand = require('./commander-command');
var { canAccessCommand } = require('../auth/rbac');
var { checkAgentAction } = require('../runtime/ai-runtime-rbac');
var { checkCommand } = require('../runtime/execution-policy');
var { controlledExecute } = require('../runtime/controlled-executor');
var { generateBridgeTaskId, createBridgeTask, updateBridgeTask, buildRBACContext, appendBridgeAudit } = require('../runtime/external-task-api');

var desc = 'ChatGPT Bridge — /bridge <command> 将外部指令导入 Commander Runtime';

// ─── 常量 ─────────────────────────────────────────────────

var SUPPORTED_COMMANDS = [
  '/总控', '/commander', '/总控台',
  '/目标', '/goal',
  '/状态', '/status',
  '/进度', '/progress',
  '/审计', '/审计'
];

var MAX_OUTPUT_LENGTH = 1800;

// ─── 安全: 命令白名单 ────────────────────────────────────

/**
 * 检查命令是否在 Bridge 白名单中
 * （额外的第一层过滤，在 RBAC 之前）
 *
 * @param {string} command
 * @returns {boolean}
 */
function isBridgeAllowed(command) {
  if (!command) return false;

  var trimmed = command.trim();
  for (var i = 0; i < SUPPORTED_COMMANDS.length; i++) {
    if (trimmed === SUPPORTED_COMMANDS[i] || trimmed.startsWith(SUPPORTED_COMMANDS[i] + ' ')) {
      return true;
    }
  }
  return false;
}

// ─── 步骤 1: WeCom RBAC ──────────────────────────────────

/**
 * 执行 WeCom RBAC 检查
 *
 * @param {string} userId
 * @param {string} cmdName - 命令名（如 '/总控'）
 * @returns {{ allowed: boolean, error?: string }}
 */
function checkWeComRBAC(userId, cmdName) {
  var result = canAccessCommand(userId, cmdName);

  appendBridgeAudit({
    event: 'wecom_rbac_check',
    userId: userId,
    command: cmdName,
    allowed: result.allowed,
    error: result.error || '',
    timestamp: new Date().toISOString()
  });

  return result;
}

// ─── 步骤 2: AI Runtime RBAC ─────────────────────────────

/**
 * 执行 AI Runtime RBAC 检查
 * 针对命令类型映射到对应的 Agent action
 *
 * @param {string} command - 原始命令
 * @returns {{ allowed: boolean, agent?: string, action?: string, reason?: string }}
 */
function checkAIRuntimeRBAC(command) {
  // 根据命令类型确定 Agent 和 action
  var agentAction = mapCommandToAgentAction(command);

  if (!agentAction) {
    return {
      allowed: true, // 不涉及 AI Agent 的命令直接放行
      reason: 'no-agent-action'
    };
  }

  var result = checkAgentAction(agentAction.agent, agentAction.action);

  appendBridgeAudit({
    event: 'ai_runtime_rbac_check',
    agent: agentAction.agent,
    action: agentAction.action,
    allowed: result.allowed,
    reason: result.reason || '',
    timestamp: new Date().toISOString()
  });

  return {
    allowed: result.allowed,
    agent: agentAction.agent,
    action: agentAction.action,
    reason: result.reason || ''
  };
}

/**
 * 根据命令类型映射到 Agent + action
 *
 * @param {string} command
 * @returns {{ agent: string, action: string }|null}
 */
function mapCommandToAgentAction(command) {
  var trimmed = (command || '').trim();

  // /总控 → workbuddy + readonly-audit
  if (trimmed.startsWith('/总控') || trimmed.startsWith('/commander') || trimmed.startsWith('/总控台')) {
    return { agent: 'workbuddy', action: 'readonly-audit' };
  }

  // /目标 → workbuddy + readonly-audit
  if (trimmed.startsWith('/目标') || trimmed.startsWith('/goal')) {
    return { agent: 'workbuddy', action: 'readonly-audit' };
  }

  // /状态, /进度 → workbuddy + readonly-audit
  if (trimmed.startsWith('/状态') || trimmed.startsWith('/status') ||
      trimmed.startsWith('/进度') || trimmed.startsWith('/progress')) {
    return { agent: 'workbuddy', action: 'readonly-audit' };
  }

  return null;
}

// ─── 步骤 3+4: Commander Runtime + DAG Scheduler ─────────

/**
 * 执行 Commander Runtime（通过 commander-command 入口，内部已集成 DAG Scheduler）
 * 使用 commander-command.execute() 处理所有子命令路由（列表/状态/能力/目标）
 *
 * @param {object} ctx     - WeCom 上下文
 * @param {string} args    - 命令参数
 * @returns {Promise<object>}
 */
async function executeCommander(ctx, args) {
  var output = await commanderCommand.execute(ctx, args);

  appendBridgeAudit({
    event: 'commander_executed',
    args: args,
    success: true,
    mode: 'plan-only',
    timestamp: new Date().toISOString()
  });

  return {
    success: true,
    output: output
  };
}

// ─── 步骤 5: Controlled Execution Policy ─────────────────

/**
 * 执行受控执行策略检查
 * （仅在 live 模式下执行）
 *
 * @param {object} params
 * @param {string} params.command   - 原始命令
 * @param {string} params.mode      - plan-only / live
 * @param {string} params.humanConfirmToken
 * @param {string} params.user
 * @returns {Promise<object>}
 */
async function executeControlled(params) {
  if (params.mode !== 'live') {
    // plan-only 模式：
    // WeCom 命令（以 / 开头）不经过 shell 执行策略检查
    // 因为 /总控 等命令是内部 orchestrator 命令，不是 shell 命令
    var isWeComCommand = (params.command || '').trim().startsWith('/');

    if (isWeComCommand) {
      appendBridgeAudit({
        event: 'controlled_exec_skip_wecom',
        command: params.command,
        mode: 'plan-only',
        reason: 'WeCom command, not shell execution',
        timestamp: new Date().toISOString()
      });

      return {
        success: true,
        checked: true,
        dryRun: true,
        allowed: true,
        category: 'wecom-command',
        reason: 'WeCom 命令无需 shell 执行策略检查'
      };
    }

    // 非 WeCom 命令：做命令合法性检查
    var cmdCheck = checkCommand(params.command);

    appendBridgeAudit({
      event: 'controlled_exec_check',
      command: params.command,
      mode: 'plan-only',
      allowed: cmdCheck.allowed,
      category: cmdCheck.category || '',
      timestamp: new Date().toISOString()
    });

    return {
      success: true,
      checked: true,
      dryRun: true,
      allowed: cmdCheck.allowed,
      category: cmdCheck.category,
      reason: cmdCheck.reason
    };
  }

  // live 模式：完整受控执行
  var execResult = await controlledExecute({
    command: params.command,
    agentName: 'workbuddy',
    humanConfirmToken: params.humanConfirmToken,
    userId: params.user,
    source: 'chatgpt-bridge',
    mode: 'live'
  });

  appendBridgeAudit({
    event: 'controlled_exec_live',
    command: params.command,
    mode: 'live',
    success: execResult.success,
    step: execResult.step || '',
    timestamp: new Date().toISOString()
  });

  return execResult;
}

// ─── 命令解析 ────────────────────────────────────────────

/**
 * 从原始命令中提取目标文本
 * 例如: "/总控 提升GMV到5万" → "提升GMV"
 *       "/总控 状态" → "状态"
 *
 * @param {string} command
 * @returns {{ cmdName: string, args: string }}
 */
function parseCommand(command) {
  var trimmed = (command || '').trim();

  // 匹配 /总控台（必须在 /总控 之前，因为 /总控台 以 /总控 开头）
  if (trimmed.startsWith('/总控台')) {
    return { cmdName: '/总控台', args: trimmed.slice('/总控台'.length).trim() };
  }

  // 匹配 /总控, /commander
  if (trimmed.startsWith('/总控')) {
    return { cmdName: '/总控', args: trimmed.slice('/总控'.length).trim() };
  }
  if (trimmed.startsWith('/commander')) {
    return { cmdName: '/commander', args: trimmed.slice('/commander'.length).trim() };
  }

  // 匹配 /目标, /goal
  if (trimmed.startsWith('/目标')) {
    return { cmdName: '/目标', args: trimmed.slice('/目标'.length).trim() };
  }
  if (trimmed.startsWith('/goal')) {
    return { cmdName: '/goal', args: trimmed.slice('/goal'.length).trim() };
  }

  // 匹配 /状态, /status, /进度, /progress
  if (trimmed.startsWith('/状态')) {
    return { cmdName: '/状态', args: trimmed.slice('/状态'.length).trim() };
  }
  if (trimmed.startsWith('/status')) {
    return { cmdName: '/status', args: trimmed.slice('/status'.length).trim() };
  }
  if (trimmed.startsWith('/进度')) {
    return { cmdName: '/进度', args: trimmed.slice('/进度'.length).trim() };
  }
  if (trimmed.startsWith('/progress')) {
    return { cmdName: '/progress', args: trimmed.slice('/progress'.length).trim() };
  }

  return { cmdName: trimmed, args: '' };
}

// ─── 核心执行 ────────────────────────────────────────────

/**
 * ChatGPT Bridge 主执行入口
 *
 * 执行流程:
 *   1. 命令白名单检查
 *   2. WeCom RBAC 检查
 *   3. AI Runtime RBAC 检查
 *   4. Commander Runtime 执行（内含 DAG Scheduler）
 *   5. Controlled Execution Policy 检查
 *   6. 结果汇总
 *
 * @param {object} params
 * @param {string} params.source           - 来源 (chatgpt)
 * @param {string} params.user             - ChatGPT 用户标识
 * @param {string} params.command          - 原始命令
 * @param {string} params.mode             - plan-only / live
 * @param {boolean} params.confirm         - 是否已 confirm
 * @param {string} params.humanConfirmToken - live 模式确认 token
 * @param {object} params.context          - 额外上下文
 * @param {string} params.wecomUserId      - 企微用户 ID
 * @param {string} params.agentId          - 企微应用 ID
 * @returns {Promise<object>} { success, taskId, mode, output, steps }
 */
async function execute(params) {
  params = params || {};
  var taskId = generateBridgeTaskId();
  var steps = [];

  // ─── 0. 创建任务 ───
  try {
    createBridgeTask({
      taskId: taskId,
      user: params.user,
      command: params.command,
      mode: params.mode,
      source: params.source
    });
  } catch (e) {
    // 任务创建失败不阻塞流程
    console.error('[BRIDGE] createBridgeTask failed:', e.message);
  }

  steps.push({ step: 0, name: 'task_created', taskId: taskId, status: 'ok' });

  // ─── 1. 命令白名单检查 ───
  if (!isBridgeAllowed(params.command)) {
    var blockedMsg = '[BRIDGE] 命令不在白名单中: ' + params.command +
      '\n\n当前支持的命令:\n  /总控 <目标>\n  /总控 列表|状态|能力\n  /目标\n  /状态\n  /进度';

    steps.push({ step: 1, name: 'bridge_whitelist', status: 'denied' });

    updateBridgeTask(taskId, { status: 'BLOCKED', error: 'NOT_IN_WHITELIST' });

    return {
      success: false,
      taskId: taskId,
      mode: params.mode,
      output: blockedMsg,
      error: 'NOT_IN_WHITELIST',
      steps: steps
    };
  }
  steps.push({ step: 1, name: 'bridge_whitelist', status: 'ok' });

  // ─── 2. 解析命令 ───
  var parsed = parseCommand(params.command);
  steps.push({ step: 2, name: 'parse_command', cmdName: parsed.cmdName, args: parsed.args });

  // ─── 3. WeCom RBAC ───
  var rbacCtx = buildRBACContext(params.wecomUserId || params.user, parsed.cmdName);
  var rbacResult = checkWeComRBAC(rbacCtx.userId, parsed.cmdName);

  if (!rbacResult.allowed) {
    updateBridgeTask(taskId, { status: 'BLOCKED', error: 'RBAC_DENIED' });

    steps.push({ step: 3, name: 'wecom_rbac', status: 'denied', reason: rbacResult.error });

    return {
      success: false,
      taskId: taskId,
      mode: params.mode,
      output: rbacResult.error || '[RBAC] 权限不足',
      error: 'RBAC_DENIED',
      steps: steps
    };
  }
  steps.push({ step: 3, name: 'wecom_rbac', status: 'ok' });

  // ─── 4. AI Runtime RBAC ───
  var aiRbacResult = checkAIRuntimeRBAC(params.command);

  if (!aiRbacResult.allowed) {
    updateBridgeTask(taskId, { status: 'BLOCKED', error: 'AI_RBAC_DENIED' });

    steps.push({ step: 4, name: 'ai_runtime_rbac', status: 'denied', reason: aiRbacResult.reason });

    return {
      success: false,
      taskId: taskId,
      mode: params.mode,
      output: aiRbacResult.reason || '[AI-RBAC] AI Runtime RBAC 拒绝',
      error: 'AI_RBAC_DENIED',
      steps: steps
    };
  }
  steps.push({ step: 4, name: 'ai_runtime_rbac', status: aiRbacResult.reason || 'ok' });

  // ─── 5. Controlled Execution Policy 检查 ───
  var controlledResult;
  try {
    controlledResult = await executeControlled({
      command: params.command,
      mode: params.mode,
      humanConfirmToken: params.humanConfirmToken,
      user: params.user
    });

    if (!controlledResult.success || (controlledResult.allowed === false)) {
      steps.push({ step: 5, name: 'controlled_exec', status: 'denied', reason: controlledResult.reason || 'policy denied' });

      return {
        success: false,
        taskId: taskId,
        mode: params.mode,
        output: '[EXEC-POLICY] 命令未通过受控执行策略:\n' + (controlledResult.reason || '拒绝执行'),
        error: 'EXEC_POLICY_DENIED',
        steps: steps
      };
    }
    steps.push({ step: 5, name: 'controlled_exec', status: controlledResult.mode || 'ok' });
  } catch (e) {
    steps.push({ step: 5, name: 'controlled_exec', status: 'error', reason: e.message });
    return {
      success: false,
      taskId: taskId,
      mode: params.mode,
      output: '[EXEC-POLICY] 受控执行错误: ' + e.message,
      error: 'EXEC_POLICY_ERROR',
      steps: steps
    };
  }

  // ─── 6. Commander Runtime（内含 DAG Scheduler）───
  var commanderResult;
  try {
    // 构建 WeCom 上下文传给 commander-command
    var wecomCtx = {
      fromUser: params.wecomUserId || params.user,
      toUser: params.wecomUserId || params.user,
      agentId: params.agentId || '1000006'
    };

    commanderResult = await executeCommander(wecomCtx, parsed.args);

    if (!commanderResult.success) {
      steps.push({ step: 6, name: 'commander_runtime', status: 'failed' });

      return {
        success: false,
        taskId: taskId,
        mode: params.mode,
        output: commanderResult.output || '[COMMANDER] 总控执行失败',
        error: 'COMMANDER_FAILED',
        steps: steps
      };
    }
    steps.push({ step: 6, name: 'commander_runtime', status: 'ok' });
  } catch (e) {
    steps.push({ step: 6, name: 'commander_runtime', status: 'error', reason: e.message });
    return {
      success: false,
      taskId: taskId,
      mode: params.mode,
      output: '[COMMANDER] 总控错误: ' + e.message,
      error: 'COMMANDER_ERROR',
      steps: steps
    };
  }

  // ─── 7. 汇总输出 ───
  var output = buildOutput(commanderResult, params, steps);

  // 更新任务状态
  updateBridgeTask(taskId, {
    status: 'COMPLETED',
    result: JSON.stringify({ output: output, steps: steps })
  });

  return {
    success: true,
    taskId: taskId,
    mode: params.mode,
    output: output,
    steps: steps
  };
}

// ─── 输出格式化 ──────────────────────────────────────────

/**
 * 构建最终输出文本
 */
function buildOutput(commanderResult, params, steps) {
  var lines = [];

  lines.push('\u{1F916} ChatGPT Bridge — 指令已受理');
  lines.push('\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501');
  lines.push('');

  // 模式标记
  if (params.mode === 'live') {
    lines.push('\u26A0\uFE0F 模式: LIVE（已确认执行）');
  } else {
    lines.push('\u2139\uFE0F 模式: plan-only（仅计划，未执行）');
  }

  lines.push('来源: ' + (params.source || 'chatgpt'));
  lines.push('用户: ' + (params.user || 'unknown'));
  lines.push('');

  // Commander 结果
  if (commanderResult && commanderResult.output) {
    lines.push(commanderResult.output);
    lines.push('');
  }

  // 执行链摘要
  lines.push('\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501');
  lines.push('执行链: WeCom RBAC \u2192 AI Runtime RBAC \u2192 Exec Policy \u2192 Commander \u2192 DAG');

  for (var i = 0; i < steps.length; i++) {
    var s = steps[i];
    var icon = s.status === 'ok' ? '\u2705' : (s.status === 'denied' ? '\u274C' : '\u2139\uFE0F');
    var extra = s.reason ? ' (' + s.reason + ')' : '';
    lines.push('  ' + icon + ' Step ' + s.step + ': ' + s.name + extra);
  }

  return lines.join('\n').slice(0, MAX_OUTPUT_LENGTH);
}

// ─── 企微消息格式化 ──────────────────────────────────────

/**
 * 格式化企微推送消息
 *
 * @param {object} result - execute() 返回结果
 * @returns {string}
 */
function formatWeComMessage(result) {
  return result.output || (result.success ?
    '\u2705 ChatGPT Bridge 指令处理完成' :
    '\u274C ChatGPT Bridge 指令处理失败: ' + (result.error || ''));
}

// ─── 对外导出: WeCom 命令格式 ────────────────────────────

/**
 * WeCom /bridge 命令入口
 * 用法: /bridge /总控 提升GMV
 *
 * @param {object} ctx   - WeCom 上下文
 * @param {string} args  - 命令参数
 * @returns {Promise<string>}
 */
async function executeWeComCommand(ctx, args) {
  var params = {
    source: 'chatgpt',
    user: ctx.fromUser || 'unknown',
    command: (args || '').trim(),
    mode: 'plan-only',
    confirm: false,
    wecomUserId: ctx.fromUser,
    agentId: ctx.agentId || '1000006',
    context: {}
  };

  if (!params.command) {
    return [
      '\u{1F916} ChatGPT Bridge',
      '',
      '用法: /bridge <命令>',
      '',
      '示例:',
      '  /bridge /总控 提升GMV',
      '  /bridge /总控 状态',
      '  /bridge /总控 列表',
      '  /bridge /目标',
      '',
      '将外部指令导入 Commander Runtime。',
    ].join('\n');
  }

  var result = await execute(params);

  return result.output;
}

module.exports = {
  execute,
  executeWeComCommand,
  formatWeComMessage,
  isBridgeAllowed,
  parseCommand,
  checkWeComRBAC,
  checkAIRuntimeRBAC,
  desc
};
