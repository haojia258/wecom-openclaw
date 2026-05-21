'use strict';

const { SKILLS } = require('../skills');
const skillAgent = require('../agents/skill-agent');

/**
 * 标准化 args 为字符串
 */
function normalizeArgs(args) {
  if (typeof args === 'string') return args.trim();
  if (Array.isArray(args)) return args.join(' ').trim();
  if (args && typeof args === 'object') {
    if (typeof args.text === 'string') return args.text.trim();
    if (typeof args.content === 'string') return args.content.trim();
    if (typeof args.raw === 'string') return args.raw.trim();
    if (typeof args.args === 'string') return args.args.trim();
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

async function execute(args) {
  const normalized = normalizeArgs(args);
  // 有参数但不是"列表" → 执行对应技能
  if (normalized && normalized !== '列表') {
    if (skillAgent && typeof skillAgent.execute === 'function') {
      const result = await skillAgent.execute(normalized);
      return extractText(result);
    }
    return `技能执行器不可用，无法执行：${normalized}`;
  }

  // 无参数或"列表" → 列出所有可用技能
  const entries = Object.entries(SKILLS);
  if (entries.length === 0) {
    return '暂无可用技能';
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
  return lines.join('\n');
}

module.exports = { execute, desc: '列出或执行技能' };
