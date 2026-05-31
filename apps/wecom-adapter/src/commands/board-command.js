'use strict';

/**
 * board-command.js — P13.4 Autonomous Board Command
 *
 * /董事会 — AI 董事会会议（CEO/COO/CTO/CMO/CFO 五角色投票）
 */

var board = require('../skills/autonomous-board/autonomous-board');

// ─── /董事会 ───────────────────────────────────────────────

function handleBoard() {
  var meeting = board.conveneBoardMeeting();
  var members = meeting.members;
  var scorecard = meeting.scorecard;
  var recs = meeting.recommendations;
  var verdict = meeting.verdict;
  var ctx = meeting.context;

  var lines = [];

  // 标题
  lines.push('🏛 **AI 董事会 — ' + ctx.currentMonth + '月经营审议**');
  lines.push('');
  lines.push('会议 ID: `' + meeting.meetingId + '` | ' + meeting.convenedAt.split('T')[0]);
  lines.push('');

  // 数据速览
  lines.push('**经营速览**:');
  lines.push('GMV: ¥' + ctx.gmv.toLocaleString() + ' | 利润率: ' + (ctx.profitMargin * 100).toFixed(1) + '% | ROI: ' + ctx.roi.toFixed(2));
  lines.push('退款率: ' + (ctx.refundRate * 100).toFixed(1) + '% | 预算: ' + ctx.budgetScore + '/100 (' + ctx.budgetStatus + ')');
  lines.push('');

  // 投票结果
  lines.push('---');
  lines.push('');
  lines.push('## 👥 投票结果');
  lines.push('');

  var voteCounts = { approve: 0, reject: 0, needs_info: 0 };
  members.forEach(function (m) {
    lines.push('### ' + m.emoji + ' ' + m.role + ' (' + m.name + ')');
    lines.push('- 投票: **' + voteLabel(m.vote) + '** (置信度: ' + m.confidence + '%)');
    lines.push('- 发言: ' + m.comment);
    if (m.recommendations && m.recommendations.length > 0) {
      m.recommendations.forEach(function (r) {
        lines.push('  > 💡 ' + r);
      });
    }
    lines.push('');
    voteCounts[m.vote]++;
  });

  // 评分卡
  lines.push('---');
  lines.push('');
  lines.push('## 📊 四维评分卡');
  lines.push('');
  lines.push('| 维度 | 评分 | 等级 |');
  lines.push('|------|------|------|');
  Object.keys(scorecard).filter(function (k) { return k !== 'overall'; }).forEach(function (dim) {
    var s = scorecard[dim];
    lines.push('| ' + getDimLabel(dim) + ' | ' + s.score + '/100 | ' + gradeEmoji(s.grade) + ' ' + s.grade + ' (' + gradeLabel(s.grade) + ') |');
  });
  lines.push('| **综合** | **' + scorecard.overall.score + '/100** | **' + gradeEmoji(scorecard.overall.grade) + ' ' + scorecard.overall.grade + ' (' + gradeLabel(scorecard.overall.grade) + ')** |');

  // 建议
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## 💡 董事会建议');
  lines.push('');
  recs.items.forEach(function (item, idx) {
    lines.push((idx + 1) + '. [' + item.from + '] ' + item.text);
  });

  // 最终裁决
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## ⚖️ 董事会决议');
  lines.push('');
  var vEmoji = verdict.risk === 'low' ? '🟢' : verdict.risk === 'medium' ? '🟡' : '🔴';
  lines.push('- **决策**: ' + decisionLabel(verdict.decision));
  lines.push('- **风险**: ' + vEmoji + ' ' + verdict.risk);
  lines.push('- **摘要**: ' + verdict.summary);
  lines.push('');
  lines.push('投票统计: ' + voteCounts.approve + ' 赞成 / ' + voteCounts.needs_info + ' 需补充 / ' + voteCounts.reject + ' 反对');

  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('⚠️ ' + meeting._note);
  lines.push('💡 `/策略` 查看7天计划 | `/预算` 预算详情 | `/周报` 周度趋势');

  return lines.join('\n');
}

// ─── 工具函数 ──────────────────────────────────────────────

function voteLabel(vote) {
  switch (vote) {
    case 'approve': return '✅ 赞成';
    case 'reject': return '❌ 反对';
    case 'needs_info': return '❓ 需补充信息';
    default: return '⚪ 弃权';
  }
}

function decisionLabel(decision) {
  switch (decision) {
    case 'approve': return '✅ 批准执行';
    case 'review': return '🔄 调整后复审';
    case 'reject': return '❌ 驳回 (需 CEO 介入)';
    default: return '⚪ 待定';
  }
}

function gradeEmoji(grade) {
  switch (grade) {
    case 'A': return '🟢';
    case 'B': return '🟢';
    case 'C': return '🟡';
    case 'D': return '🔴';
    default: return '⚪';
  }
}

function gradeLabel(grade) {
  var labels = { A: '优秀', B: '良好', C: '一般', D: '需改进' };
  return labels[grade] || grade;
}

function getDimLabel(dim) {
  var labels = { growth: '增长力', profit: '盈利力', risk: '风控力', budget: '预算力' };
  return labels[dim] || dim;
}

// ─── 导出 ──────────────────────────────────────────────────

module.exports = { handleBoard: handleBoard };

if (require.main === module) {
  console.log(handleBoard());
}
