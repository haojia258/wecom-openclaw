'use strict';

const { resolveSkill } = require('../skills');

/**
 * 标准化 input 为字符串
 */
function normalizeInput(input) {
  if (typeof input === 'string') return input.trim();
  if (Array.isArray(input)) return input.join(' ').trim();
  if (input && typeof input === 'object') {
    if (typeof input.text === 'string') return input.text.trim();
    if (typeof input.content === 'string') return input.content.trim();
    if (typeof input.raw === 'string') return input.raw.trim();
    if (typeof input.args === 'string') return input.args.trim();
    return '';
  }
  return '';
}

/**
 * 从执行结果中提取纯文本
 * 优先级：text → message → reply → data.summaryText → JSON.stringify → 兜底
 */
function extractText(result) {
  if (typeof result === 'string') return result;
  if (!result || typeof result !== 'object') return '技能执行完成';
  if (typeof result.text === 'string') return result.text;
  if (typeof result.message === 'string') return result.message;
  if (typeof result.reply === 'string') return result.reply;
  if (result.data && typeof result.data.summaryText === 'string') return result.data.summaryText;
  try { return JSON.stringify(result, null, 2); } catch (_) { return '技能执行完成'; }
}

async function execute(ctx, input) {
  // 兼容直接调用 execute('ops-summary') 的测试写法
  if (typeof ctx === 'string' && input === undefined) {
    input = ctx;
    ctx = {};
  }
  const skillName = normalizeInput(input);
  const skill = resolveSkill(skillName);
  if (!skill) {
    return '未知技能。输入 /技能 查看可用技能';
  }
  switch (skill.id) {
    case 'ops-summary': {
      const result = await require('../commands/ops-summary').execute(ctx);
      return extractText(result);
    }
    case 'push-summary': {
      const result = await require('../commands/push-summary').execute(ctx);
      return extractText(result);
    }
    default:
      return `技能 ${skill.id} 未实现`;
  }
}

module.exports = { execute };
