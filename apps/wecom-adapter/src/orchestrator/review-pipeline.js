/**
 * review-pipeline.js
 * AI Orchestrator Runtime Review 流水线 v0.6
 *
 * 接入已有模块：
 *   - patch-policy.js (范围校验)
 *   - risk-policy.js (风险评估)
 *   - patch-manager.js (patch 审计)
 *
 * v0.6: 读取 WorkBuddy artifact (workbuddy-output.md)，
 *       非 patch 输出不再误判为 high risk。
 * v0.5: drop auto-apply; normalize patches to os.EOL for Windows
 * v0.4: 只输出 review result，不执行 apply。
 */

var fs = require('fs');
var path = require('path');

let patchPolicy = null;
let riskPolicy = null;
let patchManager = null;

/**
 * 尝试加载已有模块（可选依赖）
 */
function _tryLoad(modulePath) {
  try {
    return require(modulePath);
  } catch (e) {
    return null;
  }
}

function _initModules() {
  if (patchPolicy === null) {
    patchPolicy = _tryLoad('./patch-policy');
  }
  if (riskPolicy === null) {
    riskPolicy = _tryLoad('../review/risk-policy');
  }
  if (patchManager === null) {
    patchManager = _tryLoad('../lib/patch-manager');
  }
}

/**
 * Review 一个任务
 *
 * @param {object} task - 任务对象
 * @returns {object} review result
 */
function reviewTask(task) {
  _initModules();

  const results = [];

  // 1. Patch Policy 检查
  if (patchPolicy && patchPolicy.checkScope) {
    const assignee = task.assignee || 'workbuddy';
    const scopeResult = patchPolicy.checkScope(assignee);
    if (scopeResult) {
      results.push({
        source: 'patch-policy',
        type: 'scope_check',
        result: scopeResult,
      });
    }
  }

  // 2. Risk Policy 检查
  if (riskPolicy) {
    // 尝试用新 API
    if (typeof riskPolicy.scoreRisk === 'function') {
      // 构建 files 数组（移除空字符串）
      const files = [];
      if (task.patchFile) files.push(task.patchFile);

      // 读取所有 Runtime artifact 输出（按优先级）
      let aiOutput = '';
      const artifactPaths = [
        path.join(__dirname, '..', '..', 'storage', 'orchestrator', 'artifacts', task.taskId, 'codex-output.md'),
        path.join(__dirname, '..', '..', 'storage', 'orchestrator', 'artifacts', task.taskId, 'openai-output.md'),
        path.join(__dirname, '..', '..', 'storage', 'orchestrator', 'artifacts', task.taskId, 'output.txt'),
        path.join(__dirname, '..', '..', 'storage', 'orchestrator', 'artifacts', task.taskId, 'workbuddy-output.md'),
        path.join(__dirname, '..', '..', 'storage', 'orchestrator', 'artifacts', task.taskId, 'deepseek-output.md'),
        path.join(__dirname, '..', '..', 'storage', 'orchestrator', 'artifacts', task.taskId, 'doubao-output.md'),
      ];
      try {
        for (var ai = 0; ai < artifactPaths.length; ai++) {
          if (fs.existsSync(artifactPaths[ai])) {
            var content = fs.readFileSync(artifactPaths[ai], 'utf-8');
            if (content && content.trim().length > 0) {
              aiOutput = content;
              break; // 使用第一个可读的 artifact
            }
          }
        }
      } catch (_) {
        // 静默回退
      }

      const riskInput = {
        files,
        patchSize: task.patchSize || (files.length > 0 ? files.length : 0),
        testCommandsRun: task.testCommandsRun || false,
        aiOutput,
      };
      try {
        const scoreResult = riskPolicy.scoreRisk(riskInput);
        const score = scoreResult.riskScore;
        const level = riskPolicy.classifyRisk ? riskPolicy.classifyRisk(score) : 'unknown';
        results.push({
          source: 'risk-policy',
          type: 'risk_score',
          score,
          level,
        });
      } catch (e) {
        results.push({
          source: 'risk-policy',
          type: 'risk_score',
          error: e.message,
        });
      }
    }
    // 兼容旧 API
    else if (typeof riskPolicy.analyzeRisk === 'function') {
      try {
        const riskResult = riskPolicy.analyzeRisk([]);
        results.push({
          source: 'risk-policy',
          type: 'risk_analysis',
          result: riskResult,
        });
      } catch (e) {
        results.push({
          source: 'risk-policy',
          type: 'risk_analysis',
          error: e.message,
        });
      }
    }
  }

  // 3. Patch Manager 审计（如存在）
  if (patchManager && typeof patchManager.audit === 'function') {
    try {
      const auditResult = patchManager.audit(''); // 空 patch 则跳过
      results.push({
        source: 'patch-manager',
        type: 'patch_audit',
        result: auditResult,
      });
    } catch (e) {
      results.push({
        source: 'patch-manager',
        type: 'patch_audit',
        error: e.message,
      });
    }
  }

  // 4. 汇总
  const risks = results.filter((r) => r.type === 'risk_score' || r.type === 'risk_analysis');
  const scopeChecks = results.filter((r) => r.type === 'scope_check');
  const violations = [];

  if (scopeChecks.length > 0) {
    const sc = scopeChecks[0].result;
    if (sc.violations && sc.violations.length > 0) {
      violations.push(...sc.violations);
    }
  }

  const recommendation = buildRecommendation(results, violations, task);

  return {
    taskId: task.taskId,
    reviewedAt: new Date().toISOString(),
    results,
    violations,
    overallRisk: computeOverallRisk(results),
    recommendation,
    safe: violations.length === 0 && recommendation !== 'reject',
    _note: 'v0.6 — WorkBuddy artifact-aware review. No patch applied.',
  };
}

/**
 * 计算总体风险等级
 */
function computeOverallRisk(results) {
  const riskResult = results.find((r) => r.type === 'risk_score');
  if (riskResult && riskResult.score !== undefined) {
    if (riskResult.score >= 80) return 'high';
    if (riskResult.score >= 40) return 'medium';
    return 'low';
  }

  // fallback
  const violations = results
    .filter((r) => r.type === 'scope_check')
    .flatMap((r) => (r.result && r.result.violations) || []);

  if (violations.length > 0) return 'high';
  return 'low';
}

/**
 * 构建审批建议
 */
function buildRecommendation(results, violations, task) {
  if (violations.length > 0) {
    return 'reject';
  }

  const riskResult = results.find((r) => r.type === 'risk_score');
  if (riskResult && riskResult.score !== undefined) {
    if (riskResult.score >= 80) return 'reject';
    if (riskResult.score >= 40) return 'review_required';
  }

  if (!task.patchFile && !task.branch) {
    return 'approve'; // 无代码变更，可审批
  }

  return 'review_required';
}

/**
 * 格式化 review 结果为可读文本
 */
function formatReviewForWecom(result) {
  const lines = [
    `📋 审查结果`,
    ``,
    `Task ID: ${result.taskId}`,
    `审查时间: ${result.reviewedAt}`,
    `总体风险: ${result.overallRisk}`,
    `建议: ${result.recommendation === 'approve' ? '✅ 通过' : result.recommendation === 'reject' ? '❌ 拒绝' : '⚠️ 需人工审核'}`,
    ``,
  ];

  if (result.violations.length > 0) {
    lines.push(`🚫 违规项:`);
    result.violations.forEach((v, i) => {
      lines.push(`  ${i + 1}. ${v}`);
    });
    lines.push(``);
  }

  result.results.forEach((r) => {
    if (r.error) {
      lines.push(`⚠️ ${r.source}: ${r.error}`);
    } else if (r.score !== undefined) {
      lines.push(`📊 ${r.source}: 风险分=${r.score}, 等级=${r.level}`);
    }
  });

  lines.push(``);
  lines.push(`💡 v0.6 — WorkBuddy artifact-aware。非 patch 输出按内容评分，避免空 patch 误判。`);

  return lines.join('\n');
}

module.exports = {
  reviewTask,
  formatReviewForWecom,
  computeOverallRisk,
  buildRecommendation,
};
