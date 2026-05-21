'use strict';

const SKILLS = {
  'ops-summary': {
    id: 'ops-summary',
    aliases: ['运营摘要', 'summary', '今日摘要', '日报'],
    description: '生成今日运营摘要报告',
  },
};

function resolveSkill(input) {
  if (!input) return null;
  const trimmed = input.trim();
  if (SKILLS[trimmed]) {
    return { id: SKILLS[trimmed].id, description: SKILLS[trimmed].description };
  }
  for (const [, skill] of Object.entries(SKILLS)) {
    if (skill.aliases && skill.aliases.includes(trimmed)) {
      return { id: skill.id, description: skill.description };
    }
  }
  return null;
}

module.exports = { resolveSkill, SKILLS };
