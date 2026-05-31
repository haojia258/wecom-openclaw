'use strict';
var loop = require('../skills/autonomous-loop/autonomous-loop');

function handleAutonomousLoop() {
  var result = loop.runLoop();

  var lines = [
    '🔄 **自治公司闭环 — ' + result.executedAt.split('T')[0] + '**',
    '',
    'Loop ID: `' + result.loopId + '` | 健康度: **' + result.summary.health + '**',
    '',
    '---',
    '',
    '## ⚙️ 闭环阶段',
    '',
    '| 阶段 | 状态 |',
    '|------|------|',
  ];

  result.stages.forEach(function (s) {
    var emoji = s.status === 'ok' || s.status === 'archived' ? '✅' : s.status === 'skipped' ? '⬜' : '⚠️';
    lines.push('| ' + emoji + ' Stage ' + s.stage + ': ' + s.name + ' | ' + s.status + ' |');
  });

  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## 📊 闭环详情');

  result.stages.forEach(function (s) {
    if (!s.data) return;
    lines.push('');
    lines.push('### Stage ' + s.stage + ': ' + s.name);

    if (s.name === 'Goal' && s.data) {
      lines.push('- 达标: ' + s.data.onTrack + ' | 风险: ' + s.data.atRisk + ' | 落后: ' + s.data.behind);
    } else if (s.name === 'Decision' && s.data) {
      lines.push('- 决策: ' + s.data.total + ' 项 (' + s.data.highPriority + ' 项高优) | 均置信度: ' + s.data.avgConfidence + '%');
    } else if (s.name === 'Plan' && s.data) {
      lines.push('- 任务: ' + s.data.total + ' 项 | 紧急: ' + s.data.urgent + ' | 负责人: ' + s.data.owners.join(', '));
    } else if (s.name === 'Board' && s.data) {
      lines.push('- 通过: ' + s.data.approved + ' | 否决: ' + s.data.rejected + ' | 共识度: ' + s.data.consensus);
    } else if (s.name === 'Task' && s.data) {
      lines.push('- 待审批: ' + s.data.pending + ' 项');
    } else if (s.name === 'Review' && s.data) {
      lines.push('- 评分: ' + s.data.score + '/100 (' + s.data.grade + ') | ' + s.data.note);
    }
  });

  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## 🎯 闭环结论');
  lines.push('');
  lines.push('- 建议: **' + result.summary.recommendation + '**');
  lines.push('- 可部署: ' + (result.stages[5].data.readyForDeploy !== false ? '是' : '否（需人工审批）'));
  lines.push('');
  lines.push('⚠️ REVIEW_ONLY — AI 自治闭环仅供审查');
  lines.push('💡 `/董事会会议` Agent投票 | `/执行计划` 任务清单');

  return lines.join('\n');
}

module.exports = { handleAutonomousLoop: handleAutonomousLoop };
