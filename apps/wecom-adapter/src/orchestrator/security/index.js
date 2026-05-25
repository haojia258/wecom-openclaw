'use strict';

/**
 * security/index.js — AI Runtime PR Guardrails 统一入口
 *
 * 汇集所有安全守卫函数，提供单一导入接口：
 *
 *   var guard = require('../orchestrator/security');
 *   guard.redactSensitive(...)
 *   guard.normalizeCommandArgs(ctx, args)
 *   guard.normalizeWorkerResult(result)
 *   guard.assertReviewOnly(content)
 *   guard.assertNoDangerousActions(text)
 */

var sanitizeOutput = require('./sanitize-output');
var markdownSafe = require('./markdown-safe');
var commandArgs = require('./command-args');
var asyncWorkerResult = require('./async-worker-result');

module.exports = {
  // sanitize-output
  redactSensitive: sanitizeOutput.redactSensitive,

  // markdown-safe
  escapeMarkdown: markdownSafe.escapeMarkdown,
  sanitizeField: markdownSafe.sanitizeField,
  sanitizeOutput: markdownSafe.sanitizeOutput,
  truncateText: markdownSafe.truncateText,

  // command-args
  normalizeCommandArgs: commandArgs.normalizeCommandArgs,

  // async-worker-result
  normalizeWorkerResult: asyncWorkerResult.normalizeWorkerResult,
  assertReviewOnly: asyncWorkerResult.assertReviewOnly,
  assertNoDangerousActions: asyncWorkerResult.assertNoDangerousActions,
};
