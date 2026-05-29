'use strict';

/**
 * failure-classifier.js - P10.2 失败分类器
 *
 * 职责:
 * - 根据 event_type / error_message / exit_code 识别失败类型
 * - 判断是否可恢复
 * - 推荐恢复动作 (retry / rollback / manual_review)
 *
 * 失败类型:
 *   network       - 网络连接错误 (ECONNREFUSED, ENOTFOUND)
 *   timeout       - 超时错误 (ETIMEDOUT, exit code 124)
 *   validation    - 校验/模式错误
 *   governance    - 治理/策略拒绝
 *   runtime_crash - 运行时崩溃 (SIGSEGV, SIGABRT, 非零退出码)
 *   unknown       - 无法分类
 */

// ─── 分类规则表 (按优先级顺序匹配) ─────────────────────────

var CLASSIFICATION_RULES = [
  // 超时
  {
    name: 'timeout',
    match: function(eventType, errorMessage, exitCode) {
      var msg = (errorMessage || '').toLowerCase();
      var type = (eventType || '').toLowerCase();
      return msg.indexOf('etimedout') !== -1 ||
             msg.indexOf('timed out') !== -1 ||
             msg.indexOf('timeout') !== -1 ||
             type.indexOf('timeout') !== -1 ||
             exitCode === 124;
    },
    failureType: 'timeout',
    recoverable: true,
    recommendedAction: 'retry'
  },

  // 网络
  {
    name: 'network',
    match: function(eventType, errorMessage, exitCode) {
      var msg = (errorMessage || '').toLowerCase();
      var type = (eventType || '').toLowerCase();
      return msg.indexOf('econnrefused') !== -1 ||
             msg.indexOf('enotfound') !== -1 ||
             msg.indexOf('econnreset') !== -1 ||
             msg.indexOf('network') !== -1 ||
             msg.indexOf('dns') !== -1 ||
             msg.indexOf('eai_again') !== -1 ||
             type.indexOf('network') !== -1;
    },
    failureType: 'network',
    recoverable: true,
    recommendedAction: 'retry'
  },

  // 校验/模式错误
  {
    name: 'validation',
    match: function(eventType, errorMessage, exitCode) {
      var msg = (errorMessage || '').toLowerCase();
      var type = (eventType || '').toLowerCase();
      return msg.indexOf('validation') !== -1 ||
             msg.indexOf('schema') !== -1 ||
             msg.indexOf('invalid') !== -1 ||
             msg.indexOf('malformed') !== -1 ||
             type.indexOf('validation') !== -1 ||
             exitCode === 1;
    },
    failureType: 'validation',
    recoverable: false,
    recommendedAction: 'manual_review'
  },

  // 治理/策略拒绝
  {
    name: 'governance',
    match: function(eventType, errorMessage, exitCode) {
      var msg = (errorMessage || '').toLowerCase();
      var type = (eventType || '').toLowerCase();
      return msg.indexOf('governance') !== -1 ||
             msg.indexOf('policy') !== -1 ||
             msg.indexOf('rejected') !== -1 ||
             msg.indexOf('denied') !== -1 ||
             msg.indexOf('not authorized') !== -1 ||
             msg.indexOf('forbidden') !== -1 ||
             type.indexOf('governance') !== -1;
    },
    failureType: 'governance',
    recoverable: false,
    recommendedAction: 'manual_review'
  },

  // 运行时崩溃
  {
    name: 'runtime_crash',
    match: function(eventType, errorMessage, exitCode) {
      var msg = (errorMessage || '').toLowerCase();
      var type = (eventType || '').toLowerCase();
      // 关键词匹配: 崩溃信号、内存错误
      var keywordMatch = msg.indexOf('crash') !== -1 ||
             msg.indexOf('sigsegv') !== -1 ||
             msg.indexOf('sigabrt') !== -1 ||
             msg.indexOf('sigkill') !== -1 ||
             msg.indexOf('segmentation fault') !== -1 ||
             msg.indexOf('out of memory') !== -1 ||
             type.indexOf('crash') !== -1;
      // 精确 exit code 匹配: 137=SIGKILL, 139=SIGSEGV, 143=SIGTERM
      var crashExitCodes = [137, 139, 143];
      var exitMatch = exitCode !== null && exitCode !== undefined && crashExitCodes.indexOf(exitCode) !== -1;
      return keywordMatch || exitMatch;
    },
    failureType: 'runtime_crash',
    recoverable: true,
    recommendedAction: 'retry'
  }
];

// ─── 所有已知类型 ──────────────────────────────────────────

var KNOWN_TYPES = [];
for (var i = 0; i < CLASSIFICATION_RULES.length; i++) {
  KNOWN_TYPES.push(CLASSIFICATION_RULES[i].failureType);
}
KNOWN_TYPES.push('unknown');

// ─── 分类函数 ──────────────────────────────────────────────

/**
 * 分类失败并返回诊断结果
 *
 * @param {string}  eventType     - 触发事件类型
 * @param {string}  errorMessage  - 错误消息文本
 * @param {number}  exitCode      - 进程退出码 (null 表示无)
 * @returns {{
 *   failure_type: string,
 *   recoverable: boolean,
 *   recommended_action: string,
 *   matched_rule: string
 * }}
 */
function classifyFailure(eventType, errorMessage, exitCode) {
  // 按优先级顺序匹配规则
  for (var i = 0; i < CLASSIFICATION_RULES.length; i++) {
    var rule = CLASSIFICATION_RULES[i];
    if (rule.match(eventType, errorMessage, exitCode)) {
      return {
        failure_type: rule.failureType,
        recoverable: rule.recoverable,
        recommended_action: rule.recommendedAction,
        matched_rule: rule.name
      };
    }
  }

  // 默认：未知类型
  return {
    failure_type: 'unknown',
    recoverable: false,
    recommended_action: 'manual_review',
    matched_rule: 'fallback'
  };
}

/**
 * 判断指定类型是否可恢复
 * @param {string} failureType
 * @returns {boolean}
 */
function isRecoverable(failureType) {
  return failureType === 'network' || failureType === 'timeout' || failureType === 'runtime_crash';
}

/**
 * 获取已知失败类型列表
 * @returns {string[]}
 */
function getKnownTypes() {
  return KNOWN_TYPES.slice();
}

// ─── 导出 ─────────────────────────────────────────────────

module.exports = {
  classifyFailure: classifyFailure,
  isRecoverable: isRecoverable,
  getKnownTypes: getKnownTypes,
  CLASSIFICATION_RULES: CLASSIFICATION_RULES
};
