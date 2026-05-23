'use strict';

/**
 * worker-allowlist.js — 白名单任务限制
 *
 * 限制哪些任务类型可以使用真实 OpenAI Worker。
 *
 * 允许 (allowlist):
 *   - review
 *   - summary
 *   - analysis
 *   - planner
 *
 * 禁止 (blocklist):
 *   - patch
 *   - apply
 *   - deploy
 *   - rollback
 *   - nginx
 *   - env
 *
 * 命中禁止词 → 直接 reject。
 *
 * Phase2-B: Worker Safety Layer
 */

var ALLOWED_KEYWORDS = ['review', 'summary', 'analysis', 'planner'];

var BLOCKED_KEYWORDS = [
  'patch',
  'apply',
  'deploy',
  'rollback',
  'nginx',
  'env',
  '.env',
  '部署',
  '上线',
  '发布到生产',
  '生产环境',
  '回滚',
  '撤回',
  '补丁',
  '应用补丁',
  'apply补丁',
  '修改环境变量',
  '环境变量',
  '配置文件',
  '企业微信主链路',
  '加密解密',
  '解密',
  'nginx配置'
];

/**
 * 从任务文本中提取关键词
 * 检查 userRequest、patchFile、branchName 等字段
 *
 * @param {object} task - 任务对象
 * @returns {string} 提取到的文本（小写）
 */
function extractTaskText(task) {
  var parts = [];
  if (task.userRequest) {
    parts.push(task.userRequest);
  }
  if (task.patchFile) {
    parts.push(task.patchFile);
  }
  if (task.branchName) {
    parts.push(task.branchName);
  }
  if (task.description) {
    parts.push(task.description);
  }
  return parts.join(' ').toLowerCase();
}

/**
 * 检查任务是否在允许范围内
 *
 * @param {object} task - 任务对象
 * @returns {{ allowed: boolean, reason?: string, matchedKeyword?: string }}
 */
function check(task) {
  var text = extractTaskText(task);

  // 1. 先检查禁止关键词
  for (var i = 0; i < BLOCKED_KEYWORDS.length; i++) {
    var blocked = BLOCKED_KEYWORDS[i];
    if (text.indexOf(blocked) !== -1) {
      return {
        allowed: false,
        reason: 'BLOCKED_KEYWORD: 命中禁止词 "' + blocked + '"',
        matchedKeyword: blocked,
      };
    }
  }

  // 2. 检查允许关键词
  var matchedAllow = null;
  for (var j = 0; j < ALLOWED_KEYWORDS.length; j++) {
    var allowed = ALLOWED_KEYWORDS[j];
    if (text.indexOf(allowed) !== -1) {
      matchedAllow = allowed;
      break;
    }
  }

  if (!matchedAllow) {
    return {
      allowed: false,
      reason: 'NOT_IN_ALLOWLIST: 任务类型不在白名单中 (允许: ' + ALLOWED_KEYWORDS.join(', ') + ')',
    };
  }

  // 3. 通过
  return {
    allowed: true,
    matchedKeyword: matchedAllow,
  };
}

/**
 * 检查文本是否包含允许关键词（宽松模式）
 * @param {string} text
 * @returns {boolean}
 */
function isAllowedText(text) {
  if (!text) return false;
  var lower = text.toLowerCase();

  // 先查禁止
  for (var i = 0; i < BLOCKED_KEYWORDS.length; i++) {
    if (lower.indexOf(BLOCKED_KEYWORDS[i]) !== -1) {
      return false;
    }
  }

  // 再查允许
  for (var j = 0; j < ALLOWED_KEYWORDS.length; j++) {
    if (lower.indexOf(ALLOWED_KEYWORDS[j]) !== -1) {
      return true;
    }
  }
  return false;
}

/**
 * 获取允许和禁止的关键词列表
 * @returns {{ allowed: string[], blocked: string[] }}
 */
function getKeywordLists() {
  return {
    allowed: ALLOWED_KEYWORDS.slice(),
    blocked: BLOCKED_KEYWORDS.slice(),
  };
}

module.exports = {
  check: check,
  isAllowedText: isAllowedText,
  getKeywordLists: getKeywordLists,
  // 常量
  ALLOWED_KEYWORDS: ALLOWED_KEYWORDS,
  BLOCKED_KEYWORDS: BLOCKED_KEYWORDS,
};
