'use strict';

/**
 * worker-registry.js — P16 Multi-Worker Dispatch Layer v0.1
 *
 * REVIEW_ONLY=true — no auto-deploy, no config changes.
 *
 * Defines fixed worker configurations with permissions, scopes, and safety rules.
 */

// ═══════════════════════════════════════════
// Worker Definitions
// ═══════════════════════════════════════════

var WORKERS = {
  'planner-worker': {
    workerId: 'planner-worker',
    role: 'planner',
    provider: 'openai',
    description: '任务规划与分解',
    permissions: ['plan', 'decompose', 'estimate'],
    requiresHumanApproval: true,
    reviewOnly: true,
    allowedScopes: ['task_planning', 'goal_decomposition', 'timeline_estimation'],
    forbiddenActions: ['deploy', 'merge', 'modify_config', 'execute_production']
  },
  'analysis-worker': {
    workerId: 'analysis-worker',
    role: 'analysis',
    provider: 'deepseek',
    description: '数据分析与洞察',
    permissions: ['analyze', 'report', 'visualize'],
    requiresHumanApproval: false,
    reviewOnly: true,
    allowedScopes: ['data_analysis', 'trend_detection', 'anomaly_check'],
    forbiddenActions: ['deploy', 'merge', 'modify_config', 'modify_data']
  },
  'content-worker': {
    workerId: 'content-worker',
    role: 'content',
    provider: 'doubao',
    description: '内容生成与创作',
    permissions: ['generate', 'rewrite', 'translate'],
    requiresHumanApproval: false,
    reviewOnly: true,
    allowedScopes: ['text_generation', 'content_creation', 'translation'],
    forbiddenActions: ['deploy', 'merge', 'publish_live', 'modify_live_content']
  },
  'risk-worker': {
    workerId: 'risk-worker',
    role: 'risk',
    provider: 'deepseek',
    description: '风险评估与审计',
    permissions: ['audit', 'assess', 'flag'],
    requiresHumanApproval: true,
    reviewOnly: true,
    allowedScopes: ['risk_assessment', 'compliance_check', 'security_audit'],
    forbiddenActions: ['deploy', 'merge', 'modify_policy', 'bypass_approval']
  },
  'review-worker': {
    workerId: 'review-worker',
    role: 'review',
    provider: 'deepseek',
    description: '代码审查与质量检查',
    permissions: ['review', 'validate', 'comment'],
    requiresHumanApproval: true,
    reviewOnly: true,
    allowedScopes: ['code_review', 'quality_check', 'test_validation'],
    forbiddenActions: ['deploy', 'merge', 'push_force', 'modify_ci']
  },
  'memory-worker': {
    workerId: 'memory-worker',
    role: 'memory',
    provider: 'openai',
    description: '记忆存储与检索',
    permissions: ['store', 'retrieve', 'index'],
    requiresHumanApproval: false,
    reviewOnly: true,
    allowedScopes: ['memory_write', 'memory_read', 'context_indexing'],
    forbiddenActions: ['deploy', 'merge', 'delete_critical_memory', 'purge_index']
  },
  'node-a-worker': {
    workerId: 'node-a-worker',
    role: 'node-a',
    provider: 'deepseek',
    description: '节点A执行器 (开发/测试/部署)',
    permissions: ['develop', 'test', 'build'],
    requiresHumanApproval: true,
    reviewOnly: true,
    allowedScopes: ['development', 'testing', 'artifact_generation'],
    forbiddenActions: ['deploy', 'merge', 'modify_env', 'modify_nginx', 'pm2_restart', 'systemctl_restart']
  }
};

// ═══════════════════════════════════════════
// Task Classification Rules
// ═══════════════════════════════════════════

var CLASSIFICATION_RULES = [
  // Higher-priority rules first: safety-related detections before generic ones
  {
    keywords: ['风险', '审计', '安全', '合规', '扫描', 'audit', 'risk', 'security', 'compliance'],
    worker: 'risk-worker',
    riskLevel: '中风险',
    reason: '风险评估需要人工确认'
  },
  {
    keywords: ['审查', 'review', '代码审查', '质量', '测试', '验证', 'test', 'validate', 'check'],
    worker: 'review-worker',
    riskLevel: '低风险',
    reason: '只读审查操作'
  },
  {
    keywords: ['开发', '代码', '实现', '构建', '编写', '模块', 'feature', 'implement', 'build'],
    worker: 'node-a-worker',
    riskLevel: '中风险',
    reason: '开发类任务需要人工审批'
  },
  {
    keywords: ['内容', '文案', '脚本', '翻译', '视频', '文章', '生成', '写作', 'content', 'write', 'generate'],
    worker: 'content-worker',
    riskLevel: '低风险',
    reason: '内容生成不涉及系统变更'
  },
  {
    keywords: ['规划', '计划', '拆解', '任务分配', '调度', '安排', 'plan', 'schedule', 'decompose'],
    worker: 'planner-worker',
    riskLevel: '低风险',
    reason: '规划类任务只产出计划'
  },
  {
    keywords: ['分析', '数据', '报告', '报表', '统计', 'analyze', 'report', 'insight'],
    worker: 'analysis-worker',
    riskLevel: '低风险',
    reason: '只读数据分析'
  },
  {
    keywords: ['记忆', '存档', '索引', '检索', '上下文', 'memory', 'context', 'recall', 'store'],
    worker: 'memory-worker',
    riskLevel: '低风险',
    reason: '记忆操作不涉及变更'
  }
];

// ═══════════════════════════════════════════
// Forbidden Operations Mapping
// ═══════════════════════════════════════════

var FORBIDDEN_KEYWORDS = [
  { keyword: '下单', reason: '禁止自动下单' },
  { keyword: '报名活动', reason: '禁止自动报名' },
  { keyword: '修改商品', reason: '禁止修改商品' },
  { keyword: '修改价格', reason: '禁止修改价格' },
  { keyword: '修改库存', reason: '禁止修改库存' },
  { keyword: '.env', reason: '禁止修改配置' },
  { keyword: 'nginx', reason: '禁止修改 nginx' },
  { keyword: 'deploy', reason: '禁止生产部署' },
  { keyword: 'merge', reason: '禁止自动合并' },
  { keyword: 'pm2', reason: '禁止重启服务' },
  { keyword: 'systemctl', reason: '禁止系统操作' }
];

// ═══════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════

/**
 * Get all registered workers
 */
function listWorkers() {
  return Object.keys(WORKERS).map(function (k) {
    var w = WORKERS[k];
    return {
      workerId: w.workerId,
      role: w.role,
      provider: w.provider,
      description: w.description,
      requiresHumanApproval: w.requiresHumanApproval,
      reviewOnly: w.reviewOnly
    };
  });
}

/**
 * Get single worker by ID
 */
function getWorker(workerId) {
  return WORKERS[workerId] || null;
}

/**
 * Classify a task description to find the best worker
 */
function classifyTask(taskDescription) {
  var text = (taskDescription || '').toLowerCase();

  for (var i = 0; i < CLASSIFICATION_RULES.length; i++) {
    var rule = CLASSIFICATION_RULES[i];
    for (var j = 0; j < rule.keywords.length; j++) {
      if (text.indexOf(rule.keywords[j].toLowerCase()) >= 0) {
        var worker = getWorker(rule.worker);
        return {
          workerId: rule.worker,
          worker: worker,
          riskLevel: rule.riskLevel,
          reason: rule.reason,
          requiresHumanApproval: worker ? worker.requiresHumanApproval : true
        };
      }
    }
  }

  // Default: planner-worker for unknown tasks
  var def = getWorker('planner-worker');
  return {
    workerId: 'planner-worker',
    worker: def,
    riskLevel: '中风险',
    reason: '未匹配特定规则，默认由 planner-worker 处理',
    requiresHumanApproval: true
  };
}

/**
 * Check for forbidden operations in task description
 */
function detectForbiddenOps(taskDescription) {
  var text = (taskDescription || '').toLowerCase();
  var detected = [];
  FORBIDDEN_KEYWORDS.forEach(function (rule) {
    if (text.indexOf(rule.keyword.toLowerCase()) >= 0) {
      detected.push({ keyword: rule.keyword, reason: rule.reason });
    }
  });
  return detected;
}

/**
 * Validate worker registry integrity
 */
function validateRegistry() {
  var errors = [];
  var ids = Object.keys(WORKERS);

  if (ids.length === 0) {
    errors.push('Registry is empty');
  }

  ids.forEach(function (id) {
    var w = WORKERS[id];
    if (w.workerId !== id) {
      errors.push(id + ': workerId mismatch (' + w.workerId + ')');
    }
    if (!w.role) {
      errors.push(id + ': missing role');
    }
    if (!w.provider) {
      errors.push(id + ': missing provider');
    }
    if (!Array.isArray(w.permissions) || w.permissions.length === 0) {
      errors.push(id + ': missing or empty permissions');
    }
    if (!Array.isArray(w.forbiddenActions) || w.forbiddenActions.length === 0) {
      errors.push(id + ': missing or empty forbiddenActions');
    }
    if (!Array.isArray(w.allowedScopes) || w.allowedScopes.length === 0) {
      errors.push(id + ': missing or empty allowedScopes');
    }
  });

  if (CLASSIFICATION_RULES.length === 0) {
    errors.push('No classification rules defined');
  }

  CLASSIFICATION_RULES.forEach(function (rule, i) {
    if (!getWorker(rule.worker)) {
      errors.push('classification rule ' + i + ' references unknown worker: ' + rule.worker);
    }
  });

  return {
    valid: errors.length === 0,
    workerCount: ids.length,
    ruleCount: CLASSIFICATION_RULES.length,
    errors: errors
  };
}

module.exports = {
  listWorkers: listWorkers,
  getWorker: getWorker,
  classifyTask: classifyTask,
  detectForbiddenOps: detectForbiddenOps,
  validateRegistry: validateRegistry
};
