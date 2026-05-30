'use strict';

/**
 * video-mission-command.js — 视频任务命令处理器
 *
 * 三个入口：
 *   /视频任务  → 创建或运行每日5条视频任务
 *   /视频进度  → 查询任务执行进度
 *   /视频复盘  → 生成视频复盘报告
 *
 * 安全约束：
 *   - REVIEW_ONLY 模式
 *   - real_publish_to_douyin 和 real_ads_launch 必须 CEO 审批
 *   - forbidden_without_approval 动作绝对禁止自动执行
 *   - 不修改 .env/nginx/Vault/密钥
 */

var { createOrRun, queryStatus, generateReport, loadMissionConfig } = require('../skills/dashboard/mission-manager');

var DEFAULT_MISSION_ID = 'doudian-daily-5-videos';

var desc = '酸辣粉视频任务 /视频任务 | /视频进度 | /视频复盘';

/**
 * 处理视频任务命令
 * @param {object} ctx  - 上下文 (user, corpId, cmd)
 * @param {string} args - 用户输入参数
 * @returns {Promise<string>} 企业微信 Markdown
 */
async function execute(ctx, args) {
  var cmd = (ctx && ctx.cmd) || '';
  var input = (args || '').trim();
  var missionId = DEFAULT_MISSION_ID;

  // 支持指定 Mission ID（如 /视频任务 doudian-daily-5-videos）
  if (input.length > 0 && input.indexOf(' ') === -1) {
    // 检查是否为有效的 missionId
    var config = loadMissionConfig(input);
    if (config) {
      missionId = input;
    }
  }

  // ─── /视频任务 → 创建或运行 ──────────────────────────────

  if (cmd === '/视频任务') {
    var result = createOrRun(missionId);
    if (!result.success) {
      return '❌ ' + (result.error || '任务启动失败');
    }

    var config = result.config;
    if (!config) {
      return '✅ ' + (result.message || '任务已启动') + '\n\nRun ID: `' + result.run.run_id + '`';
    }

    // 安全检查摘要
    var safetyCheck = checkAllSafety(config);
    var approvalNote = '';
    if (result.run.approval_required && result.run.approval_required.length > 0) {
      approvalNote = '\n\n⚠️ 需要 CEO 审批的节点:\n' +
        result.run.approval_required.map(function (a) {
          return '- ' + a.name + ': ' + (a.required_for || []).join(', ');
        }).join('\n') +
        '\n请在 /董事会 中审批';
    }

    var lines = [];
    lines.push((config.wecom_outputs && config.wecom_outputs.on_start) || result.message || '🎬 酸辣粉每日5条视频任务已启动');
    lines.push('');
    lines.push('| 属性 | 值 |');
    lines.push('|------|-----|');
    lines.push('| Run ID | `' + result.run.run_id + '` |');
    lines.push('| Mission | ' + (config.mission ? config.mission.name : missionId) + ' |');
    lines.push('| 域名 | ' + (config.mission ? config.mission.domain : 'marketing') + ' |');
    lines.push('| 模式 | ' + (config.mission ? config.mission.review_mode : 'REVIEW_ONLY') + ' |');
    lines.push('| DAG 节点 | ' + ((config.dag && config.dag.nodes) ? config.dag.nodes.length : '?') + ' |');
    lines.push('');

    if (safetyCheck.warnings.length > 0) {
      lines.push('## 🔒 安全声明');
      safetyCheck.warnings.forEach(function (w) {
        lines.push('- ' + w);
      });
      lines.push('');
    }

    if (approvalNote) lines.push(approvalNote);

    lines.push('');
    lines.push('> 使用 /视频进度 查看实时状态');

    return lines.join('\n');
  }

  // ─── /视频进度 → 查询状态 ────────────────────────────────

  if (cmd === '/视频进度') {
    return queryStatus(missionId);
  }

  // ─── /视频复盘 → 生成报告 ────────────────────────────────

  if (cmd === '/视频复盘') {
    return generateReport(missionId);
  }

  // 默认: 帮助
  return [
    '🎬 酸辣粉视频任务系统',
    '',
    '可用命令:',
    '/视频任务  — 创建或运行每日5条视频任务',
    '/视频进度  — 查询任务执行进度和 DAG 状态',
    '/视频复盘  — 生成视频复盘报告含优化建议',
    '',
    '> REVIEW_ONLY 模式 — 不执行真实发布/投流',
    '> 真实发布/投流需 CEO 审批',
  ].join('\n');
}

// ─── 安全检查 ──────────────────────────────────────────────

function checkAllSafety(config) {
  var warnings = [];

  var forbidden = config.approval_rules && config.approval_rules.forbidden_without_approval;
  if (forbidden) {
    warnings.push('禁止自动执行 ' + forbidden.length + ' 个高危动作: ' + forbidden.join(', '));
  }

  var ceoApproval = config.approval_rules && config.approval_rules.ceo_approval_required;
  if (ceoApproval) {
    warnings.push('需要 CEO 审批 ' + ceoApproval.length + ' 个动作: ' + ceoApproval.join(', '));
  }

  warnings.push('当前模式: ' + (config.mission ? config.mission.review_mode : 'REVIEW_ONLY'));
  warnings.push('不执行发布/投流/下单/改价/改库存');

  return { warnings: warnings };
}

module.exports = { execute: execute, desc: desc };
