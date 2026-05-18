'use strict';

/**
 * logger.js - 统一日志系统
 * v1.0 - 零依赖，fs 写文件，自动 rotate 保留 7 天
 */

const fs = require('fs');
const path = require('path');
const config = require('./config');

const LOG_DIR = config.LOG_DIR;
const BASE_NAME = config.LOG_BASE;
const KEEP_DAYS = 7;

// 确保日志目录存在
try { fs.mkdirSync(LOG_DIR, { recursive: true }); } catch (_) {}

// YYYY-MM-DD
function dateStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + dd;
}

// 今日日志文件路径
function todayLogPath() {
  return path.join(LOG_DIR, BASE_NAME + '.' + dateStr() + '.log');
}

// 写一行
function write(tag, msg) {
  const line = '[' + new Date().toISOString().replace('T', ' ').slice(0, 19) + '] [' + tag + '] ' + msg + '\n';
  try {
    fs.appendFileSync(todayLogPath(), line, 'utf8');
  } catch (_) {}
  // 同时输出到 stdout (PM2 接管)
  const tagPad = (tag + '       ').slice(0, 7);
  try { process.stdout.write('[' + tagPad + '] ' + msg + '\n'); } catch (_) {}
}

// 清理超过 7 天的日志
function rotate() {
  try {
    const files = fs.readdirSync(LOG_DIR);
    const prefix = BASE_NAME + '.';
    const now = new Date();
    for (const f of files) {
      if (!f.startsWith(prefix) || !f.endsWith('.log')) continue;
      const ds = f.replace(prefix, '').replace('.log', '');
      const parts = ds.split('-');
      if (parts.length !== 3) continue;
      const fdate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
      const diffDays = (now - fdate) / 86400000;
      if (diffDays > KEEP_DAYS) {
        try { fs.unlinkSync(path.join(LOG_DIR, f)); } catch (_) {}
      }
    }
  } catch (_) {}
}

let rotateTimer = null;
function startRotate() {
  if (rotateTimer) return;
  rotateTimer = setInterval(rotate, 3600000);
  rotate();
}

module.exports = {
  in:    function(msg) { write('WECOM-IN', msg); },
  cmd:   function(msg) { write('CMD',      msg); },
  route: function(msg) { write('ROUTE',    msg); },
  data:  function(msg) { write('DATA',     msg); },
  gpt:   function(msg) { write('GPT',      msg); },
  reply: function(msg) { write('REPLY',    msg); },
  error: function(msg) { write('ERROR',    msg); },
  info:  function(msg) { write('INFO',     msg); },
  push:  function(msg) { write('PUSH',     msg); },
  startRotate: startRotate,
  rotate: rotate,
};
