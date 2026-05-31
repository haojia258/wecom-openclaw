'use strict';
var mab = require('../skills/multi-agent-board/multi-agent-board');

function handleBoardMeeting() {
  var meeting = mab.convene();
  var result = meeting.result;

  var lines = [
    '🏛 **多 Agent 董事会议 — ' + meeting.convenedAt.split('T')[0] + '**',
    '',
    '会议 ID: `' + meeting.meetingId + '` | Agent 数: **' + meeting.agents.length + '** | 提案: **' + meeting.proposals.length + '**',
    '',
    '---',
    '',
    '## 📋 提案',
  ];

  meeting.proposals.forEach(function (p, i) {
    lines.push('');
    lines.push('### ' + (i + 1) + '. ' + p.title);
    lines.push('- 来源: ' + p.source + ' | 优先级: ' + priorityLabel(p.priority));
    lines.push('- > ' + p.detail);
  });

  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## 🗳️ 投票结果');
  lines.push('');
  lines.push('| # | 提案 | 赞成 | 反对 | 需补充 | 决策 |');
  lines.push('|---|------|------|------|--------|------|');

  result.results.forEach(function (r, i) {
    var dEmoji = r.decision === 'approved' ? '✅' : '❌';
    lines.push('| ' + (i + 1) + ' | ' + r.proposal.substring(0, 25) + '... | ' + r.approve + ' | ' + r.reject + ' | ' + r.needsInfo + ' | ' + dEmoji + ' ' + r.decision + ' |');
  });

  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## 📊 Agent 投票详情');
  lines.push('');

  meeting.votes.forEach(function (v) {
    lines.push('### ' + v.emoji + ' ' + v.agentName + ' (权重: ' + v.weight + ')');
    v.votes.forEach(function (vv) {
      var vEmoji = vv.vote === 'approve' ? '✅' : vv.vote === 'reject' ? '❌' : '❓';
      lines.push('- ' + vEmoji + ' ' + _findProp(meeting.proposals, vv.proposalId) + ': ' + vv.reason + ' (' + vv.score + '分)');
    });
    lines.push('');
  });

  lines.push('---');
  lines.push('');
  lines.push('## ⚖️ 最终决议');
  lines.push('');
  lines.push('- 共识度: **' + result.consensus + '**');
  lines.push('- 通过: **' + result.approved + '** 项 | 否决: **' + result.rejected + '** 项');
  lines.push('- 结论: **' + result.recommendation + '**');
  lines.push('');
  lines.push('⚠️ REVIEW_ONLY — AI 模拟投票');

  return lines.join('\n');
}

function _findProp(proposals, id) {
  var p = proposals.find(function (p) { return p.id === id; });
  return p ? p.title : id;
}

function priorityLabel(p) {
  return p === 'urgent' ? '🔴 紧急' : p === 'high' ? '🟠 高优' : '🟡 常规';
}

module.exports = { handleBoardMeeting: handleBoardMeeting };
