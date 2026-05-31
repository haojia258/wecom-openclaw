'use strict';

/**
 * worker-dispatch.js — /worker分发 command handler v0.1
 *
 * REVIEW_ONLY=true — 只做调度规划与审计，不自动执行生产变更。
 *
 * Commands:
 *   /worker分发 <任务描述>         — 分析任务，推荐 worker
 *   /dispatch <任务描述>           — alias
 *   /多节点调度 <任务描述>         — alias
 *   /workers                       — 列出所有 worker
 */

var desc = '多Worker分发: 任务分类/Worker推荐/风险评估 (REVIEW_ONLY)';

var workerRegistry;
try { workerRegistry = require('../orchestrator/worker-registry.js'); } catch (e) { /* optional */ }

/**
 * @param {object} ctx
 * @param {string} args
 * @returns {string}
 */
async function execute(ctx, args) {
  args = (args || '').trim();

  if (!workerRegistry) {
    return 'Worker Registry not available.';
  }

  // /workers — list all
  if (!args || args === 'list' || args === '列表') {
    return handleListWorkers();
  }

  // decompose and analyze
  return handleDispatch(args);
}

function handleListWorkers() {
  var workers = workerRegistry.listWorkers();
  var lines = ['# Worker Registry', '', 'REVIEW_ONLY=true', ''];

  lines.push('| Worker ID | Role | Provider | Approval | Description |');
  lines.push('|-----------|------|----------|----------|-------------|');
  workers.forEach(function (w) {
    lines.push('| ' + w.workerId + ' | ' + w.role + ' | ' + w.provider + ' | ' +
      (w.requiresHumanApproval ? 'Yes' : 'No') + ' | ' + w.description + ' |');
  });

  lines.push('');
  lines.push('Total workers: ' + workers.length);
  lines.push('Review-Only: true');

  return lines.join('\n');
}

function handleDispatch(taskDescription) {
  var forbidden = workerRegistry.detectForbiddenOps(taskDescription);
  var classification = workerRegistry.classifyTask(taskDescription);
  var worker = classification.worker;

  var lines = [];
  lines.push('# Worker Dispatch Analysis');
  lines.push('');

  // Task info
  lines.push('## Task');
  lines.push('');
  lines.push('```');
  lines.push(taskDescription);
  lines.push('```');
  lines.push('');

  // Classification
  lines.push('## Recommended Worker');
  lines.push('');
  lines.push('| Field | Value |');
  lines.push('|-------|-------|');
  lines.push('| Worker ID | ' + classification.workerId + ' |');
  if (worker) {
    lines.push('| Role | ' + worker.role + ' |');
    lines.push('| Provider | ' + worker.provider + ' |');
    lines.push('| Description | ' + worker.description + ' |');
  }
  lines.push('| Reason | ' + classification.reason + ' |');
  lines.push('');

  // Risk
  lines.push('## Risk Assessment');
  lines.push('');
  lines.push('| Field | Value |');
  lines.push('|-------|-------|');
  lines.push('| Risk Level | ' + classification.riskLevel + ' |');
  lines.push('| Requires Human Approval | ' + (classification.requiresHumanApproval ? 'Yes' : 'No') + ' |');
  lines.push('');

  // Forbidden Operations
  lines.push('## Forbidden Operations Check');
  lines.push('');
  if (forbidden.length > 0) {
    lines.push('⚠️  **FORBIDDEN OPERATIONS DETECTED:**');
    lines.push('');
    lines.push('| Keyword | Reason |');
    lines.push('|---------|--------|');
    forbidden.forEach(function (f) {
      lines.push('| `' + f.keyword + '` | ' + f.reason + ' |');
    });
  } else {
    lines.push('✅ No forbidden operations detected.');
  }
  lines.push('');

  // Worker permissions
  if (worker) {
    lines.push('## Worker Permissions');
    lines.push('');
    lines.push('| Allowed Scopes | Forbidden Actions |');
    lines.push('|---------------|-------------------|');
    var maxLen = Math.max(worker.allowedScopes.length, worker.forbiddenActions.length);
    for (var i = 0; i < maxLen; i++) {
      lines.push('| ' + (worker.allowedScopes[i] || '-') + ' | ' + (worker.forbiddenActions[i] || '-') + ' |');
    }
    lines.push('');
  }

  // Execution mode
  lines.push('## Execution Mode');
  lines.push('');
  lines.push('| Field | Value |');
  lines.push('|-------|-------|');
  lines.push('| Review Only | true |');
  lines.push('| Auto Execute | false |');
  lines.push('| Audit Required | true |');
  lines.push('');

  // Audit record
  lines.push('## Audit');
  lines.push('');
  lines.push('- Timestamp: ' + new Date().toISOString());
  lines.push('- Action: dispatch_analyzed');
  lines.push('- Worker: ' + classification.workerId);
  lines.push('- Risk: ' + classification.riskLevel);
  lines.push('- Forbidden: ' + (forbidden.length > 0 ? forbidden.map(function (f) { return f.keyword; }).join(', ') : 'none'));

  return lines.join('\n');
}

module.exports = { execute: execute, desc: desc };
