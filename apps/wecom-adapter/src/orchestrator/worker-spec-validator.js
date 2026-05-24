/**
 * worker-spec-validator.js
 * WorkerSpec Runtime Layer — Validator
 *
 * 强制校验 WorkerSpec 的合规性。
 * 规则：
 *   1. blockedActions 必须存在（可以为空数组，但不能缺失）
 *   2. reviewOnly 必须为 true
 *   3. requiresHumanApproval 必须为 true
 *   4. provider 必须在 VALID_PROVIDERS 中
 *   5. role 必须在 VALID_ROLES 中
 *   6. 未知字段产生 warning（由 parser 处理，此处只做二次确认）
 */

const { VALID_PROVIDERS, VALID_ROLES, VALID_INTENTS } = require('./worker-spec-parser');

// --- 危险操作黑名单（绝对禁止出现在 blockedActions 外的操作） ---
const DANGEROUS_ACTIONS = [
  'auto-merge',
  'auto-deploy',
  'auto-apply',
  'push-main',
  'merge-develop',
  'modify-nginx',
  'modify-env',
  'delete-branch',
  'force-push',
  'dynamic-worker',
];

/**
 * 校验 WorkerSpec
 *
 * @param {object} spec - WorkerSpec 对象
 * @returns {{ valid: boolean, errors: string[], warnings: string[], block: string }}
 */
function validateWorkerSpec(spec) {
  const errors = [];
  const warnings = [];

  if (!spec || typeof spec !== 'object') {
    return {
      valid: false,
      errors: ['WorkerSpec 不能为空或非对象'],
      warnings: [],
      block: 'INVALID_INPUT',
    };
  }

  // --- 规则 1: blockedActions 必须存在 ---
  if (!spec.hasOwnProperty('blockedActions')) {
    errors.push('blockedActions 字段缺失：每个 Worker 必须声明禁止操作列表（可为空数组 []）');
  } else if (!Array.isArray(spec.blockedActions)) {
    errors.push('blockedActions 必须为数组');
  } else {
    // 检查是否包含危险操作
    for (const action of spec.blockedActions) {
      if (DANGEROUS_ACTIONS.includes(action)) {
        warnings.push(`blockedActions 包含系统级危险操作: "${action}" — 该操作已被系统禁止`);
      }
    }
    // 检查是否缺少关键禁止项
    const missingCritical = DANGEROUS_ACTIONS.filter(
      da => !spec.blockedActions.includes(da)
    );
    if (missingCritical.length > 0) {
      warnings.push(
        `blockedActions 缺少以下系统禁止操作（虽然系统层面已禁止，但建议显式声明）: ` +
        missingCritical.join(', ')
      );
    }
  }

  // --- 规则 2: reviewOnly 必须为 true ---
  if (spec.reviewOnly !== true) {
    errors.push(
      `reviewOnly 必须为 true（当前值: ${JSON.stringify(spec.reviewOnly)}）。` +
      `所有 Worker 必须以审查模式运行。`
    );
  }

  // --- 规则 3: requiresHumanApproval 必须为 true ---
  if (spec.requiresHumanApproval !== true) {
    errors.push(
      `requiresHumanApproval 必须为 true（当前值: ${JSON.stringify(spec.requiresHumanApproval)}）。` +
      `所有 Worker 操作需经人工审批。`
    );
  }

  // --- 规则 4: provider 必须合法 ---
  if (!spec.provider) {
    errors.push('provider 字段缺失');
  } else if (!VALID_PROVIDERS.includes(spec.provider)) {
    errors.push(
      `provider "${spec.provider}" 不合法。` +
      `有效值: ${VALID_PROVIDERS.join(', ')}`
    );
  }

  // --- 规则 5: role 必须合法 ---
  if (!spec.role) {
    errors.push('role 字段缺失');
  } else if (!VALID_ROLES.includes(spec.role)) {
    errors.push(
      `role "${spec.role}" 不合法。` +
      `有效值: ${VALID_ROLES.join(', ')}`
    );
  }

  // --- 规则 6: model 必须指定 ---
  if (!spec.model) {
    warnings.push('model 未指定，将由 provider 默认选择');
  }

  // --- 规则 7: workerId 格式检查 ---
  if (spec.workerId && !/^[a-z0-9][a-z0-9-]*$/.test(spec.workerId)) {
    warnings.push(`workerId "${spec.workerId}" 包含非法字符，已由 parser 规范化`);
  }

  // --- 规则 8: allowedIntents 合法性检查 ---
  if (spec.allowedIntents && Array.isArray(spec.allowedIntents) && spec.allowedIntents.length > 0) {
    const invalidIntents = spec.allowedIntents.filter(i => !VALID_INTENTS.includes(i));
    if (invalidIntents.length > 0) {
      warnings.push(
        `allowedIntents 包含未识别的意图: ${invalidIntents.join(', ')}。` +
        `已识别的意图: ${VALID_INTENTS.join(', ')}`
      );
    }
  }

  // --- 规则 9: promptFile 存在性标记 ---
  if (!spec.promptFile) {
    warnings.push('promptFile 未指定 — Worker 将使用 Codex 生成的默认 prompt');
  }

  // --- 判定 ---
  const block = errors.length > 0
    ? (errors.some(e => e.includes('reviewOnly') || e.includes('requiresHumanApproval'))
        ? 'SECURITY_BLOCK'
        : 'VALIDATION_FAILED')
    : null;

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    block: block || (warnings.length > 0 ? 'WARNINGS_PRESENT' : null),
  };
}

/**
 * 快速检查（单次调用，抛出异常）
 */
function assertValidWorkerSpec(spec) {
  const result = validateWorkerSpec(spec);
  if (!result.valid) {
    const err = new Error('WorkerSpec 校验失败');
    err.details = result;
    throw err;
  }
  return result;
}

/**
 * 检查 provider 是否合法
 */
function isValidProvider(provider) {
  return VALID_PROVIDERS.includes(String(provider).toLowerCase());
}

/**
 * 检查 role 是否合法
 */
function isValidRole(role) {
  return VALID_ROLES.includes(String(role).toLowerCase());
}

module.exports = {
  validateWorkerSpec,
  assertValidWorkerSpec,
  isValidProvider,
  isValidRole,
  VALID_PROVIDERS,
  VALID_ROLES,
  DANGEROUS_ACTIONS,
};
