'use strict';

/**
 * agent-capability.js — /agent 命令处理器
 *
 * /agent 列表          — list all agents
 * /agent <id>          — show agent details
 * /agent <id> 能力     — show capabilities
 */

var registry = require('../skills/agent-registry/agent-registry.js');

var desc = 'Agent能力注册中心: 查询/列表';

function execute(ctx, args) {
  args = (args || '').trim();

  if (!args || args === '列表' || args === 'list' || args === 'l') {
    return registry.formatAllForWecom();
  }

  var parts = args.split(/\s+/);
  var agentId = parts[0];
  var sub = parts[1] || '';

  if (!registry.agentExists(agentId)) {
    return 'Unknown agent: ' + agentId +
      '\n\nAvailable: ' + registry.listAgents().map(function(a){return a.id;}).join(', ') +
      '\n\nUsage: /agent 列表  or  /agent codex';
  }

  // Capability sub-command
  if (sub === '能力' || sub === 'capabilities' || sub === 'cap') {
    var a = registry.getAgent(agentId);
    return [
      '# ' + a.name + ' Capabilities',
      '',
      a.capabilities.map(function(c){return '- ' + c;}).join('\n'),
      '',
      '## Permissions',
      a.permissions.map(function(p){return '- ' + p;}).join('\n')
    ].join('\n');
  }

  return registry.formatAgentForWecom(agentId);
}

module.exports = { execute: execute, desc: desc };
