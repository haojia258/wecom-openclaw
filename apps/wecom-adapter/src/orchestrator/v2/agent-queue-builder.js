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
  BOOST_GMV:              'boost_gmv',
  IMPROVE_ROI:            'improve_roi',
  REDUCE_REFUND:          'reduce_refund',
  OPTIMIZE_WECOM:         'optimize_wecom',
  // P8.5.1 — Controlled Execution Goal Pack
  STAGING_HEALTH_CHECK:   'staging_health_check',
  STAGING_NPM_TEST:       'staging_npm_test',
  STAGING_RUNTIME_AUDIT:  'staging_runtime_audit',
  STAGING_GATEWAY_VERIFY: 'staging_gateway_verify',
});

/** 中文名称映射 */
var GOAL_LABELS = {
  [GoalType.BOOST_GMV]:              '提升GMV',
  [GoalType.IMPROVE_ROI]:            '提高ROI',
  [GoalType.REDUCE_REFUND]:          '降低退款率',
  [GoalType.OPTIMIZE_WECOM]:         '优化企业微信稳定性',
  // P8.5.1 — Controlled Execution Goal Pack
  [GoalType.STAGING_HEALTH_CHECK]:   'Staging 健康检查',
  [GoalType.STAGING_NPM_TEST]:       'Staging NPM 测试',
  [GoalType.STAGING_RUNTIME_AUDIT]:  'Staging 运行时审计',
  [GoalType.STAGING_GATEWAY_VERIFY]: 'Staging Gateway 验证',
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
      dependsOn: [],
      priority: 1,
      reason:   '分析历史 GMV 数据趋势，识别增长瓶颈与高价值用户群',
    },
    {
      agent:    'deepseek',
      command:  'gmv_optimization_strategy',
      dependsOn: ['analyze_gmv_data'],
      priority: 2,
      reason:   '基于数据分析生成多维度 GMV 提升策略（定价、推荐、促销）',
    },
    {
      agent:    'workbuddy',
      command:  'generate_plan',
      dependsOn: ['gmv_optimization_strategy'],
      priority: 3,
      reason:   '将 GMV 策略转化为可执行的工程实施计划',
    },
    {
      agent:    'doubao',
      command:  'gmv_content_marketing',
      dependsOn: ['gmv_optimization_strategy'],
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
      dependsOn: [],
      priority: 1,
      reason:   '分析各渠道 ROI 指标，定位低效投放与成本浪费环节',
    },
    {
      agent:    'deepseek',
      command:  'roi_improvement_plan',
      dependsOn: ['analyze_roi_metrics'],
      priority: 2,
      reason:   '生成 ROI 提升策略：渠道优化、预算重分配、转化漏斗改进',
    },
    {
      agent:    'workbuddy',
      command:  'optimize_cost_structure',
      dependsOn: ['roi_improvement_plan'],
      priority: 3,
      reason:   '实现成本结构优化：自动化降低人工成本、资源利用率提升',
    },
    {
      agent:    'doubao',
      command:  'roi_report_content',
      dependsOn: ['roi_improvement_plan'],
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
      dependsOn: [],
      priority: 1,
      reason:   '分析退款数据模式与趋势，定位高频退款原因与商品',
    },
    {
      agent:    'deepseek',
      command:  'refund_reduction_strategy',
      dependsOn: ['analyze_refund_patterns'],
      priority: 2,
      reason:   '生成退款率降低策略：售前质量管控、售后体验优化',
    },
    {
      agent:    'workbuddy',
      command:  'implement_refund_controls',
      dependsOn: ['refund_reduction_strategy'],
      priority: 3,
      reason:   '落地退款管控功能：智能风控规则、退款审批流程',
    },
    {
      agent:    'doubao',
      command:  'customer_experience_content',
      dependsOn: ['refund_reduction_strategy'],
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
      dependsOn: [],
      priority: 1,
      reason:   '分析企业微信适配器运行日志，定位稳定性瓶颈与异常',
    },
    {
      agent:    'workbuddy',
      command:  'check_status',
      dependsOn: [],
      priority: 2,
      reason:   '检查当前系统状态：PM2 进程、磁盘空间、内存使用',
    },
    {
      agent:    'deepseek',
      command:  'stability_optimization_plan',
      dependsOn: ['analyze_wecom_logs', 'check_status'],
      priority: 3,
      reason:   '生成企业微信稳定性优化方案：容错、重试、降级策略',
    },
    {
      agent:    'codex',
      command:  'implement_stability_fixes',
      dependsOn: ['stability_optimization_plan'],
      priority: 4,
      reason:   '实现稳定性修复：错误处理增强、连接池优化',
    },
  ],

  // -------------------------------------------------------
  //  Staging 健康检查 (P8.5.1)
  // -------------------------------------------------------
  [GoalType.STAGING_HEALTH_CHECK]: [
    {
      agent:    'workbuddy',
      command:  'health_check_3001',
      dependsOn: [],
      priority: 1,
      reason:   '检查 wecom-adapter Gateway 健康状态 (GET :3001/health)',
    },
    {
      agent:    'workbuddy',
      command:  'health_check_3002',
      dependsOn: [],
      priority: 1,
      reason:   '检查 Agent Host 健康状态 (GET :3002/health)',
    },
    {
      agent:    'workbuddy',
      command:  'gateway_plan_only_verify',
      dependsOn: ['health_check_3001', 'health_check_3002'],
      priority: 2,
      reason:   '验证 Gateway plan-only 端到端链路（Host → Gateway → Bridge）',
    },
  ],

  // -------------------------------------------------------
  //  Staging NPM 测试 (P8.5.1)
  // -------------------------------------------------------
  [GoalType.STAGING_NPM_TEST]: [
    {
      agent:    'workbuddy',
      command:  'npm_test_dry_run',
      dependsOn: [],
      priority: 1,
      reason:   '执行 npm test dry-run（test:v2 + test:commander-runtime + test:dag-scheduler + test:chatgpt-bridge）',
    },
    {
      agent:    'workbuddy',
      command:  'test_result_audit',
      dependsOn: ['npm_test_dry_run'],
      priority: 2,
      reason:   '审计测试结果：统计通过/失败数，生成测试报告',
    },
  ],

  // -------------------------------------------------------
  //  Staging 运行时审计 (P8.5.1)
  // -------------------------------------------------------
  [GoalType.STAGING_RUNTIME_AUDIT]: [
    {
      agent:    'workbuddy',
      command:  'check_pm2_status',
      dependsOn: [],
      priority: 1,
      reason:   '检查 PM2 进程状态：wecom-adapter、ads-worker、agent-host',
    },
    {
      agent:    'workbuddy',
      command:  'check_disk_memory',
      dependsOn: [],
      priority: 1,
      reason:   '检查系统资源：磁盘使用 (df -h)、内存使用 (free -m)',
    },
    {
      agent:    'workbuddy',
      command:  'audit_log_review',
      dependsOn: ['check_pm2_status', 'check_disk_memory'],
      priority: 2,
      reason:   '审计运行日志：gateway-audit.log、host-audit.log、token 脱敏检查',
    },
    {
      agent:    'workbuddy',
      command:  'generate_audit_report',
      dependsOn: ['audit_log_review'],
      priority: 3,
      reason:   '生成运行时审计报告：稳定性基线对比、风险评级',
    },
  ],

  // -------------------------------------------------------
  //  Staging Gateway 验证 (P8.5.1)
  // -------------------------------------------------------
  [GoalType.STAGING_GATEWAY_VERIFY]: [
    {
      agent:    'workbuddy',
      command:  'gateway_ping',
      dependsOn: [],
      priority: 1,
      reason:   'Gateway 连通性测试：验证 GATEWAY_TOKEN 认证、timestamp 窗口',
    },
    {
      agent:    'workbuddy',
      command:  'bridge_chain_verify',
      dependsOn: ['gateway_ping'],
      priority: 2,
      reason:   'Bridge 链路验证：Gateway → Bridge → Commander 全链路测试',
    },
    {
      agent:    'workbuddy',
      command:  'agent_host_verify',
      dependsOn: ['bridge_chain_verify'],
      priority: 3,
      reason:   'Agent Host 端到端验证：Host → Gateway → Commander 完整路径',
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
    // P8.5.1 — Controlled Execution Goal Pack
    'staging health check':       GoalType.STAGING_HEALTH_CHECK,
    'staging 健康检查':            GoalType.STAGING_HEALTH_CHECK,
    '灰度健康检查':                GoalType.STAGING_HEALTH_CHECK,
    'staging健康检查':             GoalType.STAGING_HEALTH_CHECK,
    'npm test dry-run':           GoalType.STAGING_NPM_TEST,
    '测试 dry-run':               GoalType.STAGING_NPM_TEST,
    '测试dry-run':                GoalType.STAGING_NPM_TEST,
    '运行测试计划':                GoalType.STAGING_NPM_TEST,
    '运行时审计':                  GoalType.STAGING_RUNTIME_AUDIT,
    'staging 审计':               GoalType.STAGING_RUNTIME_AUDIT,
    'staging审计':                GoalType.STAGING_RUNTIME_AUDIT,
    'pm2 状态检查':               GoalType.STAGING_RUNTIME_AUDIT,
    'pm2状态检查':                GoalType.STAGING_RUNTIME_AUDIT,
    'gateway 验证':               GoalType.STAGING_GATEWAY_VERIFY,
    'gateway验证':                GoalType.STAGING_GATEWAY_VERIFY,
    '网关验证':                    GoalType.STAGING_GATEWAY_VERIFY,
    'agent host 到 gateway 验证':  GoalType.STAGING_GATEWAY_VERIFY,
    'agent host到gateway验证':    GoalType.STAGING_GATEWAY_VERIFY,
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
    // P8.5.1 — Controlled Execution Goal Pack
    {
      key:         GoalType.STAGING_HEALTH_CHECK,
      label:       GOAL_LABELS[GoalType.STAGING_HEALTH_CHECK],
      description: '检查 :3001/:3002 健康状态并验证 Gateway plan-only 端到端链路',
    },
    {
      key:         GoalType.STAGING_NPM_TEST,
      label:       GOAL_LABELS[GoalType.STAGING_NPM_TEST],
      description: '执行 npm test dry-run 并审计测试结果',
    },
    {
      key:         GoalType.STAGING_RUNTIME_AUDIT,
      label:       GOAL_LABELS[GoalType.STAGING_RUNTIME_AUDIT],
      description: '审计 PM2 进程状态、系统资源和运行日志',
    },
    {
      key:         GoalType.STAGING_GATEWAY_VERIFY,
      label:       GOAL_LABELS[GoalType.STAGING_GATEWAY_VERIFY],
      description: '验证 Gateway 认证、Bridge 链路和 Agent Host 端到端连通性',
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
  getGoalLabel:  function(goalType) { return GOAL_LABELS[goalType] || goalType; },
};
