'use strict';

/**
 * rbac.js - 角色权限控制核心 (P6.7.1)
 *
 * 提供命令级和 confirm 级权限检查
 * 集成 user-role-store 进行角色查询
 */

const { getRole, ROLES, hasMinRole } = require('./user-role-store');

// ─── 命令权限白名单 ──────────────────────────────────────────

/**
 * viewer/operator 可访问的命令白名单
 * 包含主命令及其所有别名
 */
const VIEWER_COMMANDS = [
  // 主命令
  '/目标',
  '/帮助',
  '/状态',
  '/进度',
  '/任务列表',
  // 别名（确保别名也被 RBAC 识别）
  '/goal',
  '/计划',
  '/拆解',
  '/help',
  '/菜单',
  '/HELP',
  '/status',
  '/STATUS',
  '/progress',
  '/任务进度',
  '/tasklist',
  '/所有任务',
  '/总控',
  '/commander',
  '/总控台'
];

// 标准化：去重
const VIEWER_COMMAND_SET = {};
VIEWER_COMMANDS.forEach(function(cmd) {
  VIEWER_COMMAND_SET[cmd] = true;
});

// ─── Confirm 权限白名单 ──────────────────────────────────────

const OPERATOR_CONFIRMS = {
  'confirm:audit': true,
  'confirm:review': true
};

const ADMIN_CONFIRMS = {
  'confirm:audit': true,
  'confirm:review': true,
  'confirm:create-pr': true
};

// ─── 权限检查函数 ────────────────────────────────────────────

/**
 * 检查用户是否可以访问指定命令
 * @param {string} userId - 用户标识
 * @param {string} commandName - 命令名（如 '/任务'）
 * @returns {{ allowed: boolean, error?: string }}
 */
function canAccessCommand(userId, commandName) {
  const role = getRole(userId);

  // admin 可以访问所有命令
  if (role === ROLES.ADMIN) {
    return { allowed: true };
  }

  // operator 和 viewer 仅限白名单
  if (VIEWER_COMMAND_SET[commandName]) {
    return { allowed: true };
  }

  return {
    allowed: false,
    error: '[RBAC] 权限不足: ' + commandName + ' 需要 admin 权限，当前角色: ' + role
  };
}

/**
 * 检查用户是否可以使用 confirm: 操作
 * @param {string} userId - 用户标识
 * @param {string} confirmAction - confirm 操作名（如 'confirm:audit'）
 * @returns {{ allowed: boolean, error?: string }}
 */
function canUseConfirm(userId, confirmAction) {
  const role = getRole(userId);

  if (role === ROLES.ADMIN) {
    // admin 可以使用所有 confirm 操作
    if (ADMIN_CONFIRMS[confirmAction]) {
      return { allowed: true };
    }
    return {
      allowed: false,
      error: '[RBAC] 未知的 confirm 操作: ' + confirmAction
    };
  }

  if (role === ROLES.OPERATOR) {
    if (OPERATOR_CONFIRMS[confirmAction]) {
      return { allowed: true };
    }
    return {
      allowed: false,
      error: '[RBAC] 权限不足: ' + confirmAction + ' 需要 admin 权限，当前角色: operator'
    };
  }

  // viewer 无法使用任何 confirm 操作
  return {
    allowed: false,
    error: '[RBAC] 权限不足: ' + confirmAction + ' 需要 operator+ 权限，当前角色: viewer'
  };
}

/**
 * 检查用户角色是否满足最低要求
 * @param {string} userId - 用户标识
 * @param {string} requiredRole - 最低要求角色
 * @returns {boolean}
 */
function hasMinRoleForUser(userId, requiredRole) {
  const role = getRole(userId);
  return hasMinRole(role, requiredRole);
}

/**
 * 获取用户角色名（供外部使用）
 * @param {string} userId
 * @returns {string}
 */
function getUserRole(userId) {
  return getRole(userId);
}

module.exports = {
  canAccessCommand,
  canUseConfirm,
  hasMinRoleForUser,
  getUserRole,
  ROLES,
  VIEWER_COMMANDS,
  VIEWER_COMMAND_SET
};
