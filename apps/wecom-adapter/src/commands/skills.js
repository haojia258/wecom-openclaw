'use strict';

const { SKILLS } = require('../skills');
const skillAgent = require('../agents/skill-agent');

/**
 * 标准化 args 为字符串
 * 支持：string / array / object / null / undefined
 */
function normalizeArgs(args) {
  if (typeof args === 'string') return args.trim();
  if (Array.isArray(args)) return args.join(' ').trim();
  if (args && typeof args === 'object') {
    // 常见字段优先级
    if (typeof args.text === 'string') return args.text.trim();
    if (typeof args.content === 'string') return args.content.trim();
    if (typeof args.raw === 'string') return args.raw.trim();
    if (typeof args.args === 'string') return args.args.trim();
    // 如果是 { handler, args } 结构（command-center 返回值），取 args
    if (typeof args.args === 'string') return args.args.trim();
    return '';
  }
  return '';
}

async function execute(args) {
  const normalized = normalizeArgs(args);
  // 有参数但不是"列表" → 执行对应技能
  if (normalized && normalized !== '列表') {
    if (skillAgent && typeof skillAgent.execute === 'function') {
      return skillAgent.execute(normalized);
    }
    return { reply: `技能执行器不可用，无法执行：${normalized}`, success: false };
  }

  // 无参数或"列表" → 列出所有可用技能
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
