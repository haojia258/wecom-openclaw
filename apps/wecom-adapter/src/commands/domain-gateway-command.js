'use strict';

// P16.2 Enterprise Domain Gateway Command
var reg = require('../domain-gateway/domain-registry');

var desc = '企业OS入口: /电商 /营销 /客服 /办公 /运维 /股票 (REVIEW_ONLY)';

function buildOverview() {
  var domains = reg.listDomains();
  var lines = ['# Enterprise OS — 业务域总览', '', 'REVIEW_ONLY=true — 只做入口展示和能力导航', ''];
  lines.push('| 业务域 | 状态 | 命令数 | 能力数 | 入口命令 |');
  lines.push('|--------|------|--------|--------|----------|');
  domains.forEach(function (d) {
    var entry = d.aliases[0] || d.domainId;
    lines.push('| ' + d.name + ' | ✅ ready | ' + d.commands.length + ' | ' + d.capabilities.length + ' | ' + entry + ' |');
  });
  lines.push('');
  lines.push('输入 /电商 /营销 /客服 /办公 /运维 /股票 进入业务域');
  lines.push('');
  lines.push('REVIEW_ONLY=true — requiresHumanApproval=true');
  return lines.join('\n');
}

function buildDomainView(domainId) {
  var d = reg.getDomain(domainId);
  if (!d) return '❌ 业务域不存在: ' + domainId + '\n\n' + buildOverview();

  var lines = [
    '# ' + d.name + ' — ' + d.description,
    '',
    '| Field | Value |',
    '|-------|-------|',
    '| domainId | ' + d.domainId + ' |',
    '| description | ' + d.description + ' |',
    '| reviewOnly | ' + d.reviewOnly + ' |',
    '| requiresHumanApproval | ' + d.requiresHumanApproval + ' |',
    '',
    '## 可用命令',
    ''
  ];
  d.commands.forEach(function (c) { lines.push('- ' + c); });
  lines.push('');
  lines.push('## 能力');
  d.capabilities.forEach(function (c) { lines.push('- ' + c); });
  lines.push('');
  lines.push('## 关联模块');
  d.relatedModules.forEach(function (m) { lines.push('- ' + m); });
  lines.push('');
  lines.push('REVIEW_ONLY=true — 不自动执行下游命令');
  return lines.join('\n');
}

async function execute(ctx, args) {
  args = (args || '').trim();

  // /企业 → overview
  if (!args) return buildOverview();

  var parts = args.split(/\s+/);
  var sub = parts[0];

  if (sub === '状态') return buildOverview();
  if (sub === '域' || sub === 'domains') return buildOverview();

  // Try to match as a domain command
  var d = reg.findDomainByCommand('/' + sub) || reg.findDomainByCommand(sub);
  if (d) return buildDomainView(d.domainId);

  return 'Unknown: ' + sub + '\n\n' + buildOverview();
}

module.exports = { execute: execute, desc: desc };
