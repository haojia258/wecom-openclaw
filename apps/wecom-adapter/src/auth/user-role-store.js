'use strict';

/**
 * user-role-store.js - 用户角色存储 (P6.7.1)
 *
 * 从 data/user-roles.json 加载角色映射
 * 支持: 精确匹配 + "*" 通配默认角色
 */

const path = require('path');
const fs = require('fs');

const ROLES = {
  ADMIN: 'admin',
  OPERATOR: 'operator',
  VIEWER: 'viewer'
};

const ROLE_HIERARCHY = {
  admin: 3,
  operator: 2,
  viewer: 1
};

let _roleData = null;
let _roleFilePath = null;

/**
 * 获取角色配置路径
 */
function getRoleFilePath() {
  if (_roleFilePath) return _roleFilePath;
  _roleFilePath = path.join(__dirname, '..', '..', 'data', 'user-roles.json');
  return _roleFilePath;
}

/**
 * 加载角色配置（首次调用自动加载）
 */
function loadRoles() {
  if (_roleData) return _roleData;

  const filePath = getRoleFilePath();
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    _roleData = JSON.parse(raw);
    return _roleData;
  } catch (e) {
    // 文件不存在或 JSON 解析失败 → 默认空配置（所有人 viewer）
    _roleData = { admin: [], operator: [], viewer: ['*'] };
    return _roleData;
  }
}

/**
 * 重新加载角色配置（测试用）
 */
function reload() {
  _roleData = null;
  return loadRoles();
}

/**
 * 设置角色文件路径（测试用）
 */
function setRoleFilePath(filePath) {
  _roleFilePath = filePath;
  _roleData = null;
}

/**
 * 获取指定用户的角色
 * @param {string} userId - 用户标识（企业微信 userId）
 * @returns {string} 'admin' | 'operator' | 'viewer'
 */
function getRole(userId) {
  const roles = loadRoles();

  // 精确匹配 admin
  if (roles.admin && Array.isArray(roles.admin)) {
    if (roles.admin.indexOf(userId) !== -1) {
      return ROLES.ADMIN;
    }
  }

  // 精确匹配 operator
  if (roles.operator && Array.isArray(roles.operator)) {
    if (roles.operator.indexOf(userId) !== -1) {
      return ROLES.OPERATOR;
    }
  }

  // 精确匹配 viewer（显式列出）
  if (roles.viewer && Array.isArray(roles.viewer)) {
    if (roles.viewer.indexOf(userId) !== -1) {
      return ROLES.VIEWER;
    }
  }

  // "*" 通配 → viewer
  if (roles.viewer && Array.isArray(roles.viewer)) {
    if (roles.viewer.indexOf('*') !== -1) {
      return ROLES.VIEWER;
    }
  }

  // 默认 viewer
  return ROLES.VIEWER;
}

/**
 * 检查角色是否满足最低要求
 * @param {string} userRole - 用户角色
 * @param {string} requiredRole - 最低要求角色
 * @returns {boolean}
 */
function hasMinRole(userRole, requiredRole) {
  const userLevel = ROLE_HIERARCHY[userRole] || 0;
  const requiredLevel = ROLE_HIERARCHY[requiredRole] || 0;
  return userLevel >= requiredLevel;
}

module.exports = {
  ROLES,
  ROLE_HIERARCHY,
  getRole,
  hasMinRole,
  loadRoles,
  reload,
  setRoleFilePath
};
