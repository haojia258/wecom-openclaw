'use strict';

/**
 * recovery-planner.js — 恢复计划生成器 (P9.1)
 *
 * 在失败后自动生成恢复 DAG，包含恢复步骤。
 *
 * 设计方案：
 *   1. 基于 failureType + executor + error 模式匹配生成恢复步骤
 *   2. 恢复步骤形成 DAG 节点（可被 DAG Scheduler 消费）
 *   3. 所有恢复步骤都是 staging-safe（readonly / health-check）
 *   4. 永不允许 production deploy/restart
 *
 * 恢复场景：
 *   - Gateway timeout → gateway health check → retry gateway verify
 *   - PM2 unavailable → readonly inspect → collect logs → degrade plan-only
 *   - npm test failure → examine test output → suggest fix
 *   - executor throw → inspect executor state → retry once
 *   - HTTP 5xx → health check → escalate
 */

var { ResultType } = require('./execution-result-classifier');

// ─── 恢复计划模板 ────────────────────────────────────────────

/**
 * 预定义的恢复计划模板。
 * key: "failureType:protocol" 或 "failureType:*"
 * value: { steps: RecoveryStep[], stagingSafe: boolean }
 */
var RECOVERY_TEMPLATES = {};

// ─── Gateway Timeout ─────────────────────────────────────────

RECOVERY_TEMPLATES['TIMEOUT:http'] = {
  description: 'Gateway timeout recovery plan',
  stagingSafe: true,
  steps: [
    {
      seq: 1,
      action: 'gateway_health_check',
      command: 'curl http://127.0.0.1:3001/health',
      category: 'health-check',
      agent: 'workbuddy',
      description: 'Check gateway health endpoint'
    },
    {
      seq: 2,
      action: 'gateway_ping_retry',
      command: 'curl http://127.0.0.1:3001/gateway/ping',
      category: 'health-check',
      agent: 'workbuddy',
      description: 'Retry gateway ping',
      dependsOn: ['gateway_health_check']
    },
    {
      seq: 3,
      action: 'collect_gateway_logs',
      command: 'pm2 logs wecom-adapter --nostream --lines 50',
      category: 'readonly-audit',
      agent: 'workbuddy',
      description: 'Collect recent gateway logs',
      dependsOn: ['gateway_ping_retry']
    }
  ]
};

// ─── PM2 Unavailable ─────────────────────────────────────────

RECOVERY_TEMPLATES['INFRA_ERROR:pm2'] = {
  description: 'PM2 unavailable — readonly inspect → collect logs → degrade',
  stagingSafe: true,
  steps: [
    {
      seq: 1,
      action: 'pm2_status_check',
      command: 'pm2 status',
      category: 'readonly-audit',
      agent: 'workbuddy',
      description: 'Check PM2 daemon status'
    },
    {
      seq: 2,
      action: 'pm2_list_attempt',
      command: 'pm2 list',
      category: 'readonly-audit',
      agent: 'workbuddy',
      description: 'Attempt to list PM2 processes',
      dependsOn: ['pm2_status_check']
    },
    {
      seq: 3,
      action: 'collect_system_status',
      command: 'uptime && free -m && df -h',
      category: 'readonly-audit',
      agent: 'workbuddy',
      description: 'Collect system resource status',
      dependsOn: ['pm2_list_attempt']
    },
    {
      seq: 4,
      action: 'degrade_to_plan_only',
      command: 'mode plan-only',
      category: 'readonly-audit',
      agent: 'workbuddy',
      description: 'Degrade to plan-only mode (PM2 unavailable)',
      dependsOn: ['collect_system_status']
    }
  ]
};

// ─── npm test Failure ────────────────────────────────────────

RECOVERY_TEMPLATES['EXECUTOR_ERROR:npm-test'] = {
  description: 'npm test failure — examine output → suggest fix',
  stagingSafe: true,
  steps: [
    {
      seq: 1,
      action: 'collect_test_output',
      command: 'tail -100 logs/test-output.log',
      category: 'readonly-audit',
      agent: 'codex',
      description: 'Collect recent test output'
    },
    {
      seq: 2,
      action: 'analyze_test_failure',
      command: 'npm test -- --verbose 2>&1 | tail -50',
      category: 'test',
      agent: 'codex',
      description: 'Re-run test with verbose to analyze failure',
      dependsOn: ['collect_test_output']
    },
    {
      seq: 3,
      action: 'generate_fix_suggestion',
      command: 'analyze-test-failure',
      category: 'readonly-audit',
      agent: 'codex',
      description: 'Generate fix suggestion based on test failure analysis',
      dependsOn: ['analyze_test_failure']
    }
  ]
};

// ─── Executor Throw ──────────────────────────────────────────

RECOVERY_TEMPLATES['EXECUTOR_ERROR:*'] = {
  description: 'Executor error — inspect state → retry once',
  stagingSafe: true,
  steps: [
    {
      seq: 1,
      action: 'inspect_executor_state',
      command: 'get-executor-state',
      category: 'readonly-audit',
      agent: 'workbuddy',
      description: 'Inspect executor internal state'
    },
    {
      seq: 2,
      action: 'retry_executor_once',
      command: 'retry-executor',
      category: 'test',
      agent: 'workbuddy',
      description: 'Single retry of the failed executor',
      dependsOn: ['inspect_executor_state']
    },
    {
      seq: 3,
      action: 'escalate_if_still_failing',
      command: 'escalate-executor-failure',
      category: 'readonly-audit',
      agent: 'workbuddy',
      description: 'Escalate if retry also fails',
      dependsOn: ['retry_executor_once']
    }
  ]
};

// ─── HTTP 5xx ────────────────────────────────────────────────

RECOVERY_TEMPLATES['TRANSIENT_FAILURE:http'] = {
  description: 'HTTP transient failure — health check → escalate',
  stagingSafe: true,
  steps: [
    {
      seq: 1,
      action: 'service_health_check',
      command: 'curl http://127.0.0.1:3001/health',
      category: 'health-check',
      agent: 'workbuddy',
      description: 'Check service health after HTTP transient failure'
    },
    {
      seq: 2,
      action: 'collect_service_logs',
      command: 'pm2 logs wecom-adapter --nostream --lines 30',
      category: 'readonly-audit',
      agent: 'workbuddy',
      description: 'Collect service logs for diagnosis',
      dependsOn: ['service_health_check']
    }
  ]
};

// ─── General Timeout ─────────────────────────────────────────

RECOVERY_TEMPLATES['TIMEOUT:*'] = {
  description: 'General timeout recovery',
  stagingSafe: true,
  steps: [
    {
      seq: 1,
      action: 'check_resource_usage',
      command: 'uptime && free -m',
      category: 'readonly-audit',
      agent: 'workbuddy',
      description: 'Check system resource usage'
    },
    {
      seq: 2,
      action: 'retry_with_extended_timeout',
      command: 'retry-extended-timeout',
      category: 'test',
      agent: 'workbuddy',
      description: 'Retry with extended timeout window',
      dependsOn: ['check_resource_usage']
    }
  ]
};

// ─── Unknown / Fallback ──────────────────────────────────────

RECOVERY_TEMPLATES['UNKNOWN:*'] = {
  description: 'Unknown error — generic inspection and escalation',
  stagingSafe: true,
  steps: [
    {
      seq: 1,
      action: 'generic_inspection',
      command: 'inspect-system-state',
      category: 'readonly-audit',
      agent: 'workbuddy',
      description: 'Generic system state inspection'
    },
    {
      seq: 2,
      action: 'collect_error_context',
      command: 'collect-error-context',
      category: 'readonly-audit',
      agent: 'workbuddy',
      description: 'Collect error context for diagnosis',
      dependsOn: ['generic_inspection']
    }
  ]
};

// ─── 禁止的恢复动作 ──────────────────────────────────────────

/**
 * 禁止在恢复计划中出现的模式。
 * 即使恢复模板定义了这些，generator 也会强制移除。
 */
var FORBIDDEN_RECOVERY_ACTIONS = [
  'deploy', 'production', 'restart', 'pm2 restart', 'nginx',
  'docker compose up', 'git push', 'sudo', 'kill', 'rm -rf',
  'chmod', 'chown', 'shutdown', 'reboot'
];

// ─── 核心 API ────────────────────────────────────────────────

/**
 * 生成恢复计划
 *
 * @param {Object} params
 * @param {string} params.failureType    - 故障类型 (ResultType 值)
 * @param {string} params.protocol       - 协议 (http/pm2/npm-test/executor-throw)
 * @param {string} params.error          - 错误消息
 * @param {string} [params.executorName] - 执行器名称
 * @param {string} [params.correlationId] - 关联 ID
 * @returns {{ plan: Object, recoveryDag: Object, stagingSafe: boolean }}
 */
function generateRecoveryPlan(params) {
  var failureType = params.failureType || ResultType.UNKNOWN;
  var protocol = (params.protocol || 'generic').toLowerCase();
  var error = params.error || '';
  var executorName = params.executorName || '';
  var correlationId = params.correlationId || ('recov_' + Date.now());

  // ─── 1. 查找匹配的恢复模板 ───
  var template = findRecoveryTemplate(failureType, protocol);

  // ─── 2. 安全检查：过滤禁止的恢复动作 ───
  var safeSteps = filterForbiddenActions(template.steps);

  // ─── 3. 附加上下文信息 ───
  var enrichedSteps = enrichSteps(safeSteps, params);

  // ─── 4. 构建恢复 DAG ───
  var recoveryDag = buildRecoveryDAG(enrichedSteps, correlationId);

  // ─── 5. 构建计划摘要 ───
  var plan = {
    correlationId: correlationId,
    failureType: failureType,
    protocol: protocol,
    description: template.description,
    stagingSafe: template.stagingSafe,
    totalSteps: enrichedSteps.length,
    steps: enrichedSteps,
    constraints: [
      'All recovery steps are staging-safe (readonly or health-check only)',
      'No production deploy/restart allowed',
      'No PM2 restart allowed',
      'No nginx operations allowed',
      'All steps must pass execution-policy check before execution'
    ],
    generatedAt: new Date().toISOString()
  };

  return {
    plan: plan,
    recoveryDag: recoveryDag,
    stagingSafe: template.stagingSafe
  };
}

/**
 * 查找匹配的恢复模板
 *
 * 优先级：
 *   1. "failureType:protocol" 精确匹配
 *   2. "failureType:*" 通配匹配
 *   3. "UNKNOWN:*" 兜底模板
 */
function findRecoveryTemplate(failureType, protocol) {
  // 精确匹配
  var exactKey = failureType + ':' + protocol;
  if (RECOVERY_TEMPLATES[exactKey]) {
    return RECOVERY_TEMPLATES[exactKey];
  }

  // 通配匹配
  var wildKey = failureType + ':*';
  if (RECOVERY_TEMPLATES[wildKey]) {
    return RECOVERY_TEMPLATES[wildKey];
  }

  // 兜底
  return RECOVERY_TEMPLATES['UNKNOWN:*'];
}

/**
 * 过滤禁止的恢复动作
 */
function filterForbiddenActions(steps) {
  return steps.filter(function(step) {
    var action = (step.action || '').toLowerCase();
    var cmd = (step.command || '').toLowerCase();

    for (var i = 0; i < FORBIDDEN_RECOVERY_ACTIONS.length; i++) {
      var forbidden = FORBIDDEN_RECOVERY_ACTIONS[i];
      if (action.indexOf(forbidden) !== -1 || cmd.indexOf(forbidden) !== -1) {
        console.warn('[recovery-planner] 移除禁止的恢复动作: ' + step.action +
          ' (匹配禁止模式: ' + forbidden + ')');
        return false;
      }
    }

    return true;
  });
}

/**
 * 用错误上下文丰富步骤
 */
function enrichSteps(steps, params) {
  return steps.map(function(step, index) {
    return {
      seq: step.seq || (index + 1),
      action: step.action,
      command: step.command,
      category: step.category,
      agent: step.agent,
      description: step.description,
      dependsOn: step.dependsOn || [],
      context: {
        failureType: params.failureType,
        protocol: params.protocol,
        errorPreview: (params.error || '').substring(0, 200),
        correlationId: params.correlationId
      }
    };
  });
}

/**
 * 构建恢复 DAG（将恢复步骤转换为 DAG 节点格式）
 */
function buildRecoveryDAG(steps, correlationId) {
  var nodes = [];
  var edges = [];

  for (var i = 0; i < steps.length; i++) {
    var step = steps[i];
    var nodeId = step.action;

    nodes.push({
      id: nodeId,
      agent: step.agent || 'workbuddy',
      command: step.command,
      priority: step.seq <= 2 ? 1 : (step.seq <= 4 ? 2 : 3),
      reason: step.description,
      dependsOn: step.dependsOn || [],
      type: 'recovery',
      context: step.context || {},
      blocked: false
    });
  }

  // 构建边
  for (var j = 0; j < steps.length; j++) {
    var step2 = steps[j];
    if (step2.dependsOn && step2.dependsOn.length > 0) {
      for (var k = 0; k < step2.dependsOn.length; k++) {
        edges.push({
          from: step2.dependsOn[k],
          to: step2.action
        });
      }
    }
  }

  return {
    dagId: 'recovery_' + correlationId,
    nodes: nodes,
    edges: edges,
    totalNodes: nodes.length
  };
}

/**
 * 验证恢复计划是否 staging-safe
 *
 * @param {Object} plan - generateRecoveryPlan() 返回的 plan
 * @returns {{ safe: boolean, violations: string[] }}
 */
function validateRecoveryPlan(plan) {
  var violations = [];

  if (!plan) {
    return { safe: false, violations: ['计划为空'] };
  }

  if (!plan.stagingSafe) {
    violations.push('模板标记为非 staging-safe');
  }

  // 检查每个步骤
  for (var i = 0; i < plan.steps.length; i++) {
    var step = plan.steps[i];
    var cmd = (step.command || '').toLowerCase();

    for (var j = 0; j < FORBIDDEN_RECOVERY_ACTIONS.length; j++) {
      var forbidden = FORBIDDEN_RECOVERY_ACTIONS[j];
      if (cmd.indexOf(forbidden) !== -1) {
        violations.push('步骤 ' + step.seq + ' (' + step.action + ') 包含禁止模式: ' + forbidden);
      }
    }
  }

  return {
    safe: violations.length === 0,
    violations: violations
  };
}

/**
 * 注册自定义恢复模板
 *
 * @param {string} templateKey - "failureType:protocol"
 * @param {Object} template    - { description, stagingSafe, steps }
 */
function registerRecoveryTemplate(templateKey, template) {
  RECOVERY_TEMPLATES[templateKey] = template;
}

/**
 * 重置恢复模板（测试用）
 */
function resetRecoveryTemplates() {
  RECOVERY_TEMPLATES = {};
  // 重新注册内置模板（在测试中可能需要）
}

/**
 * 获取所有注册的恢复模板 key
 *
 * @returns {string[]}
 */
function listRecoveryTemplates() {
  return Object.keys(RECOVERY_TEMPLATES);
}

// ─── 导出 ────────────────────────────────────────────────────

module.exports = {
  // 核心 API
  generateRecoveryPlan: generateRecoveryPlan,
  validateRecoveryPlan: validateRecoveryPlan,
  findRecoveryTemplate: findRecoveryTemplate,

  // 管理
  registerRecoveryTemplate: registerRecoveryTemplate,
  resetRecoveryTemplates: resetRecoveryTemplates,
  listRecoveryTemplates: listRecoveryTemplates,

  // 内部构建器（暴露用于测试）
  buildRecoveryDAG: buildRecoveryDAG,
  filterForbiddenActions: filterForbiddenActions,
  enrichSteps: enrichSteps,

  // 常量
  FORBIDDEN_RECOVERY_ACTIONS: FORBIDDEN_RECOVERY_ACTIONS,
  RECOVERY_TEMPLATES: RECOVERY_TEMPLATES
};
