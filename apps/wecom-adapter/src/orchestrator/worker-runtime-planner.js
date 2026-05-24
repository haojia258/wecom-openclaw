/**
 * worker-runtime-planner.js
 * WorkerSpec Runtime Layer — Runtime Planner
 *
 * 职责：
 *   1. 解析 WorkerSpec（委托 parser/validator）
 *   2. 生成三方协作计划：
 *      - WorkBuddy → 创建 worker-registry patch
 *      - Codex      → 创建 prompt patch
 *      - Risk Worker → 审查 blockedActions
 *   3. 输出格式化计划报告
 *
 * 禁止：
 *   - 动态 Worker
 *   - 自动 merge
 *   - 自动 deploy
 *   - 自动 apply
 */

const { parseWorkerSpec, formatWorkerSpec } = require('./worker-spec-parser');
const { validateWorkerSpec } = require('./worker-spec-validator');
const { listAssignees } = require('./worker-dispatcher');

const VERSION = 'v1.0-worker-spec-runtime';

/**
 * 为 WorkerSpec 生成运行时计划
 *
 * @param {string|object} input - 用户输入的 WorkerSpec
 * @returns {{ success: boolean, report: string, plan: object|null, spec: object|null }}
 */
function planWorkerCreation(input) {
  // --- Phase 1: 解析 WorkerSpec ---
  const parseResult = parseWorkerSpec(input);

  if (parseResult.errors.length > 0) {
    return {
      success: false,
      report: formatParseErrors(parseResult),
      plan: null,
      spec: null,
    };
  }

  if (parseResult.missingFields.length > 0) {
    return {
      success: false,
      report: formatMissingFields(parseResult),
      plan: null,
      spec: null,
    };
  }

  const spec = parseResult.spec;

  // --- Phase 2: 校验 WorkerSpec ---
  const validation = validateWorkerSpec(spec);

  if (!validation.valid) {
    return {
      success: false,
      report: formatValidationErrors(spec, validation, parseResult.warnings),
      plan: null,
      spec: spec,
    };
  }

  // --- Phase 3: 生成三方协作计划 ---
  const plan = buildCollaborationPlan(spec);

  // --- Phase 4: 格式化报告 ---
  const report = formatCollaborationReport(spec, plan, parseResult.warnings, validation.warnings);

  return {
    success: true,
    report,
    plan,
    spec,
  };
}

/**
 * 构建三方协作计划
 *
 * WorkBuddy：生成 worker-registry patch
 * Codex：生成 prompt patch
 * Risk Worker：审查 blockedActions
 */
function buildCollaborationPlan(spec) {
  const plan = {
    version: VERSION,
    workerId: spec.workerId,
    generatedAt: new Date().toISOString(),
    assignments: [
      {
        assignee: 'workbuddy',
        role: 'planner-worker',
        task: 'create-worker-registry',
        description: '创建 worker-registry patch，注册新 Worker',
        outputs: [
          `patch: worker-registry-add-${spec.workerId}.patch`,
          `新增 worker 定义到 registry`,
          `设置 role="${spec.role}", provider="${spec.provider}", model="${spec.model}"`,
        ],
        forbidden: ['auto-merge', 'auto-deploy', 'auto-apply'],
        reviewRequired: true,
      },
      {
        assignee: 'codex',
        role: 'executor-worker',
        task: 'create-prompt-patch',
        description: '创建 prompt patch，生成 Worker 专用 prompt 文件',
        outputs: [
          `prompts/${spec.workerId}-${spec.promptVersion || 'v1'}.md`,
          `包含 Worker 角色定义、allowedIntents、blockedActions`,
        ],
        forbidden: ['auto-merge', 'auto-deploy', 'auto-apply', 'modify-env', 'modify-nginx'],
        reviewRequired: true,
      },
      {
        assignee: 'workbuddy',
        role: 'risk-worker',
        task: 'review-blockedActions',
        description: '审查 blockedActions 完整性，生成风险审查报告',
        outputs: [
          `review/${spec.workerId}-safety-review.md`,
          `blockedActions 完整性检查`,
          `危险操作覆盖度评估`,
        ],
        forbidden: ['auto-approve'],
        reviewRequired: true,
      },
    ],
    constraints: {
      noDynamicWorker: true,
      noAutoMerge: true,
      noAutoDeploy: true,
      noAutoApply: true,
      requiresHumanApproval: true,
      reviewOnly: true,
    },
    ordering: [
      'Risk Worker 先审查 blockedActions',
      'WorkBuddy 创建 worker-registry patch',
      'Codex 创建 prompt patch',
      '全部 patch 需人工 review 后 apply',
    ],
  };

  return plan;
}

/**
 * 格式化解析错误
 */
function formatParseErrors(parseResult) {
  const lines = [
    '❌ WorkerSpec 解析失败',
    '='.repeat(40),
    '',
    '错误：',
    ...parseResult.errors.map(e => `  - ${e}`),
    '',
    '用法示例：',
    '  /ai调度 创建 Worker 名称:ops-monitor 类型:executor 提供商:openai 模型:gpt-4o',
    '  或',
    '  /ai调度 创建 Worker（逐字段模式，收到提示后填写）',
  ];
  return lines.join('\n');
}

/**
 * 格式化缺失字段
 */
function formatMissingFields(parseResult) {
  const lines = [
    '⚠️ WorkerSpec 缺少必需字段',
    '='.repeat(40),
    '',
    '请提供以下字段：',
    ...parseResult.missingFields.map(f => `  - ${f}`),
    '',
    '字段说明：',
    '  workerId (名称)    — Worker 标识，如 ops-monitor',
    '  role (类型)        — executor / planner / reviewer / risk_analyzer / reporter',
    '  provider (提供商)  — openai / deepseek / doubao / claude / workbuddy',
    '  model (模型)       — gpt-4o / deepseek-chat / doubao-pro 等',
    '  blockedActions     — 禁止操作列表',
    '',
    '完整示例：',
    '  /ai调度 创建 Worker 名称:ops-monitor 类型:executor 提供商:openai 模型:gpt-4o',
  ];
  return lines.join('\n');
}

/**
 * 格式化校验错误
 */
function formatValidationErrors(spec, validation, parseWarnings) {
  const lines = [
    '❌ WorkerSpec 校验未通过',
    '='.repeat(40),
    '',
    '严重错误：',
    ...validation.errors.map(e => `  ❌ ${e}`),
  ];

  const allWarnings = [...(parseWarnings || []), ...(validation.warnings || [])];
  if (allWarnings.length > 0) {
    lines.push('');
    lines.push('警告：');
    lines.push(...allWarnings.map(w => `  ⚠️ ${w}`));
  }

  lines.push('');
  lines.push('已解析的字段：');
  lines.push(`  workerId: ${spec.workerId || '(缺失)'}`);
  lines.push(`  role: ${spec.role || '(缺失)'}`);
  lines.push(`  provider: ${spec.provider || '(缺失)'}`);
  lines.push(`  model: ${spec.model || '(缺失)'}`);
  lines.push(`  reviewOnly: ${spec.reviewOnly}`);
  lines.push(`  requiresHumanApproval: ${spec.requiresHumanApproval}`);

  return lines.join('\n');
}

/**
 * 格式化协作计划报告
 */
function formatCollaborationReport(spec, plan, parseWarnings, validationWarnings) {
  const lines = [
    '🤖 WorkerSpec Runtime — 创建计划',
    '='.repeat(40),
    '',
    '【Worker 定义】',
    `  ID:         ${spec.workerId}`,
    `  类型:       ${spec.role}`,
    `  提供商:     ${spec.provider}`,
    `  模型:       ${spec.model || '(默认)'}`,
    `  Prompt 版本: ${spec.promptVersion || 'v1'}`,
    `  审查模式:   ${spec.reviewOnly ? '✅ 已启用' : '❌ 未启用'}`,
    `  人工审批:   ${spec.requiresHumanApproval ? '✅ 必须' : '❌ 未启用'}`,
    '',
  ];

  if (spec.allowedIntents && spec.allowedIntents.length > 0) {
    lines.push(`  允许操作:   ${spec.allowedIntents.join(', ')}`);
    lines.push('');
  }

  if (spec.blockedActions && spec.blockedActions.length > 0) {
    lines.push(`  禁止操作:   ${spec.blockedActions.join(', ')}`);
    lines.push('');
  }

  // 三方协作
  lines.push('【三方协作计划】');
  lines.push('-'.repeat(30));

  for (let i = 0; i < plan.assignments.length; i++) {
    const a = plan.assignments[i];
    lines.push('');
    lines.push(`  ${i + 1}. ${a.assignee.toUpperCase()} → ${a.task}`);
    lines.push(`     角色: ${a.role}`);
    lines.push(`     描述: ${a.description}`);
    lines.push('     输出:');
    for (const o of a.outputs) {
      lines.push(`       - ${o}`);
    }
    lines.push(`     审查要求: ${a.reviewRequired ? '✅ 需要' : '否'}`);
  }

  lines.push('');
  lines.push('【执行顺序】');
  for (let i = 0; i < plan.ordering.length; i++) {
    lines.push(`  ${i + 1}. ${plan.ordering[i]}`);
  }

  lines.push('');
  lines.push('【安全约束】');
  lines.push(`  ✅ 动态 Worker:    禁止`);
  lines.push(`  ✅ 自动合并:       禁止`);
  lines.push(`  ✅ 自动部署:       禁止`);
  lines.push(`  ✅ 自动 apply:     禁止`);
  lines.push(`  ✅ 人工审批:       必须`);
  lines.push(`  ✅ 审查模式:       已启用`);

  // Warnings
  const allWarnings = [...(parseWarnings || []), ...(validationWarnings || [])];
  if (allWarnings.length > 0) {
    lines.push('');
    lines.push('【注意事项】');
    for (const w of allWarnings) {
      lines.push(`  ⚠️ ${w}`);
    }
  }

  lines.push('');
  lines.push('【WorkerSpec JSON】');
  lines.push(formatWorkerSpec(spec));

  lines.push('');
  lines.push('⚠️ 以上为规划输出。实际执行需通过 patch 审查流程。');
  lines.push('不会自动 merge/deploy/apply。');

  return lines.join('\n');
}

module.exports = {
  planWorkerCreation,
  buildCollaborationPlan,
  VERSION,
};
