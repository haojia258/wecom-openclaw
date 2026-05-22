/**
 * worker-layer.js
 * Runtime Expansion Phase1 - Worker Layer
 *
 * 固定 4 个 Worker 角色（不动态创建）
 * 禁止动态扩展 Worker。
 */

const { decompose, buildPlan } = require('./orchestrator-core');
const { checkScope } = require('./patch-policy');

// 固定 Worker 定义（硬编码，不动态创建）
const WORKERS = {
  'planner-worker': {
    role: 'planner',
    name: 'Planner Worker',
    capabilities: ['intent_analysis', 'task_graph', 'dag_planning', 'fallback_route'],
    description: '意图分析、任务规划、DAG 构建、回退路由',
  },
  'executor-worker': {
    role: 'executor',
    name: 'Executor Worker',
    capabilities: ['patch_generation', 'markdown_generation', 'script_generation', 'artifact_generation'],
    description: 'Patch 生成、Markdown 生成、脚本生成、产物生成',
  },
  'review-worker': {
    role: 'reviewer',
    name: 'Review Worker',
    capabilities: ['patch_review', 'diff_review', 'acceptance_check'],
    description: 'Patch 审查、Diff 审查、验收检查',
  },
  'risk-worker': {
    role: 'risk_analyzer',
    name: 'Risk Worker',
    capabilities: ['forbidden_scope_check', 'risk_scoring', 'rollback_suggestion'],
    description: '禁用范围检查、风险评分、回滚建议',
  },
};

const VALID_ROLES = Object.keys(WORKERS);

/**
 * 获取 Worker 定义
 * @param {string} role - Worker 角色名
 * @returns {object|null}
 */
function getWorker(role) {
  var r = (role || '').toLowerCase();
  if (!VALID_ROLES.includes(r)) {
    return null;
  }
  return Object.assign({ role: r }, WORKERS[r]);
}

/**
 * 列出所有 Worker
 * @returns {object[]}
 */
function listWorkers() {
  return Object.entries(WORKERS).map(function (entry) {
    var role = entry[0];
    var cfg = entry[1];
    return {
      role: role,
      name: cfg.name,
      capabilities: cfg.capabilities,
      description: cfg.description,
    };
  });
}

/**
 * 执行 Worker（按角色调度）
 * @param {string} role - Worker 角色名
 * @param {object} task - 任务对象
 * @returns {object} 执行结果
 */
function executeWorker(role, task) {
  var r = (role || '').toLowerCase();
  if (!VALID_ROLES.includes(r)) {
    return { error: 'Unknown worker role: ' + r + '. Valid: ' + VALID_ROLES.join(', ') };
  }

  switch (r) {
    case 'planner-worker':
      return executePlannerWorker(task);
    case 'executor-worker':
      return executeExecutorWorker(task);
    case 'review-worker':
      return executeReviewWorker(task);
    case 'risk-worker':
      return executeRiskWorker(task);
    default:
      return { error: 'Worker not implemented: ' + r };
  }
}

/**
 * Planner Worker 执行
 * 职责：intent 分析 / task graph / DAG 规划 / fallback route
 */
function executePlannerWorker(task) {
  var userRequest = (task && task.userRequest) || '';
  var decomposition = decompose(userRequest);
  var plan = buildPlan(decomposition);

  // Fallback route
  var primary = decomposition.recommendedAssignee || 'workbuddy';
  var allAssignees = ['workbuddy', 'codex', 'deepseek', 'doubao'];
  var fallback = allAssignees.filter(function (a) { return a !== primary; });

  return {
    role: 'planner-worker',
    intent: decomposition.intent || 'unknown',
    keywords: decomposition.keywords || [],
    plan: plan,
    fallback: {
      primary: primary,
      secondary: fallback,
    },
    executedAt: new Date().toISOString(),
  };
}

/**
 * Executor Worker 执行
 * 职责：patch / markdown / script / artifact generation
 * v0.4 约束：只生成 dispatch payload，不真实调用 AI API
 */
function executeExecutorWorker(task) {
  var payload = null;
  var error = null;

  try {
    var dispatcher = require('./worker-dispatcher');
    var result = dispatcher.generateDispatchPayload(task);
    if (result.error) {
      error = result.error;
    } else {
      payload = result.payload;
    }
  } catch (e) {
    error = e.message;
  }

  return {
    role: 'executor-worker',
    artifactType: 'dispatch_payload',
    payload: payload,
    error: error,
    executedAt: new Date().toISOString(),
    _note: 'v0.4 - executor worker generates payload only. No real AI API call.',
  };
}

/**
 * Review Worker 执行
 * 职责：patch review / diff review / acceptance check
 */
function executeReviewWorker(task) {
  var reviewResult = null;
  var error = null;

  try {
    var reviewPipeline = require('./review-pipeline');
    reviewResult = reviewPipeline.reviewTask(task);
  } catch (e) {
    error = e.message;
  }

  return {
    role: 'review-worker',
    review: reviewResult,
    error: error,
    executedAt: new Date().toISOString(),
  };
}

/**
 * Risk Worker 执行
 * 职责：forbidden scope / 风险评分 / rollback 建议
 */
function executeRiskWorker(task) {
  var result = {
    role: 'risk-worker',
    forbiddenScope: null,
    riskScore: null,
    rollbackSuggestion: null,
    executedAt: new Date().toISOString(),
  };

  // 1. 禁用范围检查
  try {
    result.forbiddenScope = checkScope(task.assignee || 'workbuddy', []);
  } catch (e) {
    result.forbiddenScope = { error: e.message };
  }

  // 2. 风险评分（尝试加载 risk-policy）
  try {
    var riskPolicy = null;
    try { riskPolicy = require('../review/risk-policy'); } catch (e) { /* ignore */ }

    if (riskPolicy && typeof riskPolicy.scoreRisk === 'function') {
      var score = riskPolicy.scoreRisk({
        files: [task.patchFile || ''],
        testCommandsRun: false,
        patchSize: 0,
      });
      var level = 'unknown';
      if (typeof riskPolicy.classifyRisk === 'function') {
        level = riskPolicy.classifyRisk(score);
      }
      result.riskScore = { score: score, level: level };
    }
  } catch (e) {
    result.riskScore = { error: e.message };
  }

  // 3. 回滚建议（需要 auditId）
  if (task.auditId) {
    try {
      var rollbackPlanner = require('./rollback-planner');
      result.rollbackSuggestion = rollbackPlanner.generateRollbackPlan({
        auditId: task.auditId,
        branch: task.branch || '',
      });
    } catch (e) {
      result.rollbackSuggestion = { error: e.message };
    }
  }

  return result;
}

module.exports = {
  getWorker: getWorker,
  listWorkers: listWorkers,
  executeWorker: executeWorker,
  VALID_ROLES: VALID_ROLES,
  WORKERS: WORKERS,
};
