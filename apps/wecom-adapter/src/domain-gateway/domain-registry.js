'use strict';

// P16.1 Enterprise Domain Registry
var DOMAINS = [
  {
    domainId: 'commerce',
    name: '电商',
    description: '电商运营：GMV/订单/利润/活动/风险监控',
    commands: ['/今日GMV', '/订单', '/利润', '/风险', '/活动利润', '/活动报名'],
    aliases: ['/电商', '/ecommerce', '/shop'],
    capabilities: ['gmv_tracking', 'order_monitor', 'profit_analysis', 'risk_alert', 'campaign_profit', 'event_signup'],
    relatedModules: ['P13-product-asset', 'P15-marketing-engine'],
    reviewOnly: true,
    requiresHumanApproval: true,
    enabled: true
  },
  {
    domainId: 'marketing',
    name: '营销',
    description: '投流中心：视频素材/ROI分析/预算建议/素材匹配',
    commands: ['/视频素材', '/投流中心', '/投流分析', '/视频建议'],
    aliases: ['/营销', '/marketing', '/ad'],
    capabilities: ['video_material', 'roi_analysis', 'ctr_tracking', 'budget_recommendation', 'campaign_decision', 'ad_creative_match'],
    relatedModules: ['P13-product-asset', 'P14-video-material', 'P15-marketing-engine'],
    reviewOnly: true,
    requiresHumanApproval: true,
    enabled: true
  },
  {
    domainId: 'customer',
    name: '客服',
    description: '客服工作台：咨询/订单查询/售后/退款风险',
    commands: ['/客服', '/风险', '/订单'],
    aliases: ['/客服', '/support', '/cs'],
    capabilities: ['inquiry_handler', 'order_lookup', 'refund_risk', 'after_sales'],
    relatedModules: ['P15-marketing-engine'],
    reviewOnly: true,
    requiresHumanApproval: true,
    enabled: true
  },
  {
    domainId: 'office',
    name: '办公',
    description: '企业办公：运营摘要/系统状态/帮助菜单',
    commands: ['/ops-summary', '/状态', '/帮助'],
    aliases: ['/办公', '/office', '/ops'],
    capabilities: ['ops_summary', 'system_status', 'help_menu'],
    relatedModules: ['P15.1-task-dashboard'],
    reviewOnly: true,
    requiresHumanApproval: true,
    enabled: true
  },
  {
    domainId: 'devops',
    name: '运维',
    description: '系统运维：Worker/Agent/AI任务/任务图',
    commands: ['/worker', '/agent', '/ai任务', '/任务图'],
    aliases: ['/运维', '/devops', '/infra'],
    capabilities: ['worker_status', 'agent_status', 'ai_task_management', 'task_graph_view'],
    relatedModules: ['P11-task-graph', 'P12-agent-registry', 'P15.1-task-dashboard'],
    reviewOnly: true,
    requiresHumanApproval: true,
    enabled: true
  },
  {
    domainId: 'trading',
    name: '股票',
    description: '投资观察：股票分析/转债分析/套利观察(NOT trading advice)',
    commands: ['/股票', '/转债', '/套利'],
    aliases: ['/股票', '/trading', '/stock'],
    capabilities: ['stock_analysis', 'cb_analysis', 'arbitrage_observation'],
    relatedModules: [],
    reviewOnly: true,
    requiresHumanApproval: true,
    enabled: true
  }
];

var _registry = {};

function init() {
  DOMAINS.forEach(function (d) { _registry[d.domainId] = d; });
}

function listDomains() {
  if (Object.keys(_registry).length === 0) init();
  return Object.values(_registry).filter(function (d) { return d.enabled !== false; });
}

function getDomain(domainId) {
  if (Object.keys(_registry).length === 0) init();
  return _registry[domainId] || null;
}

function findDomainByCommand(command) {
  if (Object.keys(_registry).length === 0) init();
  var domains = listDomains();
  for (var i = 0; i < domains.length; i++) {
    var d = domains[i];
    if (d.aliases.indexOf(command) >= 0 || d.commands.indexOf(command) >= 0) return d;
    if (d.domainId === command) return d;
    if (d.name === command) return d;
  }
  return null;
}

function listDomainCapabilities(domainId) {
  var d = getDomain(domainId);
  return d ? d.capabilities : [];
}

function validateDomainConfig(domain) {
  var errors = [];
  if (!domain.domainId) errors.push('Missing domainId');
  if (!domain.name) errors.push('Missing name');
  if (!domain.commands || domain.commands.length === 0) errors.push('Missing commands');
  if (domain.reviewOnly !== true) errors.push('reviewOnly must be true');
  if (domain.requiresHumanApproval !== true) errors.push('requiresHumanApproval must be true');
  return { valid: errors.length === 0, errors: errors };
}

function routeDomainCommand(input) {
  if (Object.keys(_registry).length === 0) init();
  var cmd = (input || '').trim();
  var domain = findDomainByCommand(cmd);
  if (!domain) return { found: false, input: cmd };

  return {
    found: true,
    domainId: domain.domainId,
    domainName: domain.name,
    description: domain.description,
    suggestedCommands: domain.commands,
    capabilities: domain.capabilities,
    relatedModules: domain.relatedModules,
    reviewOnly: domain.reviewOnly,
    requiresHumanApproval: domain.requiresHumanApproval
  };
}

function stats() {
  var domains = listDomains();
  return {
    total: domains.length,
    enabled: domains.filter(function (d) { return d.enabled; }).length,
    totalCapabilities: domains.reduce(function (s, d) { return s + d.capabilities.length; }, 0),
    totalCommands: domains.reduce(function (s, d) { return s + d.commands.length; }, 0)
  };
}

module.exports = {
  init: init,
  listDomains: listDomains,
  getDomain: getDomain,
  findDomainByCommand: findDomainByCommand,
  listDomainCapabilities: listDomainCapabilities,
  validateDomainConfig: validateDomainConfig,
  routeDomainCommand: routeDomainCommand,
  stats: stats,
  DOMAINS: DOMAINS
};
