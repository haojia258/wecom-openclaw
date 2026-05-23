'use strict';

/**
 * worker-feature-gate.js — 灰度开关
 *
 * 控制真实 OpenAI Worker 是否启用。
 * 默认 false（mock 模式）。
 *
 * 环境变量:
 *   OPENAI_WORKER_ENABLED — true / false (默认 false)
 *
 * Phase2-B: Worker Safety Layer
 */

const ENABLED = 'true';
const DISABLED = 'false';

/**
 * 检查灰度开关状态
 * @returns {'enabled'|'disabled'} 当前开关状态
 */
function getStatus() {
  var val = (process.env.OPENAI_WORKER_ENABLED || DISABLED).toLowerCase();
  if (val === ENABLED || val === '1' || val === 'yes') {
    return 'enabled';
  }
  return 'disabled';
}

/**
 * 灰度开关是否已开启
 * @returns {boolean}
 */
function isEnabled() {
  return getStatus() === 'enabled';
}

/**
 * 执行灰度检查
 * 如果未开启，返回拒绝原因；如果已开启，返回 null
 *
 * @param {object} [context] - 可选上下文 { taskId, assignee }
 * @returns {{ allowed: boolean, reason: string }|null} 未开启时返回拒绝对象，已开启时返回 null
 */
function check(context) {
  if (isEnabled()) {
    return null; // 通过，允许继续
  }
  return {
    allowed: false,
    reason: 'GATE_DISABLED: OPENAI_WORKER_ENABLED is not true',
  };
}

module.exports = {
  getStatus: getStatus,
  isEnabled: isEnabled,
  check: check,
  // 常量
  ENABLED: ENABLED,
  DISABLED: DISABLED,
};
