/**
 * execution-policy.js
 * Runtime Expansion Phase1 - Execution Policy Layer
 *
 * 硬约束（硬编码，不依赖配置）：
 *   - 永不自动 apply 生产 patch
 *   - 永不自动 merge main
 *   - 永不自动 force push
 *   - 永不自动修改 nginx
 *   - 永不自动修改 .env
 *   - 永不自动修改企业微信主链路
 *
 * 导出：validateExecution(action, context) → { allowed, reason }
 */

var FORBIDDEN_ACTIONS = [
  'auto_apply_patch',
  'auto_merge_main',
  'auto_force_push',
  'modify_nginx',
  'modify_env',
  'modify_wecom_main_pipeline',
  'auto_deploy_production',
  'auto_delete_branch',
  'auto_approve_high_risk',
];

/**
 * 验证执行动作是否允许
 *
 * @param {string} action - 动作名称
 * @param {object} [context] - 上下文 { taskId, branch, riskScore, userInfo }
 * @returns {object} { allowed: boolean, reason: string }
 */
function validateExecution(action, context) {
  var act = (action || '').toLowerCase();
  var ctx = context || {};

  // 1. 自动 apply patch → 永远禁止
  if (act === 'auto_apply_patch' || act === 'apply_patch_auto') {
    return {
      allowed: false,
      reason: 'HARD_CONSTRAINT: 永不自动 apply patch 到生产。必须人工确认。',
      constraint: 'no_auto_apply',
    };
  }

  // 2. 自动 merge main → 永远禁止
  if (act === 'auto_merge_main' || act === 'merge_main_auto') {
    return {
      allowed: false,
      reason: 'HARD_CONSTRAINT: 永不自动 merge 到 main 分支。必须人工审查。',
      constraint: 'no_auto_merge_main',
    };
  }

  // 3. 自动 force push → 永远禁止
  if (act === 'auto_force_push' || act === 'force_push_auto') {
    return {
      allowed: false,
      reason: 'HARD_CONSTRAINT: 永不自动 force push。',
      constraint: 'no_auto_force_push',
    };
  }

  // 4. 修改 nginx 配置 → 永远禁止
  if (act === 'modify_nginx' || act === 'update_nginx_config') {
    return {
      allowed: false,
      reason: 'HARD_CONSTRAINT: 永不自动修改 nginx 配置。',
      constraint: 'no_modify_nginx',
    };
  }

  // 5. 修改 .env → 永远禁止
  if (act === 'modify_env' || act === 'update_env_file') {
    return {
      allowed: false,
      reason: 'HARD_CONSTRAINT: 永不自动修改 .env 文件。',
      constraint: 'no_modify_env',
    };
  }

  // 6. 修改企业微信主链路 → 永远禁止
  if (act === 'modify_wecom_main_pipeline' || act === 'modify_wecom_adapter') {
    return {
      allowed: false,
      reason: 'HARD_CONSTRAINT: 永不自动修改企业微信主链路（wecom-adapter）。',
      constraint: 'no_modify_wecom_pipeline',
    };
  }

  // 7. 自动部署生产 → 永远禁止
  if (act === 'auto_deploy_production' || act === 'deploy_prod_auto') {
    return {
      allowed: false,
      reason: 'HARD_CONSTRAINT: 永不自动部署到生产环境。',
      constraint: 'no_auto_deploy_prod',
    };
  }

  // 8. 自动删除分支 → 禁止删除 main/develop
  if (act === 'delete_branch' || act === 'auto_delete_branch') {
    var branch = (ctx.branch || '').toLowerCase();
    if (branch === 'main' || branch === 'develop') {
      return {
        allowed: false,
        reason: 'HARD_CONSTRAINT: 永不自动删除 main/develop 分支。',
        constraint: 'no_delete_protected_branch',
      };
    }
  }

  // 9. 自动批准高风险任务 → 永远禁止
  if (act === 'auto_approve' || act === 'auto_approve_high_risk') {
    var risk = ctx.riskScore;
    if (risk !== undefined && risk !== null) {
      // risk 可能是对象（P3 bug）或数字
      var score = (typeof risk === 'object' && risk.score !== undefined) ? risk.score : risk;
      if (typeof score === 'number' && score >= 40) {
        return {
          allowed: false,
          reason: 'HARD_CONSTRAINT: 风险分 >= 40 必须人工审查，禁止自动批准。',
          constraint: 'no_auto_approve_high_risk',
          riskScore: score,
        };
      }
    }
  }

  // 默认：允许（但需在调用处二次确认）
  return {
    allowed: true,
    reason: 'Action allowed (requires manual confirmation for production changes).',
    constraint: null,
  };
}

/**
 * 检查某个动作是否被硬编码禁止
 * @param {string} action
 * @returns {boolean}
 */
function isForbidden(action) {
  return FORBIDDEN_ACTIONS.indexOf((action || '').toLowerCase()) !== -1;
}

/**
 * 列出所有硬编码禁止项
 * @returns {string[]}
 */
function listForbiddenActions() {
  return FORBIDDEN_ACTIONS.slice();
}

/**
 * 强制检查（用于在关键执行前断言）
 * @param {string} action
 * @param {object} [context]
 * @throws {Error} 如果动作被禁止
 */
function assertAllowed(action, context) {
  var result = validateExecution(action, context);
  if (!result.allowed) {
    var err = new Error(result.reason);
    err.code = 'EXECUTION_POLICY_VIOLATION';
    err.constraint = result.constraint;
    throw err;
  }
}

module.exports = {
  validateExecution: validateExecution,
  isForbidden: isForbidden,
  listForbiddenActions: listForbiddenActions,
  assertAllowed: assertAllowed,
  FORBIDDEN_ACTIONS: FORBIDDEN_ACTIONS,
};
