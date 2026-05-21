'use strict';

const { SKILLS } = require('../skills');
const skillAgent = require('../agents/skill-agent');

async function execute(args) {
  const normalized = (args || '').trim();
  // 有参数但不是"列表" → 执行对应技能
  if (normalized && normalized !== '列表') {
    if (skillAgent && typeof skillAgent.execute === 'function') {
      return skillAgent.execute(normalized);
    }
    return { reply: `技能执行器不可用，无法执行：${normalized}`, success: false };
  }

  // 无参数：列出所有可用技能
  const entries = Object.entries(SKILLS);
  if (entries.length === 0) {
    return { reply: '暂无可用技能', success: true };
  }
  const lines = ['可用技能：', ''];
  for (const [, skill] of entries) {
    const aliasStr = skill.aliases && skill.aliases.length > 0
      ? `（别名：${skill.aliases.join(', ')}）`
      : '';
    lines.push(`${skill.id} - ${skill.description} ${aliasStr}`);
  }
  lines.push('');
  lines.push('💡 用法：/技能 <技能名>');
  return { reply: lines.join('\n'), success: true };
}

module.exports = { execute, desc: '列出或执行技能' };
