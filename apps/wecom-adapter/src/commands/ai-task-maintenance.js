'use strict';
var tm = require('../orchestrator/task-maintenance');

function handleCleanup(args) {
  var sub = (args || '').trim();

  if (sub === '僵尸' || sub === 'zombie') {
    var scan = tm.scan();
    if (scan.zombieCount === 0) return '✅ **无僵尸任务**\n\n健康: ' + scan.healthy + '/' + scan.total;
    var lines = ['🧟 **僵尸任务检测 (' + scan.zombieCount + '/' + scan.total + ')**', ''];
    lines.push('| Task ID | 状态 | 时长 | 规则 |');
    lines.push('|---------|------|------|------|');
    scan.zombies.forEach(function(z) {
      lines.push('| ' + z.taskId + ' | ' + z.status + ' | ' + z.age + ' | ' + z.rule + ' |');
    });
    lines.push('');
    lines.push('💡 `/ai任务 清理` 执行清理');
    return lines.join('\n');
  }

  if (sub === '维护' || sub === 'report') {
    var report = tm.generateReport(tm.scan(), []);
    return report;
  }

  // Default: clean
  var result = tm.clean();
  var lines = ['🧹 **任务维护完成**', ''];
  lines.push('扫描: ' + result.result.total + ' 任务 (' + result.result.healthy + ' 健康, ' + result.result.zombieCount + ' 僵尸)');
  lines.push('取消: ' + result.cancelled.length + ' 个');
  lines.push('');
  if (result.cancelled.length > 0) {
    lines.push('已取消:');
    result.cancelled.forEach(function(c) { lines.push('- `' + c.taskId + '`'); });
  } else {
    lines.push(result.summary);
  }
  lines.push('');
  lines.push('⚠️ Artifact 全部保留');
  return lines.join('\n');
}

module.exports = { handleCleanup: handleCleanup };
