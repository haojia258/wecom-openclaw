'use strict';

/**
 * version-command.js — /版本 命令
 *
 * 显示 OpenClaw Enterprise OS 版本信息。
 */

var execSync = require('child_process').execSync;
var path = require('path');

var APP_ROOT = path.join(__dirname, '..', '..', '..', '..');

var VERSION = 'v1.1.0-beta';
var BUILD_DATE = '2026-05-31';

var MODULES = [
  'P11 Runtime Foundation',
  'P12 Multi-Agent Runtime',
  'P13 Decision Layer (KPI/Budget/Strategy/Board/Memory)',
  'P14 Autonomous Layer (Decision/Goal/Plan/Board/Loop)',
  'P15.0 Task Maintenance (Retry/Cancel/Cleanup)',
];

function getGitShort() {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: APP_ROOT, timeout: 3000 }).toString().trim();
  } catch (_) {
    return 'N/A';
  }
}

function handleVersion() {
  var gitShort = getGitShort();

  return [
    '🤖 **OpenClaw Enterprise OS**',
    '',
    '**Version**: ' + VERSION,
    '',
    '**Git**: ' + gitShort,
    '',
    '**Build**: ' + BUILD_DATE,
    '',
    '**Modules**:',
  ].concat(MODULES.map(function (m) { return '- ' + m; })).concat([
    '',
    '💡 `/状态` 服务状态 | `/帮助` 所有命令',
  ]).join('\n');
}

module.exports = { handleVersion: handleVersion, VERSION: VERSION };
