'use strict';

/**
 * worker-feature-gate.js — 灰度开关
 *
 * 控制各 AI Worker 是否启用真实 API 调用。
 * 默认 false（mock 模式）。
 *
 * 环境变量:
 *   OPENAI_WORKER_ENABLED      — true/false (默认 false)
 *   DEEPSEEK_RUNTIME_ENABLED   — true/false (默认 false)
 *
 * Phase2-B: Worker Safety Layer
 * P12.4: multi-worker gate support
 */

const ENABLED = 'true';
const DISABLED = 'false';

var WORKER_GATES = {
  codex:     { env: 'OPENAI_WORKER_ENABLED',    label: 'OpenAI Worker' },
  deepseek:  { env: 'DEEPSEEK_RUNTIME_ENABLED',  label: 'DeepSeek Runtime' },
  doubao:    { env: 'DOUBAO_RUNTIME_ENABLED',    label: 'Doubao Runtime' },
  workbuddy: { env: 'WORKBUDDY_RUNTIME_ENABLED', label: 'WorkBuddy Runtime' },
};

/**
 * 检查灰度开关状态（通用：按 worker 查对应环境变量）
 * @param {string} [worker] - codex / deepseek / doubao / workbuddy
 * @returns {'enabled'|'disabled'}
 */
function getStatus(worker) {
  worker = worker || 'codex';
  var gate = WORKER_GATES[worker] || WORKER_GATES['codex'];
  var val = (process.env[gate.env] || DISABLED).toLowerCase();
  if (val === ENABLED || val === '1' || val === 'yes') {
    return 'enabled';
  }
  return 'disabled';
}

/**
 * 灰度开关是否已开启
 * @param {string} [worker]
 * @returns {boolean}
 */
function isEnabled(worker) {
  return getStatus(worker) === 'enabled';
}

/**
 * 执行灰度检查
 * @param {string|object} workerOrContext - worker 名称 或 { worker, taskId } 上下文
 * @param {string} [taskId] - 任务 ID（当第一个参数为 worker 名时）
 * @returns {{ allowed: boolean, reason: string }|null}
 */
function check(workerOrContext, taskId) {
  var worker;
  if (typeof workerOrContext === 'string') {
    worker = workerOrContext;
  } else if (workerOrContext && workerOrContext.worker) {
    worker = workerOrContext.worker;
  } else {
    worker = 'codex';
  }

  if (isEnabled(worker)) {
    return null; // 通过
  }

  var gate = WORKER_GATES[worker] || WORKER_GATES['codex'];
  return {
    allowed: false,
    blocked: true,
    reason: 'GATE_DISABLED: ' + gate.env + ' is not true',
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
