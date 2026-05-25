'use strict';

/**
 * agent-queue-builder.js - Planner 推荐执行队列构建器 (v2)
 *
 * 根据业务目标生成结构化的 Agent 推荐队列。
 * 每个推荐项包含: agent, command, priority, reason
 *
 * 支持目标:
 *   - 提升GMV
 *   - 提高ROI
 *   - 降低退款率
 *   - 优化企业微信稳定性
 *
 * 约束:
 *   - 不自动 dispatch
 *   - 不自动 confirm
 *   - 不自动执行
 *
 * P6.6.3 — Port from openclaw_osv1.0 to wecom-openclaw (CJS)
 */

// ============================================================
//  目标类型常量
// ============================================================

var GoalType = Object.freeze({
  BOOST_GMV:        'boost_gmv',
  IMPROVE_ROI:      'improve_roi',
  REDUCE_REFUND:    'reduce_refund',
  OPTIMIZE_WECOM:   'optimize_wecom',
});

/** 中文名称映射 */
var GOAL_LABELS = {
  [GoalType.BOOST_GMV]:        '提升GMV',
  [GoalType.IMPROVE_ROI]:      '提高ROI',
  [GoalType.REDUCE_REFUND]:    '降低退款率',
  [GoalType.OPTIMIZE_WECOM]:   '优化企业微信稳定性',
};

// ============================================================
//  推荐队列定义 (每个目标 → Agent 执行序列)
// ============================================================

/**
 * 推荐队列模板
 *
 * 每个目标对应一组按优先级排序的推荐项。
 * priority: 1 (最高) ~ 5 (最低)
 *
 * 设计原则:
 *   priority=1: 数据分析 / 诊断 (必须先做)
 *   priority=2: 策略生成 (基于数据)
 *   priority=3: 功能实现 (技术落地)
 *   priority=4: 内容产出 (传播/营销)
 */

var QUEUE_TEMPLATES = {
  // -------------------------------------------------------
  //  提升 GMV
  // -------------------------------------------------------
  [GoalType.BOOST_GMV]: [
    {
      agent:    'codex',
      command:  'analyze_gmv_data',
      priority: 1,
      reason:   '分析历史 GMV 数据趋势，识别增长瓶颈与高价值用户群',
    },
    {
      agent:    'deepseek',
      command:  'gmv_optimization_strategy',
      priority: 2,
      reason:   '基于数据分析生成多维度 GMV 提升策略（定价、推荐、促销）',
    },
    {
      agent:    'workbuddy',
      command:  'generate_plan',
      priority: 3,
      reason:   '将 GMV 策略转化为可执行的工程实施计划',
    },
    {
      agent:    'doubao',
      command:  'gmv_content_marketing',
      priority: 4,
      reason:   '生成 GMV 提升相关的营销文案与活动策划内容',
    },
  ],

  // -------------------------------------------------------
  //  提高 ROI
  // -------------------------------------------------------
  [GoalType.IMPROVE_ROI]: [
    {
      agent:    'codex',
      command:  'analyze_roi_metrics',
      priority: 1,
      reason:   '分析各渠道 ROI 指标，定位低效投放与成本浪费环节',
    },
    {
      agent:    'deepseek',
      command:  'roi_improvement_plan',
      priority: 2,
      reason:   '生成 ROI 提升策略：渠道优化、预算重分配、转化漏斗改进',
    },
    {
      agent:    'workbuddy',
      command:  'optimize_cost_structure',
      priority: 3,
      reason:   '实现成本结构优化：自动化降低人工成本、资源利用率提升',
    },
    {
      agent:    'doubao',
      command:  'roi_report_content',
      priority: 4,
      reason:   '生成 ROI 分析报告与数据可视化内容',
    },
  ],

  // -------------------------------------------------------
  //  降低退款率
  // -------------------------------------------------------
  [GoalType.REDUCE_REFUND]: [
    {
      agent:    'codex',
      command:  'analyze_refund_patterns',
      priority: 1,
      reason:   '分析退款数据模式与趋势，定位高频退款原因与商品',
    },
    {
      agent:    'deepseek',
      command:  'refund_reduction_strategy',
      priority: 2,
      reason:   '生成退款率降低策略：售前质量管控、售后体验优化',
    },
    {
      agent:    'workbuddy',
      command:  'implement_refund_controls',
      priority: 3,
      reason:   '落地退款管控功能：智能风控规则、退款审批流程',
    },
    {
      agent:    'doubao',
      command:  'customer_experience_content',
      priority: 4,
      reason:   '生成客户体验优化内容：FAQ 改进、售后话术模板',
    },
  ],

  // -------------------------------------------------------
  //  优化企业微信稳定性
  // -------------------------------------------------------
  [GoalType.OPTIMIZE_WECOM]: [
    {
      agent:    'codex',
      command:  'analyze_wecom_logs',
      priority: 1,
      reason:   '分析企业微信适配器运行日志，定位稳定性瓶颈与异常',
    },
    {
      agent:    'workbuddy',
      command:  'check_status',
      priority: 2,
      reason:   '检查当前系统状态：PM2 进程、磁盘空间、内存使用',
    },
    {
      agent:    'deepseek',
      command:  'stability_optimization_plan',
      priority: 3,
      reason:   '生成企业微信稳定性优化方案：容错、重试、降级策略',
    },
    {
      agent:    'codex',
      command:  'implement_stability_fixes',
      priority: 4,
      reason:   '实现稳定性修复：错误处理增强、连接池优化',
    },
  ],
};

// ============================================================
//  核心 API
// ============================================================

/**
 * 验证目标类型是否合法
 * @param {string} goal
 * @returns {{ valid: boolean, reason?: string }}
 */
function validateGoal(goal) {
  if (!goal || typeof goal !== 'string') {
    return { valid: false, reason: '目标类型不能为空' };
  }

  var normalized = goal.toLowerCase().trim();

  // 支持中文目标名映射
  var chineseMap = {
    '提升gmv':          GoalType.BOOST_GMV,
    '提高roi':          GoalType.IMPROVE_ROI,
    '降低退款率':        GoalType.REDUCE_REFUND,
    '优化企业微信稳定性': GoalType.OPTIMIZE_WECOM,
  };

  if (chineseMap[normalized]) {
    return { valid: true, normalized: chineseMap[normalized] };
  }

  if (Object.values(GoalType).includes(normalized)) {
    return { valid: true, normalized: normalized };
  }

  return {
    valid: false,
    reason: '不支持的目标: "' + goal + '"。"支持: ' + Object.values(GoalType).join(', ') + ' 或中文名称',
  };
}

/**
 * 构建推荐执行队列
 *
 * @param {object} params
 * @param {string} params.goal     - 目标类型 (GoalType 常量或中文名)
 * @param {object} [params.context] - 可选的业务上下文
 * @param {number} [params.maxItems] - 最大返回项数 (默认全部)
 * @returns {object} 结构化推荐队列
 */
function buildQueue(params) {
  params = params || {};
  var goal = params.goal;
  var context = params.context || {};
  var maxItems = params.maxItems;

  // 1. 验证目标
  var goalCheck = validateGoal(goal);
  if (!goalCheck.valid) {
    return {
      success: false,
      error: goalCheck.reason,
      queue: [],
      goal: null,
      summary: null,
    };
  }

  var normalizedGoal = goalCheck.normalized;

  // 2. 获取推荐模板
  var items = QUEUE_TEMPLATES[normalizedGoal];

  if (!items || items.length === 0) {
    return {
      success: false,
      error: '目标 "' + goal + '" 暂无推荐队列',
      queue: [],
      goal: normalizedGoal,
      summary: null,
    };
  }

  // 3. 注入上下文 (如果有)
  if (context && Object.keys(context).length > 0) {
    items = items.map(function(item) {
      var copy = {};
      var keys = Object.keys(item);
      for (var i = 0; i < keys.length; i++) {
        copy[keys[i]] = item[keys[i]];
      }
      copy.context = context;
      return copy;
    });
  }

  // 4. 按 priority 排序 (确保升序)
  items = items.slice().sort(function(a, b) {
    return a.priority - b.priority;
  });

  // 5. 截断
  if (maxItems && maxItems > 0) {
    items = items.slice(0, maxItems);
  }

  // 6. 添加序号
  var queue = items.map(function(item, index) {
    return {
      seq:      index + 1,
      agent:    item.agent,
      command:  item.command,
      priority: item.priority,
      reason:   item.reason,
      context:  item.context || {},
    };
  });

  // 7. 生成摘要
  var summary = _generateSummary(normalizedGoal, queue);

  return {
    success: true,
    goal:    normalizedGoal,
    queue:   queue,
    summary: summary,
  };
}

/**
 * 列出所有支持的目标类型
 * @returns {{ key: string, label: string, description: string }[]}
 */
function listGoals() {
  return [
    {
      key:         GoalType.BOOST_GMV,
      label:       GOAL_LABELS[GoalType.BOOST_GMV],
      description: '通过数据分析、策略优化、功能实现和内容营销提升 GMV',
    },
    {
      key:         GoalType.IMPROVE_ROI,
      label:       GOAL_LABELS[GoalType.IMPROVE_ROI],
      description: '分析 ROI 指标，优化成本结构和渠道投放效率',
    },
    {
      key:         GoalType.REDUCE_REFUND,
      label:       GOAL_LABELS[GoalType.REDUCE_REFUND],
      description: '分析退款原因，实施质量管控和售后优化降低退款率',
    },
    {
      key:         GoalType.OPTIMIZE_WECOM,
      label:       GOAL_LABELS[GoalType.OPTIMIZE_WECOM],
      description: '诊断企业微信适配器稳定性问题，实施容错和性能优化',
    },
  ];
}

/**
 * 根据 Agent 名获取该 Agent 在队列中的角色
 * @param {string} agent
 * @returns {string}
 */
function getAgentRole(agent) {
  var roles = {
    codex:     '数据分析 & 代码实现 — 诊断问题、分析数据、实现修复',
    deepseek:  '策略生成 — 基于分析结果生成优化策略与方案',
    workbuddy: '工程执行 — 将策略转化为可执行的工程计划',
    doubao:    '内容创作 — 生成营销文案、报告和传播内容',
  };
  return roles[(agent || '').toLowerCase()] || '未知角色';
}

// ============================================================
//  内部工具
// ============================================================

/**
 * 生成队列执行摘要
 * @param {string} goal
 * @param {object[]} queue
 * @returns {object}
 */
function _generateSummary(goal, queue) {
  var totalSteps = queue.length;
  var agentSet = {};
  for (var i = 0; i < queue.length; i++) {
    agentSet[queue[i].agent] = true;
  }
  var agents = Object.keys(agentSet);
  var highestPriority = queue[0] ? queue[0].priority : '-';
  var lowestPriority  = queue[queue.length - 1] ? queue[queue.length - 1].priority : '-';

  return {
    goal:             goal,
    goalLabel:        GOAL_LABELS[goal] || goal,
    totalSteps:       totalSteps,
    agentsInvolved:   agents,
    priorityRange:    'P' + highestPriority + '-P' + lowestPriority,
    estimatedAgents:  agents.length,
    mode:             'plan-only',
    disclaimer:       '此队列为推荐执行计划，不会自动执行任何命令',
  };
}

module.exports = {
  GoalType:      GoalType,
  GOAL_LABELS:   GOAL_LABELS,
  validateGoal:  validateGoal,
  buildQueue:    buildQueue,
  listGoals:     listGoals,
  getAgentRole:  getAgentRole,
};
