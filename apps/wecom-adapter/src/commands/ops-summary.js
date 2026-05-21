'use strict';

async function execute(ctx) {
  const mock = ctx && ctx.mock;
  if (mock) {
    return { reply: '[mock] 运营摘要', success: true };
  }
  return { reply: '运营摘要功能开发中', success: true };
}

module.exports = { execute, desc: '运营摘要' };
