/**
 * P9.5.3 Mission Compiler MVP — mission-compiler-types.js
 * Mission draft data types, constants, and factory functions
 */

const MISSION_DRAFT_STATUS = {
  DRAFT: 'draft',
  REVIEWED: 'reviewed',
  REJECTED: 'rejected',
  ARCHIVED: 'archived'
};

const MISSION_CATEGORIES = {
  COMMERCE: 'commerce',
  OPERATIONS: 'operations',
  MARKETING: 'marketing',
  CUSTOMER: 'customer',
  DEVOPS: 'devops',
  FINANCE: 'finance'
};

const RECOMMENDED_AGENTS = {
  CODEX: 'codex',
  WORKBUDDY: 'workbuddy',
  DEEPSEEK: 'deepseek',
  DOUBAO: 'doubao'
};

// Category → default agent mapping
const CATEGORY_AGENT_MAP = {
  [MISSION_CATEGORIES.COMMERCE]: RECOMMENDED_AGENTS.CODEX,
  [MISSION_CATEGORIES.OPERATIONS]: RECOMMENDED_AGENTS.WORKBUDDY,
  [MISSION_CATEGORIES.MARKETING]: RECOMMENDED_AGENTS.DEEPSEEK,
  [MISSION_CATEGORIES.CUSTOMER]: RECOMMENDED_AGENTS.DOUBAO,
  [MISSION_CATEGORIES.DEVOPS]: RECOMMENDED_AGENTS.WORKBUDDY,
  [MISSION_CATEGORIES.FINANCE]: RECOMMENDED_AGENTS.CODEX
};

// Mission draft compile templates
const MISSION_COMPILE_TEMPLATES = {
  [MISSION_CATEGORIES.COMMERCE]: {
    category: MISSION_CATEGORIES.COMMERCE,
    type: 'commerce-growth',
    defaultAcceptanceCriteria: [
      'GMV 增长达到预设目标',
      '转化率提升符合预期',
      '商品推荐准确率达到 90% 以上'
    ],
    defaultRisks: [
      '市场竞争可能影响结果',
      '用户习惯变化不确定',
      '平台规则可能变更'
    ]
  },
  [MISSION_CATEGORIES.OPERATIONS]: {
    category: MISSION_CATEGORIES.OPERATIONS,
    type: 'operations-efficiency',
    defaultAcceptanceCriteria: [
      '运营效率提升 20% 以上',
      '运营成本降低 15% 以上',
      '关键操作审批流程优化'
    ],
    defaultRisks: [
      '业务调整可能影响现有流程',
      '自动化可能引入新风险',
      '资源分配可能冲突'
    ]
  },
  [MISSION_CATEGORIES.MARKETING]: {
    category: MISSION_CATEGORIES.MARKETING,
    type: 'marketing-campaign',
    defaultAcceptanceCriteria: [
      '品牌知名度提升达到预期',
      '新客户获取量满足目标',
      '用户参与度显著提升'
    ],
    defaultRisks: [
      '广告投放效果可能不达预期',
      '竞品策略可能影响结果',
      '用户隐私法规可能变化'
    ]
  },
  [MISSION_CATEGORIES.CUSTOMER]: {
    category: MISSION_CATEGORIES.CUSTOMER,
    type: 'customer-engagement',
    defaultAcceptanceCriteria: [
      '客户满意度评分提升',
      '客户流失率降低',
      '客户生命周期价值提高'
    ],
    defaultRisks: [
      '客户期望可能过高',
      '服务响应可能存在延迟',
      '隐私保护要求可能升级'
    ]
  },
  [MISSION_CATEGORIES.DEVOPS]: {
    category: MISSION_CATEGORIES.DEVOPS,
    type: 'devops-stability',
    defaultAcceptanceCriteria: [
      '系统可用性达到 99.9%',
      '部署频率提升',
      '故障恢复时间缩短至 30 分钟内'
    ],
    defaultRisks: [
      '生产环境变更可能引起故障',
      '技术债务可能延缓进度',
      '监控覆盖可能有盲区'
    ]
  },
  [MISSION_CATEGORIES.FINANCE]: {
    category: MISSION_CATEGORIES.FINANCE,
    type: 'finance-optimization',
    defaultAcceptanceCriteria: [
      '现金流优化达到预期',
      '财务风险指标降低',
      '投资回报率满足目标'
    ],
    defaultRisks: [
      '市场波动可能影响结果',
      '预算约束可能限制执行',
      '合规要求可能变化'
    ]
  }
};

// Default template for unknown/generic categories
const DEFAULT_MISSION_TEMPLATE = {
  category: 'generic',
  type: 'generic-mission',
  defaultAcceptanceCriteria: [
    '完成任务目标',
    '满足质量标准',
    '在规定时间内交付'
  ],
  defaultRisks: [
    '需求可能变更',
    '资源可能不足',
    '外部依赖可能延迟'
  ]
};

/**
 * Create a unique draft ID
 * @returns {string} Draft ID
 */
function createDraftId() {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 10);
  return `draft_${timestamp}_${random}`;
}

/**
 * Create a mission draft object from strategy plan
 * @param {Object} strategyPlan - Strategy plan from P9.5.2
 * @param {Object} template - Mission compile template
 * @param {Object} options - Creation options
 * @returns {Object} Mission draft
 */
function createMissionDraft(strategyPlan, template, options = {}) {
  const draftId = options.draftId || createDraftId();
  const now = new Date().toISOString();

  return {
    draftId,
    strategyId: strategyPlan.strategyId || 'unknown',
    goalId: strategyPlan.goalId || 'unknown',
    type: options.type || template.type || 'generic-mission',
    title: options.title || `Mission for ${strategyPlan.goalId}`,
    priority: options.priority || strategyPlan.priority || 'medium',
    status: options.status || MISSION_DRAFT_STATUS.DRAFT,
    source: 'mission-compiler',
    recommendedAgent: options.recommendedAgent || getRecommendedAgent(strategyPlan.category),
    objective: options.objective || (strategyPlan.objectives && strategyPlan.objectives[0]) || '',
    inputs: options.inputs || {},
    guardrails: options.guardrails || strategyPlan.guardrails || [],
    acceptanceCriteria: options.acceptanceCriteria || template.defaultAcceptanceCriteria || [],
    risks: options.risks || template.defaultRisks || [],
    createdAt: now,
    updatedAt: now,
    metadata: options.metadata || {}
  };
}

/**
 * Get recommended agent for a category
 * @param {string} category - Goal category
 * @returns {string} Agent name
 */
function getRecommendedAgent(category) {
  if (!category || typeof category !== 'string') {
    return RECOMMENDED_AGENTS.WORKBUDDY;
  }
  return CATEGORY_AGENT_MAP[category.toLowerCase()] || RECOMMENDED_AGENTS.WORKBUDDY;
}

/**
 * Check if status is valid for mission drafts
 * @param {string} status - Status to check
 * @returns {boolean}
 */
function isValidMissionDraftStatus(status) {
  return Object.values(MISSION_DRAFT_STATUS).includes(status);
}

/**
 * Check if a recommended agent is valid
 * @param {string} agent - Agent to check
 * @returns {boolean}
 */
function isValidAgent(agent) {
  return Object.values(RECOMMENDED_AGENTS).includes(agent);
}

module.exports = {
  MISSION_DRAFT_STATUS,
  MISSION_CATEGORIES,
  RECOMMENDED_AGENTS,
  CATEGORY_AGENT_MAP,
  MISSION_COMPILE_TEMPLATES,
  DEFAULT_MISSION_TEMPLATE,
  createDraftId,
  createMissionDraft,
  getRecommendedAgent,
  isValidMissionDraftStatus,
  isValidAgent
};
