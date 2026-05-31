'use strict';

/**
 * domain-registry.js - P12.0 Domain Registry
 */

var DOMAINS = {
  commerce:  { name: 'Commerce',  agents: ['codex','workbuddy','deepseek','doubao'], keywords: ['GMV','利润','活动','投流','视频','库存','退款','运营','抖店'] },
  marketing: { name: 'Marketing', agents: ['codex','workbuddy','deepseek','doubao'], keywords: ['ROI','CTR','CVR','广告','投放','素材','流量'] },
  customer:  { name: 'Customer',  agents: ['workbuddy','doubao'], keywords: ['客服','售后','差评','FAQ','回复','客户'] },
  devops:    { name: 'DevOps',    agents: ['workbuddy','deepseek'], keywords: ['deploy','健康','PM2','端口','日志','rollback','审计'] },
  trading:   { name: 'Trading',   agents: ['workbuddy','deepseek','doubao'], keywords: ['股票','转债','溢价','行情','观察','风险提醒'] },
  office:    { name: 'Office',    agents: ['workbuddy','codex','doubao'], keywords: ['文档','报表','总结','分析'] }
};

function getDomain(domain) { return DOMAINS[domain] || null; }
function listDomains() { return Object.keys(DOMAINS).map(function(k) { var d=DOMAINS[k]; return { id:k, name:d.name, agents:d.agents, keywords:d.keywords }; }); }
function domainExists(domain) { return !!DOMAINS[domain]; }

function routeToDomain(text) {
  text = (text||'').toLowerCase();
  for (var key in DOMAINS) {
    var kw = DOMAINS[key].keywords;
    for (var i=0;i<kw.length;i++) { if (text.indexOf(kw[i].toLowerCase())!==-1) return key; }
  }
  return 'office';
}

module.exports = { getDomain, listDomains, domainExists, routeToDomain, DOMAINS };
