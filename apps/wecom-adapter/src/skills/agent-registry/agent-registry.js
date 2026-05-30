'use strict';

/**
 * agent-registry.js — Unified Agent Capability Registry
 *
 * Reads and manages agent-capabilities.json.
 * Supports query by agent name, list all, check capability.
 */

const path = require('path');
const fs = require('fs');

var REGISTRY_PATH = path.join(__dirname, '..', '..', 'storage', 'agent-registry', 'agent-capabilities.json');

var _cache = null;
var _cacheTime = 0;
var CACHE_TTL = 60000;

function getRegistryPath() { return REGISTRY_PATH; }
function setRegistryPath(p) { REGISTRY_PATH = p; _cache = null; }

function load() {
  var now = Date.now();
  if (_cache && (now - _cacheTime) < CACHE_TTL) return _cache;
  _cache = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf-8'));
  _cacheTime = now;
  return _cache;
}

function getAgent(id) {
  var reg = load();
  return reg.agents[id] || null;
}

function listAgents() {
  var reg = load();
  return Object.keys(reg.agents).map(function (id) {
    var a = reg.agents[id];
    return {
      id: id,
      name: a.name,
      provider: a.provider,
      model: a.model,
      status: a.status,
      capabilities: a.capabilities,
      permissions: a.permissions
    };
  });
}

function agentExists(id) {
  return getAgent(id) !== null;
}

function getAgentStatus(id) {
  var a = getAgent(id);
  return a ? a.status : 'unknown';
}

function hasCapability(id, capability) {
  var a = getAgent(id);
  if (!a) return false;
  return a.capabilities.indexOf(capability) !== -1;
}

function hasPermission(id, permission) {
  var a = getAgent(id);
  if (!a) return false;
  return a.permissions.indexOf(permission) !== -1;
}

function getProvider(id) {
  var a = getAgent(id);
  return a ? a.provider : null;
}

function getModel(id) {
  var a = getAgent(id);
  return a ? a.model : null;
}

function formatAgentForWecom(id) {
  var a = getAgent(id);
  if (!a) return null;

  return [
    '# Agent: ' + a.name + ' (' + id + ')',
    '',
    '| Field | Value |',
    '|-------|-------|',
    '| Provider | ' + a.provider + ' |',
    '| Model | ' + a.model + ' |',
    '| Status | ' + a.status + ' |',
    '| Executor | ' + a.executor + ' |',
    '| Human Approval | ' + (a.requiresHumanApproval ? 'Required' : 'Not required') + ' |',
    '| Max Tokens | ' + a.maxTokens + ' |',
    '',
    '## Capabilities',
    a.capabilities.map(function (c) { return '- ' + c; }).join('\n'),
    '',
    '## Permissions',
    a.permissions.map(function (p) { return '- ' + p; }).join('\n'),
    '',
    a.description || ''
  ].join('\n');
}

function formatAllForWecom() {
  var agents = listAgents();
  var lines = ['# Agent List', '', '| ID | Name | Provider | Model | Status |'];
  lines.push('|----|------|----------|-------|--------|');
  agents.forEach(function (a) {
    var statusIcon = a.status === 'online' ? 'online' : 'offline';
    lines.push('| ' + a.id + ' | ' + a.name + ' | ' + a.provider +
      ' | ' + a.model + ' | ' + statusIcon + ' |');
  });
  lines.push('');
  lines.push('Details: /agent ' + agents.map(function(a){return a.id;}).join(' / '));
  return lines.join('\n');
}

module.exports = {
  load: load,
  getAgent: getAgent,
  listAgents: listAgents,
  agentExists: agentExists,
  getAgentStatus: getAgentStatus,
  hasCapability: hasCapability,
  hasPermission: hasPermission,
  getProvider: getProvider,
  getModel: getModel,
  formatAgentForWecom: formatAgentForWecom,
  formatAllForWecom: formatAllForWecom,
  setRegistryPath: setRegistryPath,
  getRegistryPath: getRegistryPath
};
