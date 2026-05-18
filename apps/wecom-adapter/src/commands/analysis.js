'use strict';

/**
 * /运营分析 命令
 * v1.0 - 本地规则分析 + 可选 GPT 增强
 * 本地结果在 GPT 不可用时会完整返回
 */

const opsRules = require('../lib/ops-rules');

async function execute(ctx) {
  // 1. 本地规则分析（必须有结果）
  let result;
  try {
    result = opsRules.analyzeFromDisk();
  } catch (e) {
    return '⚠️ 运营分析失败：' + e.message.slice(0, 100);
  }

  // 2. 格式化输出
  let lines = ['📊 今日运营分析'];
  lines.push('');

  // 摘要
  lines.push('【今日运营摘要】');
  lines.push(result.summary || '暂无数据');
  lines.push('');

  // 风险提示
  lines.push('【风险提示】');
  if (result.risks && result.risks.length > 0) {
    for (const r of result.risks) {
      lines.push('• ' + r);
    }
  } else {
    lines.push('✅ 暂无高风险预警');
  }
  lines.push('');

  // SKU 建议
  lines.push('【SKU 建议】');
  lines.push(result.skuAdvice || '数据缺失，无法给出建议');
  lines.push('');

  // 活动建议
  lines.push('【活动建议】');
  lines.push(result.activityAdvice || '数据缺失，无法判断');
  lines.push('');

  // 补货建议
  lines.push('【补货建议】');
  lines.push(result.inventoryAdvice || '暂不支持');
  lines.push('');

  // 今日最优先
  lines.push('【今日最优先动作】');
  lines.push(result.priorityAction || '暂无');
  lines.push('');

  let output = lines.join('\n');

  // 3. GPT 增强（可选，失败不影响本地结果）
  // 如果配置了 OpenClaw/GPT，可以在此调用
  // 当前版本：跳过 GPT，本地规则完整返回

  // 限制长度
  if (output.length > 1800) {
    output = output.slice(0, 1797) + '...';
  }

  return output;
}

module.exports = { execute, desc: '运营分析' };
