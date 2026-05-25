'use strict';

/**
 * task-planner.js - 任务拆解模块 (P6.5 Planner Agent + P6.6.3 Queue)
 *
 * 基于解析后的目标对象，生成任务分解：
 * - 优先级排序 (P1/P2)
 * - Agent 分配
 * - 命令推荐
 *
 * P6.6.3 新增: planTasks / previewPlan / getGoalCatalog (基于 agent-queue-builder)
 */

// P6.6.3 依赖 (lazy require plannerAgent 打破循环依赖)
const { buildQueue, validateGoal, listGoals } = require('./agent-queue-builder');

// ─── 任务模板库 ─────────────────────────────────────────────

/**
 * 任务模板结构:
 * {
 *   title: string,        // 任务标题
 *   description: string,  // 详细描述
 *   priority: 'P1'|'P2', // 优先级
 *   agent: string,        // 推荐 Agent
 *   commands: string[]    // 推荐命令
 * }
 */

var TASK_TEMPLATES = {
  sales_growth: [
    { title: '检查近7日 GMV 趋势',          description: '分析 GMV 日趋势，识别增长点和下滑点',               priority: 'P1', agent: 'workbuddy', commands: ['/今日GMV'] },
    { title: '分析流量来源与转化漏斗',       description: '检查各渠道流量质量、点击率、转化率',               priority: 'P1', agent: 'deepseek',  commands: ['/投流分析', '/运营分析'] },
    { title: '评估近期活动 ROI',             description: '对比活动投入产出比，找出高效/低效活动',           priority: 'P1', agent: 'deepseek',  commands: ['/运营分析', '/活动利润'] },
    { title: '利润结构分析',                 description: '按品类/商品拆分毛利，定位利润洼地',                 priority: 'P2', agent: 'deepseek',  commands: ['/利润'] },
    { title: '选品优化建议',                 description: '基于趋势数据推荐潜力品类',                         priority: 'P2', agent: 'codex',     commands: ['/运营分析'] },
    { title: '内容素材效果评估',             description: '分析视频/直播素材的转化效果',                       priority: 'P2', agent: 'doubao',    commands: ['/视频建议'] },
  ],
  sales_reduction: [
    { title: 'GMV 下滑根因分析',             description: '排查订单量、客单价、转化率各环节变化',             priority: 'P1', agent: 'deepseek',  commands: ['/今日GMV', '/运营分析'] },
    { title: '竞品活动影响评估',             description: '检查竞品是否有促销活动影响本店销售',               priority: 'P1', agent: 'deepseek',  commands: ['/运营分析'] },
    { title: '流量质量诊断',                 description: '检查流量是否有下降或质量问题',                     priority: 'P1', agent: 'deepseek',  commands: ['/投流分析'] },
  ],
  risk_reduction: [
    { title: '退款率趋势分析',               description: '按品类/原因拆分退款率，定位主要退款来源',         priority: 'P1', agent: 'deepseek',  commands: ['/风险', '/运营分析'] },
    { title: '差评原因归类统计',             description: '分析差评关键词，定位产品质量/物流/服务问题',       priority: 'P1', agent: 'deepseek',  commands: ['/风险扫描'] },
    { title: '售后处理时效检查',             description: '检查退货/退款/换货的平均处理时长',                 priority: 'P1', agent: 'workbuddy', commands: ['/订单'] },
    { title: '商品质量评分下降排查',         description: '定位评分下降的商品，分析用户反馈',                 priority: 'P2', agent: 'deepseek',  commands: ['/风险'] },
  ],
  ads_growth: [
    { title: '投流 ROI 全面审计',            description: '按计划/素材/人群维度分析 ROI',                     priority: 'P1', agent: 'deepseek',  commands: ['/投流分析'] },
    { title: '高 ROI 素材特征提取',          description: '分析高转化素材的共同特征，指导素材生产',           priority: 'P2', agent: 'doubao',    commands: ['/视频建议'] },
    { title: '竞品投放策略分析',             description: '评估竞品投放力度和创意方向',                       priority: 'P2', agent: 'deepseek',  commands: ['/投流分析'] },
    { title: '预算分配优化建议',             description: '基于 ROI 数据重新分配各计划预算',                  priority: 'P2', agent: 'deepseek',  commands: ['/投流分析'] },
  ],
  ads_reduction: [
    { title: 'ROI 下滑诊断',                 description: '定位 ROI 下降的广告计划，分析点击率/转化率/出价',  priority: 'P1', agent: 'deepseek',  commands: ['/投流分析'] },
    { title: '无效投放识别与关停建议',       description: '识别持续低 ROI 的计划，给出关停或调整建议',       priority: 'P1', agent: 'deepseek',  commands: ['/投流分析'] },
  ],
  ops_optimization: [
    { title: '服务器健康检查',               description: '检查 CPU/内存/磁盘/网络状态',                        priority: 'P1', agent: 'workbuddy', commands: ['/任务 workbuddy confirm:audit 检查服务器状态'] },
    { title: '错误日志扫描',                 description: '扫描近期 error log，识别高频错误模式',               priority: 'P1', agent: 'workbuddy', commands: ['/任务 workbuddy confirm:audit 检查错误日志'] },
    { title: '性能基线对比',                 description: '对比当前性能指标与历史基线，评估是否有退化',       priority: 'P2', agent: 'deepseek',  commands: ['/监控'] },
  ],
  ops_maintain: [
    { title: '生产环境健康巡检',             description: '全链路健康检查（服务、依赖、中间件）',             priority: 'P1', agent: 'workbuddy', commands: ['/任务 workbuddy confirm:audit pm2 status; df -h; free -m'] },
    { title: '部署流程检查',                 description: '检查 CI/CD 流水线状态和最近部署记录',               priority: 'P2', agent: 'workbuddy', commands: ['/状态'] },
  ],
  content_optimization: [
    { title: '内容素材效果排名',             description: '按播放量/转化率排名现有素材',                       priority: 'P1', agent: 'deepseek',  commands: ['/视频建议'] },
    { title: '热门选题推荐',                 description: '基于行业趋势和竞品分析推荐选题方向',               priority: 'P2', agent: 'doubao',    commands: ['/视频建议'] },
  ],
  product_optimization: [
    { title: '库存健康度检查',               description: '排查滞销/缺货商品，计算库存周转天数',               priority: 'P1', agent: 'workbuddy', commands: ['/订单'] },
    { title: '定价策略评估',                 description: '对比竞品价格和利润空间，给出调价建议',               priority: 'P2', agent: 'deepseek',  commands: ['/利润'] },
  ],
  user_growth: [
    { title: '用户转化漏斗分析',             description: '从曝光到复购的全链路转化分析',                     priority: 'P1', agent: 'deepseek',  commands: ['/运营分析'] },
    { title: '私域运营效果评估',             description: '企业微信/社群/会员的活跃度和转化效果',               priority: 'P1', agent: 'deepseek',  commands: ['/运营分析'] },
  ],
  order_optimization: [
    { title: '订单履约时效分析',             description: '按商品/仓库分析发货/物流时效',                     priority: 'P1', agent: 'workbuddy', commands: ['/订单'] },
    { title: '异常订单排查',                 description: '识别超时未发货/物流停滞的订单',                     priority: 'P2', agent: 'workbuddy', commands: ['/订单'] },
  ],
  profit_optimization: [
    { title: '成本结构分析',                 description: '拆分各项成本（拿货/物流/投流/平台），定位优化点',   priority: 'P1', agent: 'deepseek',  commands: ['/利润'] },
    { title: '毛利率趋势监控',               description: '按品类监控毛利率变化，预警利润下滑',               priority: 'P1', agent: 'deepseek',  commands: ['/利润'] },
    { title: '费用管控建议',                 description: '分析营销费用/平台佣金的合理性',                     priority: 'P2', agent: 'deepseek',  commands: ['/利润'] },
  ],
  // 默认模板（无匹配领域时使用）
  general_optimization: [
    { title: '数据全景扫描',                 description: '获取当前关键指标快照，建立基线认知',               priority: 'P1', agent: 'workbuddy', commands: ['/状态', '/今日GMV', '/运营分析'] },
    { title: '风险预警扫描',                 description: '检查当前是否存在异常指标需要关注',                   priority: 'P1', agent: 'deepseek',  commands: ['/风险', '/监控'] },
    { title: '运营效率评估',                 description: '分析当前运营流程中的改进机会',                     priority: 'P2', agent: 'deepseek',  commands: ['/运营分析'] },
  ],
};

// Agent 名称映射
var AGENT_LABELS = {
  'workbuddy': 'WorkBuddy',
  'deepseek': 'DeepSeek',
  'codex': 'Codex',
  'doubao': 'Doubao',
};

// 领域名称映射
var DOMAIN_LABELS = {
  'sales': '销售',
  'ads': '投流广告',
  'risk': '风险管控',
  'content': '内容创作',
  'ops': '系统运维',
  'product': '商品管理',
  'user': '用户运营',
  'order': '订单履约',
  'profit': '利润分析',
  'general': '综合运营',
};

// 策略名称映射
var CATEGORY_LABELS = {
  'growth': '增长策略',
  'reduction': '收缩/降本策略',
  'optimization': '优化策略',
  'maintain': '稳定保障策略',
};

// ─── 模板匹配 ───────────────────────────────────────────────

/**
 * 根据领域和策略匹配任务模板
 * @param {string} domain
 * @param {string} category
 * @returns {Array}
 */
function matchTemplates(domain, category) {
  var key = domain + '_' + category;
  if (TASK_TEMPLATES[key]) {
    return TASK_TEMPLATES[key].slice();
  }
  // 回退：只用 domain
  var domainGrowth = domain + '_growth';
  if (TASK_TEMPLATES[domainGrowth]) {
    return TASK_TEMPLATES[domainGrowth].slice();
  }
  var domainOpt = domain + '_optimization';
  if (TASK_TEMPLATES[domainOpt]) {
    return TASK_TEMPLATES[domainOpt].slice();
  }
  // 最终回退：通用模板
  return TASK_TEMPLATES['general_optimization'].slice();
}

// ─── Agent 统计 ─────────────────────────────────────────────

function countAgents(tasks) {
  var counts = {};
  for (var i = 0; i < tasks.length; i++) {
    var agent = tasks[i].agent;
    counts[agent] = (counts[agent] || 0) + 1;
  }
  return counts;
}

// ─── 命令收集 ───────────────────────────────────────────────

function collectCommands(tasks) {
  var commands = [];
  var seen = {};
  for (var i = 0; i < tasks.length; i++) {
    var cmds = tasks[i].commands || [];
    for (var j = 0; j < cmds.length; j++) {
      if (!seen[cmds[j]]) {
        seen[cmds[j]] = true;
        commands.push(cmds[j]);
      }
    }
  }
  return commands;
}

// ─── 主函数 ────────────────────────────────────────────────

/**
 * 生成任务计划
 * @param {{ goal: string, domain: string, category: string, keywords: string[], patterns: string[] }} parsedGoal
 * @returns {{ tasks: Array, p1Tasks: Array, p2Tasks: Array, agentCounts: Object, commands: string[] }}
 */
function plan(parsedGoal) {
  var domain = parsedGoal.domain || 'general';
  var category = parsedGoal.category || 'optimization';

  var templates = matchTemplates(domain, category);
  var tasks = [];
  var p1Tasks = [];
  var p2Tasks = [];

  for (var i = 0; i < templates.length; i++) {
    var t = templates[i];
    var task = {
      title: t.title,
      description: t.description,
      priority: t.priority,
      agent: t.agent,
      commands: t.commands
    };
    tasks.push(task);
    if (t.priority === 'P1') {
      p1Tasks.push(task);
    } else {
      p2Tasks.push(task);
    }
  }

  return {
    tasks: tasks,
    p1Tasks: p1Tasks,
    p2Tasks: p2Tasks,
    agentCounts: countAgents(tasks),
    commands: collectCommands(tasks),
    domainLabel: DOMAIN_LABELS[domain] || domain,
    categoryLabel: CATEGORY_LABELS[category] || category,
  };
}

// ============================================================
//  P6.6.3 Planner Queue — 任务级封装
// ============================================================

/**
 * 规划任务执行队列 — P6.6.3 新增
 *
 * @param {object} params
 * @param {string} params.goal      - 业务目标
 * @param {object} [params.context]  - 可选的业务上下文
 * @param {number} [params.maxItems] - 最大规划项数
 * @returns {Promise<object>} 任务规划结果
 */
async function planTasks(params) {
  params = params || {};
  var goal = params.goal;
  var context = params.context;
  var maxItems = params.maxItems;

  // 1. 验证目标
  var goalCheck = validateGoal(goal);
  if (!goalCheck.valid) {
    return {
      success: false,
      error: goalCheck.reason,
    };
  }

  // 2. 生成执行计划 (lazy require 打破循环依赖)
  var plannerAgent = require('./planner-agent');
  var plan = await plannerAgent.generatePlan({
    goal: goalCheck.normalized,
    context: context,
    maxItems: maxItems,
  });

  if (!plan.success) {
    return plan;
  }

  // 3. 将队列项转化为任务草稿
  var taskDrafts = plan.result.queue.map(function(item) {
    return {
      seq:      item.seq,
      agent:    item.agent,
      command:  item.command,
      priority: item.priority,
      reason:   item.reason,
      status:   'draft',
      // 任务草稿不会被 dispatch，需要手动确认
      actionable: false,
      action_note: '使用 /任务 ' + item.agent + ' "' + item.command + ': ' + item.reason + '" 手动创建',
    };
  });

  // 4. 构建结果
  return {
    success:    true,
    goal:       plan.result.goal,
    task_id:    plan.task_id,
    mode:       'plan-only',
    tasks:      taskDrafts,
    summary:    plan.result.summary,
    plan:       plan.result.plan,
    metadata: {
      total_tasks:      taskDrafts.length,
      agents_used:      plan.result.summary.agentsInvolved,
      priority_range:   plan.result.summary.priorityRange,
      generated_at:     new Date().toISOString(),
      planner_status:   plannerAgent.getPlannerStatus(),
    },
  };
}

/**
 * 预览规划 (轻量版，不写任务记录) — P6.6.3 新增
 *
 * @param {object} params
 * @param {string} params.goal - 业务目标
 * @returns {object} 预览结果
 */
function previewPlan(params) {
  params = params || {};
  var goal = params.goal;

  var goalCheck = validateGoal(goal);
  if (!goalCheck.valid) {
    return {
      success: false,
      error: goalCheck.reason,
    };
  }

  var queueResult = buildQueue({ goal: goalCheck.normalized });

  if (!queueResult.success) {
    return queueResult;
  }

  return {
    success:  true,
    goal:     queueResult.goal,
    queue:    queueResult.queue,
    summary:  queueResult.summary,
    preview:  true,
    note:     '预览模式: 此队列为只读预览，尚未创建任何任务',
  };
}

/**
 * 获取所有可用目标及其推荐队列概览 — P6.6.3 新增
 * @returns {object}
 */
function getGoalCatalog() {
  var goals = listGoals();

  var catalog = goals.map(function(g) {
    var queueResult = buildQueue({ goal: g.key });
    var agentSet = {};
    if (queueResult.success) {
      for (var i = 0; i < queueResult.queue.length; i++) {
        agentSet[queueResult.queue[i].agent] = true;
      }
    }
    return {
      key:         g.key,
      label:       g.label,
      description: g.description,
      step_count:  queueResult.success ? queueResult.queue.length : 0,
      agents:      queueResult.success ? Object.keys(agentSet) : [],
      first_step:  queueResult.success && queueResult.queue.length > 0
        ? queueResult.queue[0].agent + ': ' + queueResult.queue[0].command
        : null,
    };
  });

  // lazy require 打破循环依赖
  var plannerAgent = require('./planner-agent');

  return {
    catalog:     catalog,
    total_goals: catalog.length,
    planner:     plannerAgent.getPlannerStatus(),
  };
}

module.exports = {
  // P6.5 原有
  plan: plan,
  matchTemplates: matchTemplates,
  countAgents: countAgents,
  collectCommands: collectCommands,
  TASK_TEMPLATES: TASK_TEMPLATES,
  DOMAIN_LABELS: DOMAIN_LABELS,
  CATEGORY_LABELS: CATEGORY_LABELS,
  AGENT_LABELS: AGENT_LABELS,
  // P6.6.3 新增
  planTasks:       planTasks,
  previewPlan:     previewPlan,
  getGoalCatalog:  getGoalCatalog,
};
