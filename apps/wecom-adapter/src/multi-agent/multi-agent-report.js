'use strict';

/**
 * multi-agent-report.js - P11.4 Multi-Agent Report Generator
 */

function generateReport(plan) {
  var nodeSummary = plan.nodes.map(function(n) {
    return {
      id: n.id,
      node_type: n.node_type,
      agent: n.agent,
      label: n.label,
      status: n.status,
      job_id: n.job_id,
      result: n.result
    };
  });

  return {
    mission_id: plan.mission_id,
    graph_id: plan.graph_id,
    mission_type: plan.mission_type,
    status: plan.status,
    progress: plan.progress,
    total_nodes: plan.total_nodes,
    completed_nodes: plan.completed_nodes,
    failed_nodes: plan.failed_nodes,
    agents: plan.agents,
    nodes: nodeSummary,
    parallel_groups: plan.parallel_groups ? plan.parallel_groups.length : 0,
    generated_at: new Date().toISOString()
  };
}

function formatWeComReport(plan) {
  var lines = [];
  var emoji = plan.status === 'completed' ? '\u2705' : plan.status === 'failed' ? '\u274C' : '\uD83D\uDD04';
  
  lines.push(emoji + ' **Multi-Agent Mission: ' + plan.mission_id + '**');
  lines.push('');
  lines.push('| 字段 | 值 |');
  lines.push('|------|-----|');
  lines.push('| Status | ' + plan.status + ' |');
  lines.push('| Progress | ' + plan.progress + '% (' + plan.completed_nodes + '/' + plan.total_nodes + ') |');
  lines.push('| Agents | ' + (plan.agents || []).join(', ') + ' |');
  lines.push('');
  
  plan.nodes.forEach(function(n) {
    var sIcon = n.status === 'completed' ? '\u2705' : n.status === 'failed' ? '\u274C' : n.status === 'dispatched' ? '\uD83D\uDCE4' : '\u23F3';
    lines.push(sIcon + ' ' + n.agent + ': ' + (n.label || n.node_type) + ' — ' + n.status);
  });

  return lines.join('\n');
}

module.exports = {
  generateReport: generateReport,
  formatWeComReport: formatWeComReport
};
