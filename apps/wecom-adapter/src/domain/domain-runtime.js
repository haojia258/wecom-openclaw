'use strict';

var registry = require('./domain-registry');
var crypto = require('crypto');

var missions = {};

function createDomainMission(params) {
  var domain = params.domain || registry.routeToDomain(params.text||'');
  var dm = registry.getDomain(domain);
  if (!dm) return { success: false, error: 'unknown domain: ' + domain };

  var missionId = 'dm_' + domain + '_' + Date.now().toString(36) + '_' + crypto.randomBytes(2).toString('hex');
  var m = {
    mission_id: missionId, domain: domain, domain_name: dm.name,
    text: params.text || '', status: 'created', agents: dm.agents,
    nodes: dm.agents.map(function(a,i) { return { id:'n'+i, agent:a, action:'general.execute', status:'pending', result:null }; }),
    created_at: new Date().toISOString(), progress: 0, report: null
  };
  missions[missionId] = m;
  return { success: true, mission: m };
}

function getMission(id) { var m=missions[id]; return m ? { success:true, mission:m } : { success:false, error:'not found' }; }
function listMissions(filter) {
  var list = Object.values(missions);
  if (filter && filter.domain) list = list.filter(function(m){return m.domain===filter.domain;});
  return { success: true, missions: list, total: list.length };
}
function runMission(id) {
  var m = missions[id]; if (!m) return { success: false, error: 'not found' };
  m.status = 'in_progress'; m.nodes.forEach(function(n){ n.status='dispatched'; });
  m.progress = 50; return { success: true, mission: m };
}
function updateMission(id, patch) {
  var m = missions[id]; if (!m) return { success: false, error: 'not found' };
  if (patch.status) m.status = patch.status;
  if (patch.progress !== undefined) m.progress = patch.progress;
  if (patch.report) m.report = patch.report;
  return { success: true, mission: m };
}

module.exports = { createDomainMission, getMission, listMissions, runMission, updateMission };
