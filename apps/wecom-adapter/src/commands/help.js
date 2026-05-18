'use strict';

/**
 * /帮助 命令
 * v1.0 - 从 command-center 自动生成菜单
 */

const { listCommands } = require('../lib/command-center');

function execute(ctx) {
  return listCommands();
}

module.exports = { execute, desc: '帮助菜单' };
