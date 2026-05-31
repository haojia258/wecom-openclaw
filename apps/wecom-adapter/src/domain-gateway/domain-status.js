'use strict';

// P16.3 Domain Status Dashboard
var reg = require('./domain-registry');

var STATUS_MAP = {
  commerce: 'ready',
  marketing: 'ready',
  customer: 'partial',
  office: 'ready',
  devops: 'ready',
  trading: 'planned'
};

function getDomainStatus(domainId) {
  var d = reg.getDomain(domainId);
  if (!d) return null;

  return {
    domainId: domainId,
    name: d.name,
    status: STATUS_MAP[domainId] || 'unknown',
    commandCount: d.commands.length,
    capabilityCount: d.capabilities.length,
    relatedModules: d.relatedModules,
    reviewOnly: d.reviewOnly,
    requiresHumanApproval: d.requiresHumanApproval,
    lastCheckedAt: new Date().toISOString()
  };
}

function getAllDomainStatus() {
  return reg.listDomains().map(function (d) {
    return getDomainStatus(d.domainId);
  });
}

function summarizeDomainHealth() {
  var all = getAllDomainStatus();
  var total = all.length;
  var ready = all.filter(function (d) { return d.status === 'ready'; }).length;
  var partial = all.filter(function (d) { return d.status === 'partial'; }).length;
  var planned = all.filter(function (d) { return d.status === 'planned'; }).length;
  var disabled = all.filter(function (d) { return d.status === 'disabled'; }).length;

  var health;
  if (ready === total) health = 'excellent';
  else if (ready + partial >= total - 1) health = 'good';
  else if (ready >= 2) health = 'fair';
  else health = 'needs_attention';

  return {
    total: total,
    ready: ready,
    partial: partial,
    planned: planned,
    disabled: disabled,
    health: health,
    reviewOnly: true,
    checkedAt: new Date().toISOString()
  };
}

function collectRelatedModuleStatus(domainId) {
  var d = reg.getDomain(domainId);
  if (!d) return { domainId: domainId, found: false };

  return {
    domainId: domainId,
    name: d.name,
    modules: d.relatedModules.map(function (m) {
      return { module: m, status: 'available' };
    }),
    reviewOnly: true
  };
}

function formatDomainStatusReport() {
  var all = getAllDomainStatus();
  var health = summarizeDomainHealth();

  var lines = [
    '# Enterprise Domain Status Dashboard',
    '',
    '健康度: ' + health.health + ' (' + health.ready + '/' + health.total + ' ready)',
    '',
    '| 业务域 | 状态 | 命令 | 能力 | 模块 | reviewOnly |',
    '|--------|------|------|------|------|------------|'
  ];

  all.forEach(function (d) {
    var statusIcon = { ready: '✅', partial: '⚠️', planned: '📋', disabled: '❌' };
    lines.push('| ' + d.name + ' | ' + (statusIcon[d.status] || '❓') + ' ' + d.status + ' | ' + d.commandCount + ' | ' + d.capabilityCount + ' | ' + d.relatedModules.length + ' | ' + d.reviewOnly + ' |');
  });

  lines.push('');
  lines.push('REVIEW_ONLY=true — no downstream execution');
  return lines.join('\n');
}

module.exports = {
  getDomainStatus: getDomainStatus,
  getAllDomainStatus: getAllDomainStatus,
  summarizeDomainHealth: summarizeDomainHealth,
  collectRelatedModuleStatus: collectRelatedModuleStatus,
  formatDomainStatusReport: formatDomainStatusReport,
  STATUS_MAP: STATUS_MAP
};
