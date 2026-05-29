'use strict';

/**
 * mission-router.js - P11.0 Mission Router
 *
 * 职责: 将自然语言任务映射为结构化 Mission 定义
 * 规则版，不调用外部大模型
 *
 * 关键词路由 → mission_type + agent_requirements + approval_requirements
 */

// ─── 路由规则表 ───────────────────────────────────────────

var ROUTE_RULES = [
  // P10.8 / autonomous / 自治
  {
    keywords: ['p10.8', 'autonomous', '自治', 'autonomous loop', 'execution loop'],
    mission_type: 'autonomous-loop',
    default_capability: 'mission.execute',
    requires_approval: false,
    tags: ['mission', 'autonomous']
  },
  // P11 / commander / 企业微信
  {
    keywords: ['p11', 'commander', '企业微信', 'wecom', 'wechat work'],
    mission_type: 'commander',
    default_capability: 'mission.command',
    requires_approval: false,
    tags: ['commander', 'wecom']
  },
  // 电商 / 抖店 / 商品 / 订单
  {
    keywords: ['电商', '抖店', '商品', '订单', 'shop', 'ecommerce', '商品管理'],
    mission_type: 'commerce',
    default_capability: 'commerce.manage',
    requires_approval: false,
    tags: ['commerce', 'douyin']
  },
  // 投流 / 广告 / ROI
  {
    keywords: ['投流', '广告', 'roi', 'ad', 'marketing', '投放', '千川'],
    mission_type: 'marketing',
    default_capability: 'marketing.campaign',
    requires_approval: false,
    tags: ['marketing', 'advertising']
  },
  // 客服 / 回复 / 售后
  {
    keywords: ['客服', '回复', '售后', 'customer', '工单', '退换货'],
    mission_type: 'customer',
    default_capability: 'customer.service',
    requires_approval: false,
    tags: ['customer', 'service']
  },
  // 运维 / 部署 / PM2
  {
    keywords: ['运维', '部署', 'pm2', 'deploy', '重启', 'restart', '服务器', 'server'],
    mission_type: 'devops',
    default_capability: 'devops.manage',
    requires_approval: true,   // 运维操作需要审批！
    tags: ['devops', 'deployment']
  },
  // 股票 / 可转债
  {
    keywords: ['股票', '可转债', 'trading', '行情', 'k线', 'stock', 'bond'],
    mission_type: 'trading',
    default_capability: 'trading.analyze',
    requires_approval: false,
    tags: ['trading', 'finance']
  },
  // 测试 / 验证 / regression
  {
    keywords: ['测试', '验证', 'regression', 'test', 'qa', '质量'],
    mission_type: 'testing',
    default_capability: 'testing.execute',
    requires_approval: false,
    tags: ['testing', 'qa']
  },
  // 合并 / PR / git
  {
    keywords: ['合并', 'pr', 'merge', 'git', '代码', 'code review'],
    mission_type: 'devops',
    default_capability: 'git.merge',
    requires_approval: true,   // git merge 需要审批！
    tags: ['git', 'code']
  }
];

// ─── 需要审批的 capability 列表 ─────────────────────────────

var APPROVAL_CAPABILITIES = [
  'deploy.production',
  'pm2.restart',
  'git.merge',
  'server.write',
  'devops.manage',
  'system.admin'
];

// ─── 关键词匹配 ────────────────────────────────────────────

/**
 * 从文本中匹配路由规则
 *
 * @param {string} text - 输入文本
 * @returns {object|null} 匹配的路由规则，无匹配返回 null
 */
function matchRoute(text) {
  if (!text || typeof text !== 'string') return null;

  var lower = text.toLowerCase();

  // 按顺序匹配，返回第一个命中
  for (var ri = 0; ri < ROUTE_RULES.length; ri++) {
    var rule = ROUTE_RULES[ri];
    for (var ki = 0; ki < rule.keywords.length; ki++) {
      var kw = rule.keywords[ki].toLowerCase();
      if (lower.indexOf(kw) !== -1) {
        return rule;
      }
    }
  }

  // 无匹配 → 默认 general
  return {
    keywords: [],
    mission_type: 'general',
    default_capability: 'general.execute',
    requires_approval: false,
    tags: ['general']
  };
}

// ─── Agent 需求生成 ────────────────────────────────────────

/**
 * 根据路由规则生成 agent 需求
 *
 * @param {object} route - 路由规则
 * @param {string} text  - 输入文本
 * @returns {object} agent requirements
 */
function generateAgentRequirements(route, text) {
  var agents = [];

  // 根据 mission_type 分配默认 agent
  switch (route.mission_type) {
    case 'autonomous-loop':
      agents.push({ agent: 'workbuddy', capability: 'mission.execute' });
      break;
    case 'commander':
      agents.push({ agent: 'commander', capability: 'mission.command' });
      break;
    case 'commerce':
      agents.push({ agent: 'workbuddy', capability: 'commerce.manage' });
      break;
    case 'marketing':
      agents.push({ agent: 'workbuddy', capability: 'marketing.campaign' });
      break;
    case 'customer':
      agents.push({ agent: 'workbuddy', capability: 'customer.service' });
      break;
    case 'devops':
      agents.push({ agent: 'workbuddy', capability: 'devops.manage' });
      if (text.toLowerCase().indexOf('deploy') !== -1 || text.indexOf('部署') !== -1) {
        agents.push({ agent: 'workbuddy', capability: 'deploy.production' });
      }
      if (text.toLowerCase().indexOf('pm2') !== -1 || text.indexOf('重启') !== -1) {
        agents.push({ agent: 'workbuddy', capability: 'pm2.restart' });
      }
      if (text.toLowerCase().indexOf('merge') !== -1 || text.indexOf('合并') !== -1) {
        agents.push({ agent: 'workbuddy', capability: 'git.merge' });
      }
      break;
    case 'trading':
      agents.push({ agent: 'workbuddy', capability: 'trading.analyze' });
      break;
    case 'testing':
      agents.push({ agent: 'workbuddy', capability: 'testing.execute' });
      break;
    default:
      agents.push({ agent: 'workbuddy', capability: 'general.execute' });
      break;
  }

  return {
    agents: agents,
    min_agents: 1,
    max_concurrent: agents.length
  };
}

// ─── 审批需求判定 ──────────────────────────────────────────

/**
 * 判断是否需要审批
 *
 * @param {object} route         - 路由规则
 * @param {object} agentReqs     - agent 需求
 * @returns {object} approval requirements
 */
function generateApprovalRequirements(route, agentReqs) {
  var required = route.requires_approval === true;

  // 检查 agent capabilities 是否包含需要审批的操作
  if (!required && agentReqs && agentReqs.agents) {
    for (var ai = 0; ai < agentReqs.agents.length; ai++) {
      var cap = agentReqs.agents[ai].capability;
      if (APPROVAL_CAPABILITIES.indexOf(cap) !== -1) {
        required = true;
        break;
      }
    }
  }

  return {
    requires_approval: required,
    approval_type: required ? 'manual' : 'auto',
    required_roles: required ? ['operator', 'owner'] : [],
    timeout_minutes: required ? 30 : 0
  };
}

// ─── 全文路由 ──────────────────────────────────────────────

/**
 * 将输入文本路由为完整 Mission 蓝图
 *
 * @param {string} text     - 用户输入文本
 * @param {object} options  - { source?: string, operator?: string, room?: string }
 * @returns {object} mission 蓝图
 */
function route(text, options) {
  if (!options) options = {};

  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return {
      success: false,
      error: '输入文本不能为空'
    };
  }

  // 文本长度限制
  if (text.length > 2000) {
    return {
      success: false,
      error: '输入文本超过 2000 字符限制'
    };
  }

  var trimmed = text.trim();
  var rule = matchRoute(trimmed);
  var agentReqs = generateAgentRequirements(rule, trimmed);
  var approvalReqs = generateApprovalRequirements(rule, agentReqs);

  // 生成 task_graph nodes
  var nodes = generateTaskGraphNodes(rule, agentReqs, approvalReqs, trimmed);

  return {
    success: true,
    mission: {
      source: options.source || 'unknown',
      text: trimmed,
      operator: options.operator || 'unknown',
      room: options.room || '',
      mission_type: rule.mission_type,
      tags: rule.tags || []
    },
    task_graph: {
      nodes: nodes,
      parallelism: agentReqs.max_concurrent || 1
    },
    agent_requirements: agentReqs,
    approval_requirements: approvalReqs,
    artifact_workspace: {
      base_dir: 'missions',
      auto_index: true,
      artifacts: ['dispatch.json', 'loop-report.json', 'approval-log.json']
    }
  };
}

// ─── Task Graph 节点生成 ───────────────────────────────────

function generateTaskGraphNodes(rule, agentReqs, approvalReqs, text) {
  var nodes = [];
  var idx = 0;

  // Step 1: 解析任务
  nodes.push({
    id: 'parse_mission',
    name: '解析任务',
    capability: 'general.execute',
    status: 'pending',
    dependsOn: [],
    description: 'Parse mission text: ' + text.substring(0, 50)
  });

  idx = 1;

  // Step 2: 按 agent 需求生成节点
  if (agentReqs && agentReqs.agents) {
    for (var ai = 0; ai < agentReqs.agents.length; ai++) {
      var ag = agentReqs.agents[ai];
      nodes.push({
        id: 'execute_' + ag.agent + '_' + idx,
        name: ag.agent + ' 执行 ' + ag.capability,
        capability: ag.capability,
        agent: ag.agent,
        status: 'pending',
        dependsOn: ['parse_mission'],
        description: 'Execute ' + ag.capability + ' via ' + ag.agent
      });
      idx++;
    }
  }

  // Step 3: 审批节点（如果需要）
  if (approvalReqs.requires_approval) {
    nodes.push({
      id: 'await_approval',
      name: '等待审批',
      capability: 'approval.wait',
      status: 'pending',
      dependsOn: idx > 1 ? ['execute_workbuddy_1'] : ['parse_mission'],
      description: 'Await operator approval for sensitive operation'
    });
  }

  // Step 4: 生成报告
  nodes.push({
    id: 'generate_report',
    name: '生成报告',
    capability: 'report.generate',
    status: 'pending',
    dependsOn: nodes.slice(1).map(function(n) { return n.id; }),
    description: 'Generate mission report and artifacts'
  });

  return nodes;
}

// ─── 导出 ──────────────────────────────────────────────────

module.exports = {
  route: route,
  matchRoute: matchRoute,
  generateAgentRequirements: generateAgentRequirements,
  generateApprovalRequirements: generateApprovalRequirements,
  generateTaskGraphNodes: generateTaskGraphNodes,
  ROUTE_RULES: ROUTE_RULES,
  APPROVAL_CAPABILITIES: APPROVAL_CAPABILITIES
};
