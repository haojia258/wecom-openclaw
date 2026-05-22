'use strict';

/**
 * get-activity.skill.js - 抖音推广活动查询 Skill
 * 读取 check-activity_latest.json，返回格式化活动列表
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_DATA_FILE = '/opt/wecom-openclaw/logs/doudian/check-activity_latest.json';

/**
 * 从 JSON 文件加载活动数据
 * @param {string} [filePath] - 可选的数据文件路径
 * @returns {object|null}
 */
function load(filePath) {
  const fp = filePath || DEFAULT_DATA_FILE;
  if (!fs.existsSync(fp)) return null;
  try {
    return JSON.parse(fs.readFileSync(fp, 'utf-8'));
  } catch (_) {
    return null;
  }
}

/**
 * 执行活动查询
 * @param {object} options - { mock?: boolean, dataFile?: string }
 * @returns {string} 格式化的活动列表文本
 */
function execute(options) {
  options = options || {};

  // mock 模式：返回预设活动数据（不依赖真实数据文件）
  if (options.mock) {
    return [
      '\u{1F4E3} 抖音官方推广活动',
      '',
      '1. 抖音商城官方大促-618',
      '   报名状态：可报名\u2705  截止：06/18',
      '   时段：05/15 ~ 06/18',
      '',
      '2. 26年Q2节盟计划-引流联合',
      '   报名状态：可报名\u2705',
      '',
      '3. 抖音支付频道',
      '   报名状态：可报名\u2705',
      '',
      '4. 【平台最高出资15%】活动',
      '   报名状态：可报名\u2705',
      '',
      '5. \u{1F525}官方推荐-平台x商家合资活动',
      '   报名状态：可报名\u2705',
      '',
      '\u{1F4CA} 共 5 个活动，5 个可报名',
      '',
      '\u{1F4A1} 以上活动均可通过抖店后台报名参加',
      '\u{1F550} 数据来源：电商罗盘自动采集',
    ].join('\n');
  }

  const dataFile = options.dataFile || DEFAULT_DATA_FILE;
  const data = load(dataFile);

  if (!data || !data.activities || data.activities.length === 0) {
    return [
      '\u{1F4E3} 抖音推广活动',
      '',
      '\u6682\u65E0\u6D3B\u52A8\u6570\u636E',
      '',
      '\u{1F4A1} 活动数据由 check-activity worker 自动采集',
      '\u{1F550} 每日自动更新',
    ].join('\n');
  }

  const lines = ['\u{1F4E3} 抖音官方推广活动', ''];
  const acts = data.activities;

  for (let i = 0; i < acts.length; i++) {
    const a = acts[i];
    const emoji = a.name.includes('\u{1F525}') || a.name.includes('推荐') ? '\u2B50 ' : '';
    lines.push(emoji + (i + 1) + '. ' + a.name.replace(/^\u{1F525}/, ''));
    const statusLabel = a.signupStatus === 'available' ? '可报名\u2705' : a.signupStatus;
    lines.push('   报名状态：' + statusLabel);
    if (a.deadline) lines.push('   截止日期：' + a.deadline);
    if (a.dateRange) lines.push('   活动时段：' + a.dateRange);
    lines.push('');
  }

  if (data.summary) {
    lines.push('\u{1F4CA} 共 ' + (data.summary.totalActivities || acts.length) +
      ' 个活动，' + (data.summary.availableActivities || acts.length) + ' 个可报名');
  }
  lines.push('');
  lines.push('\u{1F4A1} 以上活动均可通过抖店后台报名参加');
  if (data.timestamp) {
    lines.push('\u{1F550} 数据更新：' +
      new Date(data.timestamp).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }));
  }

  return lines.join('\n');
}

module.exports = { execute, load };
