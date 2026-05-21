'use strict';

const { resolveSkill } = require('../skills');

async function execute(input, ctx) {
  const skill = resolveSkill(input);
  if (!skill) {
    return { reply: '未知技能。输入 /帮助 查看可用命令', success: false };
  }
  switch (skill.id) {
    case 'ops-summary':
      return require('../commands/ops-summary').execute(ctx);
    default:
      return { reply: `技能 ${skill.id} 未实现`, success: false };
  }
}

module.exports = { execute };
