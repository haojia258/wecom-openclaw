'use strict';

/**
 * /活动 命令 - 查询抖音官方推广活动
 * 支持：/活动、/推广活动、/活动查询、/大促
 */

const getActivity = require('../skills/activity/get-activity.skill');

async function execute(ctx, args) {
  // 兼容测试调用：execute({ mock: true }) 或 execute(ctx, args)
  const options = {};
  if (ctx && ctx.mock) options.mock = true;
  if (ctx && ctx.dataFile) options.dataFile = ctx.dataFile;

  try {
    return getActivity.execute(options);
  } catch (e) {
    return '活动查询暂不可用：' + e.message.slice(0, 120);
  }
}

module.exports = { execute, desc: '抖音推广活动' };
