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

async function execute(input, ctx) {
  const skillName = normalizeInput(input);
  const skill = resolveSkill(skillName);
  if (!skill) {
    return { reply: '未知技能。输入 /技能 查看可用技能', success: false };
  }
  switch (skill.id) {
    case 'ops-summary':
      return require('../commands/ops-summary').execute(ctx);
    default:
      return { reply: `技能 ${skill.id} 未实现`, success: false };
  }
}

module.exports = { execute };
