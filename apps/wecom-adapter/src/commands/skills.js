'use strict';

const { SKILLS } = require('../skills');

async function execute() {
  const entries = Object.entries(SKILLS);
  if (entries.length === 0) {
    return { reply: '暂无可用技能', success: true };
  }
  const lines = ['可用技能：', ''];
  for (const [, skill] of entries) {
    lines.push(`${skill.id} - ${skill.description}`);
  }
  return { reply: lines.join('\n'), success: true };
}

module.exports = { execute, desc: '列出可用技能' };
