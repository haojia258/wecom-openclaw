'use strict';

const { SKILLS } = require('../skills');
const skillAgent = require('../agents/skill-agent');

const LIST_ALIASES = new Set(['列表', 'list', 'help', '帮助']);

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

/**
 * 列出所有可用技能
 */
function listSkills() {
  const entries = Object.entries(SKILLS);
  if (entries.length === 0) return '暂无可用技能';
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

async function execute(ctx, args) {
  // 兼容直接调用 execute('ops-summary') 的测试写法
  if (typeof ctx === 'string' && args === undefined) {
    args = ctx;
    ctx = {};
  }
  const normalized = normalizeArgs(args);

  // 情况 1 & 2：空参数 或 列表关键词 → 返回列表
  if (!normalized || LIST_ALIASES.has(normalized)) {
    return listSkills();
  }

  // 情况 3：任何其它非空参数 → 调用 skill-agent 执行
  try {
    if (!skillAgent || typeof skillAgent.execute !== 'function') {
      return `技能执行器不可用，无法执行：${normalized}`;
    }
    const result = await skillAgent.execute(ctx, normalized);
    return extractText(result);
  } catch (err) {
    return `技能执行失败（${normalized}）：${err.message}`;
  }
}

module.exports = { execute, desc: '列出或执行技能' };
