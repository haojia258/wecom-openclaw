/**
 * P9.5.2 Strategy Planner MVP — strategy-types.js
 * Strategy plan data types and schema definitions
 */

const STRATEGY_STATUS = {
  DRAFT: 'draft',
  REVIEWED: 'reviewed',
  ARCHIVED: 'archived'
};

const STRATEGY_CATEGORIES = {
  COMMERCE: 'commerce',
  OPERATIONS: 'operations',
  MARKETING: 'marketing',
  CUSTOMER: 'customer',
  DEVOPS: 'devops',
  FINANCE: 'finance'
};

const TEMPLATE_REGISTRY = {
  [STRATEGY_CATEGORIES.COMMERCE]: {
    category: STRATEGY_CATEGORIES.COMMERCE,
    defaultObjectives: [
      '增长商品交易总额 (GMV)',
      '提升转化率',
      '优化商品推荐'
    ],
    defaultGuardrails: [
      '遵守电商平台规则',
      '不得操纵评价',
      '不得虚假宣传'
    ],
    recommendedMissionTypes: ['analytics', 'seo', 'content']
  },
  [STRATEGY_CATEGORIES.OPERATIONS]: {
    category: STRATEGY_CATEGORIES.OPERATIONS,
    defaultObjectives: [
      '提升运营效率',
      '降低运营成本',
      '优化资源分配'
    ],
    defaultGuardrails: [
      '不影响现有业务',
      '数据操作必须可回滚',
      '关键操作需人工审批'
    ],
    recommendedMissionTypes: ['automation', 'monitoring', 'reporting']
  },
  [STRATEGY_CATEGORIES.MARKETING]: {
    category: STRATEGY_CATEGORIES.MARKETING,
    defaultObjectives: [
      '提升品牌知名度',
      '获取新客户',
      '提高用户参与度'
    ],
    defaultGuardrails: [
      '遵守广告法规',
      '不得误导消费者',
      '尊重用户隐私'
    ],
    recommendedMissionTypes: ['content', 'social', 'campaign']
  },
  [STRATEGY_CATEGORIES.CUSTOMER]: {
    category: STRATEGY_CATEGORIES.CUSTOMER,
    defaultObjectives: [
      '提升客户满意度',
      '降低客户流失率',
      '提高客户生命周期价值'
    ],
    defaultGuardrails: [
      '保护客户隐私',
      '不得骚扰客户',
      '响应时间需合理'
    ],
    recommendedMissionTypes: ['support', 'survey', 'engagement']
  },
  [STRATEGY_CATEGORIES.DEVOPS]: {
    category: STRATEGY_CATEGORIES.DEVOPS,
    defaultObjectives: [
      '提高系统稳定性',
      '加快部署频率',
      '缩短故障恢复时间'
    ],
    defaultGuardrails: [
      '生产环境操作需审批',
      '必须有回滚方案',
      '监控必须提前部署'
    ],
    recommendedMissionTypes: ['deployment', 'monitoring', 'incident']
  },
  [STRATEGY_CATEGORIES.FINANCE]: {
    category: STRATEGY_CATEGORIES.FINANCE,
    defaultObjectives: [
      '优化现金流',
      '降低财务风险',
      '提高投资回报率'
    ],
    defaultGuardrails: [
      '遵守财务法规',
      '不得未经授权操作资金',
      '所有交易必须可审计'
    ],
    recommendedMissionTypes: ['reporting', 'compliance', 'analysis']
  }
};

// Fallback template for unknown categories
const DEFAULT_TEMPLATE = {
  category: 'generic',
  defaultObjectives: [
    '实现业务目标',
    '优化关键指标',
    '提升整体效率'
  ],
  defaultGuardrails: [
    '遵守相关法律法规',
    '关键操作需人工审批',
    '所有操作必须可审计'
  ],
  recommendedMissionTypes: ['analysis', 'planning', 'execution']
};

function createStrategyId() {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 10);
  return `strategy_${timestamp}_${random}`;
}

function createStrategyPlan(goal, template, options = {}) {
  const strategyId = createStrategyId();
  const now = new Date().toISOString();

  return {
    strategyId,
    goalId: goal.goalId || goal.id || 'unknown',
    category: goal.category || 'generic',
    priority: goal.priority || 'medium',
    status: options.status || STRATEGY_STATUS.DRAFT,
    objectives: options.objectives || template.defaultObjectives || [],
    guardrails: options.guardrails || template.defaultGuardrails || [],
    recommendedMissions: options.recommendedMissions || [],
    assumptions: options.assumptions || [],
    risks: options.risks || [],
    createdAt: now,
    updatedAt: now,
    metadata: options.metadata || {}
  };
}

function isValidStatus(status) {
  return Object.values(STRATEGY_STATUS).includes(status);
}

function isValidCategory(category) {
  return Object.values(STRATEGY_CATEGORIES).includes(category) || category === 'generic';
}

module.exports = {
  STRATEGY_STATUS,
  STRATEGY_CATEGORIES,
  TEMPLATE_REGISTRY,
  DEFAULT_TEMPLATE,
  createStrategyId,
  createStrategyPlan,
  isValidStatus,
  isValidCategory
};
