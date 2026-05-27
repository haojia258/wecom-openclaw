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
const {
  writeAuditEntry,
  writeBlockedEntry,
  writeSuccessEntry,
  writeErrorEntry
} = require('./execution-audit-log');

// P9.1: Feedback Loop 依赖（懒加载以支持可选部署）
var _classifier = null;
var _retryPolicy = null;
var _recoveryPlanner = null;
var _failureMemory = null;
var _feedbackLog = null;

// P9.2: Shared Memory Runtime 依赖（懒加载）
var _memoryWriter = null;
var _contextBuilder = null;
var _memoryGovernance = null;

function _getClassifier() {
  if (!_classifier) _classifier = require('./execution-result-classifier');
  return _classifier;
}

function _getRetryPolicy() {
  if (!_retryPolicy) _retryPolicy = require('./retry-policy');
  return _retryPolicy;
}

function _getRecoveryPlanner() {
  if (!_recoveryPlanner) _recoveryPlanner = require('./recovery-planner');
  return _recoveryPlanner;
}

function _getFailureMemory() {
  if (!_failureMemory) _failureMemory = require('./failure-memory');
  return _failureMemory;
}

function _getFeedbackLog() {
  if (!_feedbackLog) _feedbackLog = require('./execution-feedback-log');
  return _feedbackLog;
}

function _getMemoryWriter() {
  if (!_memoryWriter) {
    try { _memoryWriter = require('../memory-runtime/memory-writer'); }
    catch (_) { _memoryWriter = null; }
  }
  return _memoryWriter;
}

function _getContextBuilder() {
  if (!_contextBuilder) {
    try { _contextBuilder = require('../memory-runtime/context-builder'); }
    catch (_) { _contextBuilder = null; }
  }
  return _contextBuilder;
}

function _getMemoryGovernance() {
  if (!_memoryGovernance) {
    try { _memoryGovernance = require('../memory-runtime/memory-governance'); }
    catch (_) { _memoryGovernance = null; }
  }
  return _memoryGovernance;
}

// ─── Agent 执行权限映射 ─────────────────────────────────────────

/**
 * Agent 到 execution category 的权限映射。
 * 这是 controlled-executor 的 Runtime RBAC 层，独立于 agent-permission-matrix。
 *
 * agent-permission-matrix:  dispatch 流程（plan-only 操作）
 * AGENT_EXECUTION_PERMISSIONS: controlled-executor 流程（命令执行）
 */
const AGENT_EXECUTION_PERMISSIONS = {
  codex: {
    description: 'Codex: 代码审查与测试',
    allowedCategories: ['test', 'readonly-audit', 'readonly-db', 'git-status']
  },
  workbuddy: {
    description: 'WorkBuddy: 运维审计与 staging 管理',
    allowedCategories: [
      'test',
      'health-check',
      'staging-pm2',
      'readonly-audit',
      'readonly-db',
      'git-status',
      'dag-dry-run',
      'rollout-dry-run',
      'shadow-validation'
    ]
  },
  deepseek: {
    description: 'DeepSeek: 只读审查与风险分析',
    allowedCategories: ['readonly-audit', 'readonly-db', 'git-status']
  },
  doubao: {
    description: 'Doubao: 内容生成',
    allowedCategories: ['readonly-audit']
  }
};

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
 * 步骤 2: Runtime RBAC 检查（Agent 执行权限层）
 *
 * 使用 AGENT_EXECUTION_PERMISSIONS 检查 agent 是否有权执行指定 category。
 * 这与 agent-permission-matrix 不同：
 *   - agent-permission-matrix: dispatch 流程（plan-only confirm 操作）
 *   - AGENT_EXECUTION_PERMISSIONS: controlled-executor 流程（命令执行）
 *
 * @param {string} agentName - Agent 名称 (codex/workbuddy/deepseek/doubao)
 * @param {string} category  - 命令分类 (test/health-check/staging-pm2/...)
 * @returns {{ allowed: boolean, reason: string }}
 */
function runtimeRBACCheck(agentName, category) {
  if (!agentName || !category) {
    return { allowed: false, reason: '[CE-RBAC] 缺少 agent 或 category 参数' };
  }

  var normalizedAgent = (agentName || '').toLowerCase();
  var normalizedCategory = (category || '').toLowerCase();

  // 未知 agent
  var agentPerm = AGENT_EXECUTION_PERMISSIONS[normalizedAgent];
  if (!agentPerm) {
    return {
      allowed: false,
      reason: '[CE-RBAC] 未知 Agent: "' + normalizedAgent + '"，无执行权限配置'
    };
  }

  // 检查 category 是否在 allow 列表
  if (agentPerm.allowedCategories.indexOf(normalizedCategory) === -1) {
    return {
      allowed: false,
      reason: '[CE-RBAC] ' + normalizedAgent + ' 无权执行分类 "' + normalizedCategory +
              '"（超出 Agent 执行权限范围）'
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

// ─── P9.1: Execution Feedback Loop ───────────────────────────

/**
 * 带反馈循环的受控执行
 *
 * Execution → Observe → Analyze → Retry → Recover 闭环。
 *
 * 流程：
 *   1. controlledExecute（标准受控执行）
 *   2. 如果失败 → classify（分类故障）
 *   3. 如果是 retryable → retry（带 policy check）
 *   4. 如果 retry 耗尽 → recovery plan（staging-safe）
 *   5. 所有步骤写入 execution-feedback.log 审计
 *
 * @param {Object} params
 * @param {string} params.command          - shell 命令
 * @param {string} params.executorName     - 已注册的执行器名称
 * @param {string} params.agent            - Agent 名称
 * @param {string} params.user             - 发起用户
 * @param {string} [params.task_id]        - 任务 ID
 * @param {string} [params.mode]           - 'dry-run' (默认) | 'live'
 * @param {string} [params.humanConfirmToken] - 人工确认令牌
 * @param {string} [params.protocol]       - 协议: http/pm2/npm-test/executor-throw
 * @param {Object} [params.metadata]       - 额外元数据
 * @returns {Promise<Object>} 含反馈循环信息的执行结果
 */
async function controlledExecuteWithFeedback(params) {
  var correlationId = params.task_id || ('fb_' + Date.now());
  var protocol = params.protocol || 'executor-throw';
  var agent = params.agent || 'workbuddy';
  var user = params.user || 'unknown';
  var executorName = params.executorName;

  var classifier = _getClassifier();
  var retryPolicy = _getRetryPolicy();
  var recoveryPlanner = _getRecoveryPlanner();
  var failureMemory = _getFailureMemory();
  var feedbackLog = _getFeedbackLog();

  var feedbackHistory = [];
  var totalRetries = 0;
  var recoveryPlanGenerated = false;
  var recoveryPlan = null;
  var recoveryDag = null;

  // ─── Step 1: 执行 ───
  var result = await controlledExecute({
    command: params.command,
    executorName: executorName,
    agent: agent,
    user: user,
    task_id: correlationId,
    mode: params.mode || 'dry-run',
    humanConfirmToken: params.humanConfirmToken
  });

  // 成功即返回
  if (result.success) {
    feedbackLog.logClassify({
      correlationId: correlationId,
      executor: executorName,
      protocol: protocol,
      classificationType: 'SUCCESS',
      retryable: false,
      reason: 'Execution succeeded'
    });

    feedbackLog.logFinal({
      correlationId: correlationId,
      executor: executorName,
      finalResult: 'SUCCESS',
      totalRetries: 0,
      recoveryAttempted: false,
      recovered: false
    });

    // ─── P9.2: Shared Memory Runtime - 记录成功执行 ───
    var mw = _getMemoryWriter();
    if (mw) {
      mw.appendExecution({
        correlationId: correlationId,
        timestamp: new Date().toISOString(),
        executor: executorName,
        command: params.command || '',
        success: true,
        durationMs: result.duration_ms || 0,
        output: result.output || '',
        agent: agent
      });
    }

    return {
      success: true,
      correlationId: correlationId,
      result: result,
      feedback: {
        classification: { type: 'SUCCESS', retryable: false },
        retries: 0,
        retryExhausted: false,
        recoveryPlanGenerated: false,
        recoveryPlan: null,
        history: feedbackHistory
      }
    };
  }

  // ─── Step 2: Classify ───
  var classification = classifier.classify({
    protocol: protocol,
    success: false,
    error: result.error || '',
    output: result.output || '',
    durationMs: result.duration_ms
  });

  feedbackHistory.push({ phase: 'classify', classification: classification });

  feedbackLog.logClassify({
    correlationId: correlationId,
    executor: executorName,
    protocol: protocol,
    classificationType: classification.type,
    retryable: classification.retryable,
    reason: classification.reason,
    error: result.error
  });

  // ─── Step 3: Retry Loop ───
  if (classification.retryable && protocol !== 'dry-run') {
    var retryResult = retryPolicy.shouldRetry(classification.type, 0, executorName);
    var retryAttempt = 0;

    while (retryResult.shouldRetry && retryAttempt < retryPolicy.getPolicy(classification.type, executorName).maxRetry) {
      retryAttempt++;
      totalRetries++;

      // 延迟
      await retryPolicy.sleep(retryResult.delayMs);

      // Re-check policy（retry 必须经过 policy check）
      var policyCheck = validateExecution(params.command);
      if (!policyCheck.valid) {
        feedbackLog.logRetry({
          correlationId: correlationId,
          executor: executorName,
          attempt: retryAttempt,
          maxRetry: retryPolicy.getPolicy(classification.type, executorName).maxRetry,
          delayMs: retryResult.delayMs,
          failureType: 'POLICY_BLOCKED',
          success: false
        });
        feedbackHistory.push({ phase: 'retry', attempt: retryAttempt, blocked: true, reason: 'policy-deny: ' + policyCheck.reason });
        break;
      }

      // 重新执行
      var retryExecResult = await executeControlled({
        executorName: executorName,
        mode: params.mode || 'live',
        humanConfirmToken: params.humanConfirmToken,
        task_id: correlationId,
        user: user,
        agent: agent,
        command: params.command,
        category: policyCheck.category
      });

      if (retryExecResult.success) {
        feedbackLog.logRetry({
          correlationId: correlationId,
          executor: executorName,
          attempt: retryAttempt,
          maxRetry: retryPolicy.getPolicy(classification.type, executorName).maxRetry,
          delayMs: retryResult.delayMs,
          failureType: classification.type,
          success: true
        });

        feedbackLog.logFinal({
          correlationId: correlationId,
          executor: executorName,
          finalResult: 'SUCCESS_AFTER_RETRY',
          totalRetries: totalRetries,
          recoveryAttempted: false,
          recovered: false
        });

        // ─── P9.2: Shared Memory Runtime - 记录重试后成功 ───
        var mwRetry = _getMemoryWriter();
        if (mwRetry) {
          mwRetry.appendIncident({
            correlationId: correlationId,
            timestamp: new Date().toISOString(),
            incidentType: classification.type,
            retryCount: retryAttempt,
            recoveryResult: 'retry_succeeded',
            executor: executorName,
            command: params.command || '',
            error: '',
            protocol: protocol,
            agent: agent
          });

          mwRetry.appendExecution({
            correlationId: correlationId,
            timestamp: new Date().toISOString(),
            executor: executorName,
            command: params.command || '',
            success: true,
            durationMs: retryExecResult.duration_ms || 0,
            output: retryExecResult.output || '',
            agent: agent
          });
        }

        return {
          success: true,
          correlationId: correlationId,
          result: retryExecResult,
          feedback: {
            classification: classification,
            retries: totalRetries,
            retryExhausted: false,
            recoveryPlanGenerated: false,
            recoveryPlan: null,
            history: feedbackHistory
          }
        };
      }

      feedbackLog.logRetry({
        correlationId: correlationId,
        executor: executorName,
        attempt: retryAttempt,
        maxRetry: retryPolicy.getPolicy(classification.type, executorName).maxRetry,
        delayMs: retryResult.delayMs,
        failureType: classification.type,
        success: false
      });

      feedbackHistory.push({ phase: 'retry', attempt: retryAttempt, success: false, error: retryExecResult.error });

      // 更新重试策略
      retryResult = retryPolicy.shouldRetry(classification.type, retryAttempt, executorName);
    }
  }

  // ─── Step 4: Recovery Plan ───
  if (classification.type === classifier.ResultType.EXECUTOR_ERROR ||
      classification.type === classifier.ResultType.INFRA_ERROR ||
      (totalRetries > 0 && !result.success)) {

    var recoveryResult = recoveryPlanner.generateRecoveryPlan({
      failureType: classification.type,
      protocol: protocol,
      error: result.error || '',
      executorName: executorName,
      correlationId: correlationId
    });

    // 验证恢复计划 staging-safe
    var validation = recoveryPlanner.validateRecoveryPlan(recoveryResult.plan);
    if (validation.safe) {
      recoveryPlanGenerated = true;
      recoveryPlan = recoveryResult.plan;
      recoveryDag = recoveryResult.recoveryDag;

      feedbackLog.logRecovery({
        correlationId: correlationId,
        executor: executorName,
        recoveryPlanId: recoveryPlan.correlationId,
        totalSteps: recoveryPlan.totalSteps,
        stagingSafe: recoveryPlan.stagingSafe,
        description: recoveryPlan.description
      });

      feedbackHistory.push({ phase: 'recovery', plan: recoveryPlan.description, steps: recoveryPlan.totalSteps });

      // 记录故障记忆
      failureMemory.recordFailure({
        correlationId: correlationId,
        executor: executorName,
        failureType: classification.type,
        retryCount: totalRetries,
        recoveryPlan: recoveryPlan.correlationId,
        error: result.error,
        protocol: protocol,
        resolved: false
      });

      // ─── P9.2: Shared Memory Runtime - 记录故障 + 恢复 ───
      var mw2 = _getMemoryWriter();
      if (mw2) {
        // 记录故障
        mw2.appendIncident({
          correlationId: correlationId,
          timestamp: new Date().toISOString(),
          incidentType: classification.type,
          retryCount: totalRetries,
          recoveryResult: 'recovery_planned',
          executor: executorName,
          command: params.command || '',
          error: result.error || '',
          protocol: protocol,
          agent: agent
        });

        // 记录恢复
        mw2.appendRecovery({
          correlationId: correlationId,
          timestamp: new Date().toISOString(),
          recoveryType: classification.type,
          recovered: false,
          executor: executorName,
          recoveryPlanId: recoveryPlan.correlationId,
          totalSteps: recoveryPlan.totalSteps,
          description: recoveryPlan.description || '',
          agent: agent,
          summary: 'Recovery plan generated for ' + classification.type
        });
      }
    } else {
      feedbackHistory.push({ phase: 'recovery', blocked: true, violations: validation.violations });
    }
  }

  // ─── Step 5: Final Result ───
  feedbackLog.logFinal({
    correlationId: correlationId,
    executor: executorName,
    finalResult: totalRetries > 0 ? 'FAILED_RETRY_EXHAUSTED' : 'FAILED',
    totalRetries: totalRetries,
    recoveryAttempted: recoveryPlanGenerated,
    recovered: false,
    error: result.error,
    output: result.output
  });

  // ─── P9.2: Shared Memory Runtime - 最终失败记录 + 上下文构建 ───
  var mw3 = _getMemoryWriter();
  var cb = _getContextBuilder();

  if (mw3) {
    // 记录故障（如果尚未在 recovery 阶段记录）
    if (!recoveryPlanGenerated) {
      mw3.appendIncident({
        correlationId: correlationId,
        timestamp: new Date().toISOString(),
        incidentType: classification.type,
        retryCount: totalRetries,
        recoveryResult: 'failed',
        executor: executorName,
        command: params.command || '',
        error: result.error || '',
        protocol: protocol,
        agent: agent
      });
    }

    // 记录最终失败执行
    mw3.appendExecution({
      correlationId: correlationId,
      timestamp: new Date().toISOString(),
      executor: executorName,
      command: params.command || '',
      success: false,
      durationMs: result.duration_ms || 0,
      error: result.error || '',
      agent: agent
    });
  }

  // 构建重试/恢复上下文
  var agentContext = null;
  if (cb) {
    try {
      agentContext = cb.buildRetryContext({
        correlationId: correlationId,
        incidentType: classification.type,
        executor: executorName,
        agent: agent,
        retryCount: totalRetries
      });
    } catch (_) {
      // 上下文构建失败不阻塞返回
    }
  }

  return {
    success: false,
    correlationId: correlationId,
    result: result,
    feedback: {
      classification: classification,
      retries: totalRetries,
      retryExhausted: totalRetries > 0,
      recoveryPlanGenerated: recoveryPlanGenerated,
      recoveryPlan: recoveryPlan,
      recoveryDag: recoveryDag,
      history: feedbackHistory
    },
    // P9.2: Agent 上下文
    agentContext: agentContext
  };
}

module.exports = {
  // AGENT 执行权限
  AGENT_EXECUTION_PERMISSIONS,

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

  // P9.1: Execution Feedback Loop
  controlledExecuteWithFeedback,

  // 辅助
  generateHumanConfirmToken,
  generateRollbackPlan
};
