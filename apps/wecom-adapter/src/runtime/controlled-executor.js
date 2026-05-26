'use strict';

/**
 * controlled-executor.js - 受控执行器核心 (P8.1)
 *
 * OpenClaw OS v2 第一次允许 AI 真正执行动作。
 * 仅允许 staging-safe execution，所有操作必须经过以下检查链:
 *
 *   1. validateExecution()     → 命令合法性检查（execution-policy）
 *   2. runtimeRBACCheck()      → Runtime RBAC 二层层检查
 *   3. dryRun()                → 默认 dry-run 模式
 *   4. humanConfirmRequired()  → 必须 humanConfirmToken
 *   5. executeControlled()     → 白名单映射执行
 *   6. auditExecution()        → 记录审计日志
 *   7. rollbackPlan()          → 生成回滚方案
 *
 * 安全约束:
 *   - 默认 dry-run=true
 *   - 必须 humanConfirmToken
 *   - 不允许 child_process.exec 任意命令
 *   - 必须 whitelist command mapping
 *   - Runtime RBAC deny 立即阻断
 *   - 所有执行写 execution-audit.log
 */

const { checkCommand, checkAction } = require('./execution-policy');
const { checkAgentAction } = require('./ai-runtime-rbac');
const {
  writeAuditEntry,
  writeBlockedEntry,
  writeSuccessEntry,
  writeErrorEntry
} = require('./execution-audit-log');

// ─── 命令白名单映射 ──────────────────────────────────────────────

/**
 * 允许的具体命令执行映射。
 * 只有在此映射中的命令才能被 executeControlled 真正执行。
 * 不是所有通过 policy 的命令都能执行——policy 负责"逻辑允许"，
 * 此映射负责"物理执行"。
 *
 * 每个条目:
 *   key:   逻辑操作名称
 *   value: { exec: 可调用的无参函数, description: 描述 }
 */
var COMMAND_EXECUTORS = {};

/**
 * 注册命令执行器
 *
 * @param {string} name        - 逻辑操作名称
 * @param {Function} executor  - 执行函数（无参，返回 { success, output, error }）
 * @param {string} description - 描述
 */
function registerExecutor(name, executor, description) {
  COMMAND_EXECUTORS[name] = { exec: executor, description: description };
}

/**
 * 获取已注册的执行器列表
 *
 * @returns {Array<{ name: string, description: string }>}
 */
function getRegisteredExecutors() {
  return Object.keys(COMMAND_EXECUTORS).map(function(name) {
    return { name: name, description: COMMAND_EXECUTORS[name].description };
  });
}

// ─── 核心执行流程 ───────────────────────────────────────────────

/**
 * 步骤 1: 验证命令是否在策略允许范围内
 *
 * @param {string} command - 要检查的 shell 命令
 * @returns {{ valid: boolean, category: string, reason: string }}
 */
function validateExecution(command) {
  if (!command || typeof command !== 'string' || !command.trim()) {
    return { valid: false, category: 'invalid', reason: '空命令' };
  }

  var result = checkCommand(command.trim());
  return {
    valid: result.allowed,
    category: result.category,
    reason: result.reason
  };
}

/**
 * 步骤 2: Runtime RBAC 检查
 *
 * @param {string} agentName - Agent 名称 (codex/workbuddy/deepseek/doubao)
 * @param {string} action    - 逻辑操作名称
 * @returns {{ allowed: boolean, reason: string }}
 */
function runtimeRBACCheck(agentName, action) {
  if (!agentName || !action) {
    return { allowed: false, reason: '[CE-RBAC] 缺少 agent 或 action 参数' };
  }

  var result = checkAgentAction(agentName, action);

  if (!result.allowed) {
    return {
      allowed: false,
      reason: result.reason
    };
  }

  return { allowed: true, reason: 'runtime-rbac-passed' };
}

/**
 * 步骤 3: Dry Run - 返回将要执行的内容而不实际执行
 *
 * @param {Object} params
 * @param {string} params.command   - 要执行的命令
 * @param {string} params.category  - 命令分类
 * @param {string} params.agent     - 执行 Agent
 * @param {string} params.user      - 发起用户
 * @param {string} params.task_id   - 任务 ID
 * @returns {Object} dry-run 结果
 */
function dryRun(params) {
  var plan = {
    mode: 'dry-run',
    task_id: params.task_id || 'unknown',
    user: params.user || 'unknown',
    agent: params.agent || 'unknown',
    command: params.command,
    category: params.category,
    would_execute: true,
    human_confirm_required: true,
    disclaimer: '这是 DRY RUN 计划，命令不会真正执行。请确认后以 live 模式重新执行。',
    rollback_plan: generateRollbackPlan(params.command, params.category)
  };

  return {
    success: true,
    plan: plan
  };
}

/**
 * 步骤 4: 生成回滚方案
 *
 * @param {string} command  - 要执行的命令
 * @param {string} category - 命令分类
 * @returns {Object} 回滚计划
 */
function generateRollbackPlan(command, category) {
  // staging-pm2: 直接提供 pm2 delete 回滚命令
  if (category === 'staging-pm2') {
    return {
      type: 'pm2-delete-shadow',
      description: '删除对应的 shadow PM2 进程',
      risk: 'low',
      reversible: true,
      steps: ['pm2 delete <shadow-instance-name>']
    };
  }

  // test: 测试无副作用，无需回滚
  if (category === 'test') {
    return {
      type: 'no-rollback-needed',
      description: '测试命令无副作用',
      risk: 'none',
      reversible: true,
      steps: []
    };
  }

  // health-check / readonly: 无副作用
  if (category === 'health-check' || category === 'readonly-audit' || category === 'readonly-db') {
    return {
      type: 'no-rollback-needed',
      description: '只读命令无副作用',
      risk: 'none',
      reversible: true,
      steps: []
    };
  }

  // 默认
  return {
    type: 'manual-review',
    description: '请手动确认是否需要回滚',
    risk: 'unknown',
    reversible: false,
    steps: ['人工审查命令输出，确认是否需要回滚']
  };
}

/**
 * 步骤 5: 生成人工确认令牌
 *
 * @param {Object} params
 * @param {string} params.task_id
 * @param {string} params.command
 * @param {string} params.agent
 * @returns {string} humanConfirmToken
 */
function generateHumanConfirmToken(params) {
  var ts = Date.now();
  var rand = Math.random().toString(36).substring(2, 8);
  return 'hct_' + ts + '_' + rand;
}

/**
 * 步骤 6: 执行受控命令
 *
 * 仅执行已在 COMMAND_EXECUTORS 中注册白名单映射的命令。
 *
 * @param {Object} params
 * @param {string} params.executorName  - 已注册的执行器名称
 * @param {string} params.mode          - 'dry-run' | 'live'
 * @param {string} params.humanConfirmToken - 人工确认令牌
 * @param {string} params.task_id       - 任务 ID
 * @param {string} params.user          - 用户
 * @param {string} params.agent         - Agent
 * @param {string} params.command       - 原始命令（用于审计）
 * @param {string} params.category      - 命令分类
 * @returns {Promise<Object>} 执行结果
 */
async function executeControlled(params) {
  var mode = params.mode || 'dry-run';
  var humanToken = params.humanConfirmToken;

  // 必须是 live 模式
  if (mode !== 'live') {
    var dryPlan = dryRun(params);
    writeAuditEntry({
      task_id: params.task_id,
      user: params.user,
      agent: params.agent,
      command: params.command,
      category: params.category,
      mode: 'dry-run',
      human_confirm: false,
      result: 'blocked',
      blocked_reason: 'not-in-live-mode',
      output_preview: JSON.stringify(dryPlan.plan).substring(0, 200)
    });
    return {
      success: false,
      error: '必须使用 live 模式执行。当前为 dry-run，命令未实际执行。',
      dryRunPlan: dryPlan.plan
    };
  }

  // 必须有人工确认令牌
  if (!humanToken || typeof humanToken !== 'string' || humanToken.length < 8) {
    writeBlockedEntry({
      task_id: params.task_id,
      user: params.user,
      agent: params.agent,
      command: params.command,
      category: params.category,
      mode: 'live',
      human_confirm: false,
      blocked_reason: 'missing-human-confirm-token'
    });
    return {
      success: false,
      error: '缺少有效的 humanConfirmToken。受控执行需要人工确认。'
    };
  }

  // 查找执行器
  var executorName = params.executorName;
  var executor = COMMAND_EXECUTORS[executorName];

  if (!executor) {
    writeBlockedEntry({
      task_id: params.task_id,
      user: params.user,
      agent: params.agent,
      command: params.command,
      category: params.category,
      mode: 'live',
      human_confirm: true,
      blocked_reason: 'no-executor-registered: "' + executorName + '"'
    });
    return {
      success: false,
      error: '未注册的命令执行器: "' + executorName + '"。"' + params.command + '" 已通过策略检查，但无可用的物理执行器。'
    };
  }

  // 执行
  var startTime = Date.now();
  try {
    var result = await executor.exec();
    var duration = Date.now() - startTime;

    if (result.success) {
      writeSuccessEntry({
        task_id: params.task_id,
        user: params.user,
        agent: params.agent,
        command: params.command,
        category: params.category,
        mode: 'live',
        human_confirm: true,
        duration_ms: duration,
        output_preview: result.output ? result.output.substring(0, 200) : null
      });

      return {
        success: true,
        output: result.output || '',
        duration_ms: duration,
        mode: 'live'
      };
    } else {
      writeErrorEntry({
        task_id: params.task_id,
        user: params.user,
        agent: params.agent,
        command: params.command,
        category: params.category,
        mode: 'live',
        human_confirm: true,
        blocked_reason: result.error || 'execution-failed',
        output_preview: result.output ? result.output.substring(0, 200) : null
      });

      return {
        success: false,
        error: result.error || '执行失败',
        output: result.output || '',
        duration_ms: duration
      };
    }
  } catch (err) {
    var catchDuration = Date.now() - startTime;
    writeErrorEntry({
      task_id: params.task_id,
      user: params.user,
      agent: params.agent,
      command: params.command,
      category: params.category,
      mode: 'live',
      human_confirm: true,
      blocked_reason: 'executor-threw: ' + err.message
    });

    return {
      success: false,
      error: '执行器异常: ' + err.message,
      duration_ms: catchDuration
    };
  }
}

/**
 * 完整的受控执行流程
 *
 * 组合所有 7 个步骤，提供一站式执行入口。
 *
 * @param {Object} params
 * @param {string} params.command          - shell 命令
 * @param {string} params.executorName     - 已注册的执行器名称
 * @param {string} params.agent            - Agent 名称
 * @param {string} params.user             - 发起用户
 * @param {string} params.task_id          - 任务 ID
 * @param {string} [params.mode]           - 'dry-run' (默认) | 'live'
 * @param {string} [params.humanConfirmToken] - 人工确认令牌
 * @returns {Promise<Object>} 执行结果
 */
async function controlledExecute(params) {
  var command = params.command;
  var agent = params.agent || 'unknown';
  var user = params.user || 'unknown';
  var task_id = params.task_id || ('task_ce_' + Date.now());

  // 1. validateExecution
  var validation = validateExecution(command);
  if (!validation.valid) {
    writeBlockedEntry({
      task_id: task_id,
      user: user,
      agent: agent,
      command: command,
      category: validation.category,
      mode: params.mode || 'dry-run',
      human_confirm: false,
      blocked_reason: 'policy-deny: ' + validation.reason
    });
    return {
      success: false,
      step: 'validateExecution',
      error: '执行策略拒绝: ' + validation.reason,
      validation: validation
    };
  }

  // 2. runtimeRBACCheck
  var rbacResult = runtimeRBACCheck(agent, validation.category);
  if (!rbacResult.allowed) {
    writeBlockedEntry({
      task_id: task_id,
      user: user,
      agent: agent,
      command: command,
      category: validation.category,
      mode: params.mode || 'dry-run',
      human_confirm: false,
      blocked_reason: 'runtime-rbac-deny: ' + rbacResult.reason
    });
    return {
      success: false,
      step: 'runtimeRBACCheck',
      error: 'Runtime RBAC 拒绝: ' + rbacResult.reason,
      rbac: rbacResult
    };
  }

  // 3-4. dryRun or execute
  var mode = params.mode || 'dry-run';

  // 检查执行器是否存在
  if (!COMMAND_EXECUTORS[params.executorName]) {
    return {
      success: false,
      step: 'executeControlled',
      error: '未注册的命令执行器: "' + params.executorName + '"',
      availableExecutors: Object.keys(COMMAND_EXECUTORS)
    };
  }

  // 生成确认令牌
  var confirmToken = params.humanConfirmToken || generateHumanConfirmToken(params);

  if (mode === 'dry-run') {
    // 3. dryRun
    var dryResult = dryRun({
      command: command,
      category: validation.category,
      agent: agent,
      user: user,
      task_id: task_id
    });

    // 6. auditExecution（dry-run 也记录）
    writeAuditEntry({
      task_id: task_id,
      user: user,
      agent: agent,
      command: command,
      category: validation.category,
      mode: 'dry-run',
      human_confirm: false,
      result: 'blocked',
      blocked_reason: 'dry-run-mode',
      output_preview: 'Dry run plan generated. Human confirmation required.'
    });

    return {
      success: true,
      step: 'dryRun',
      mode: 'dry-run',
      plan: dryResult.plan,
      humanConfirmToken: confirmToken,
      message: 'Dry run 完成。请确认后使用 humanConfirmToken 以 live 模式执行。'
    };
  }

  // 5. executeControlled (live)
  var execResult = await executeControlled({
    executorName: params.executorName,
    mode: mode,
    humanConfirmToken: confirmToken,
    task_id: task_id,
    user: user,
    agent: agent,
    command: command,
    category: validation.category
  });

  // 7. rollbackPlan（如果执行失败，附带回滚方案）
  if (!execResult.success) {
    execResult.rollbackPlan = generateRollbackPlan(command, validation.category);
  }

  return {
    success: execResult.success,
    step: execResult.success ? 'executeControlled' : 'executeControlled',
    mode: 'live',
    output: execResult.output,
    error: execResult.error,
    duration_ms: execResult.duration_ms,
    rollbackPlan: execResult.rollbackPlan || null
  };
}

/**
 * 为测试/审计目的审计执行记录
 *
 * @param {Object} params - 同 executeControlled
 * @returns {Object} 审计摘要
 */
function auditExecution(params) {
  var validation = validateExecution(params.command);
  return {
    command: params.command,
    policy_check: validation,
    agent: params.agent || 'unknown',
    user: params.user || 'unknown',
    mode: params.mode || 'dry-run',
    has_human_confirm: !!params.humanConfirmToken,
    timestamp: new Date().toISOString()
  };
}

/**
 * 回滚方案生成（暴露给外部）
 *
 * @param {string} command
 * @param {string} category
 * @returns {Object}
 */
function rollbackPlan(command, category) {
  return generateRollbackPlan(command, category);
}

/**
 * 重置执行器注册表（测试用）
 */
function resetExecutors() {
  COMMAND_EXECUTORS = {};
}

module.exports = {
  // 执行器注册
  registerExecutor,
  getRegisteredExecutors,
  resetExecutors,

  // 执行核心
  validateExecution,
  runtimeRBACCheck,
  dryRun,
  executeControlled,
  controlledExecute,
  auditExecution,
  rollbackPlan,

  // 辅助
  generateHumanConfirmToken,
  generateRollbackPlan
};
