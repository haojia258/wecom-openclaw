'use strict';

async function execute(ctx) {
  const mock = ctx && ctx.mock;
  if (mock) {
    return '[mock] 运营摘要';
  }
  return '运营摘要功能开发中';
}

module.exports = { execute, desc: '运营摘要' };
