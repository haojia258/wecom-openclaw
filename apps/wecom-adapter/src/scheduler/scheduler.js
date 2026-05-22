'use strict';

/**
 * scheduler.js - 自动运营摘要定时推送调度器
 * v1.2 - 每日 09:00 / 13:00 / 22:00 推送运营摘要到企微
 *
 * 依赖: node-cron
 * 默认不启用定时（避免生产重复推送），通过 start() 手动激活
 */

const cron = require('node-cron');
const skillAgent = require('../agents/skill-agent');
const wecomSender = require('./wecom-sender');
const config = require('../lib/config');
const logger = require('../lib/logger');

// ─── 定时计划 ────────────────────────────────────────────────

const SCHEDULES = [
  { name: '晨报', cron: '0 9 * * *', timezone: 'Asia/Shanghai' },
  { name: '午报', cron: '0 13 * * *', timezone: 'Asia/Shanghai' },
  { name: '日报', cron: '0 22 * * *', timezone: 'Asia/Shanghai' },
];

let cronJobs = [];

// ─── 推送执行 ────────────────────────────────────────────────

/**
 * 执行一次运营摘要推送
 * @param {Object} ctx - 上下文（支持 mock）
 * @returns {Promise<{success: boolean, summary: string, sent: number, total: number, errors: string[]}>}
 */
async function pushOpsSummary(ctx) {
  ctx = ctx || {};
  logger.push('pushOpsSummary start');

  try {
    // 1. 获取运营摘要（复用 skill-agent）
    const summaryText = await skillAgent.execute(ctx, 'ops-summary');
    const title = ctx.label || '📋 运营摘要';

    const content = [
      title,
      '',
      summaryText,
      '',
      '🕐 ' + new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
    ].join('\n');

    logger.push('summary generated, len=' + summaryText.length);

    // 2. 推送到企微（复用 wecom-sender）
    const result = await wecomSender.sendToConfiguredUsers(content, {
      mock: ctx.mock || false,
    });

    logger.push('pushOpsSummary done: ' + result.sent + '/' + result.total + ' sent');
    return {
      success: result.success,
      summary: summaryText,
      sent: result.sent,
      total: result.total,
      errors: result.errors,
    };
  } catch (e) {
    logger.error('pushOpsSummary FAILED: ' + e.message);
    return {
      success: false,
      summary: '',
      sent: 0,
      total: 0,
      errors: [e.message],
    };
  }
}

/**
 * 按名称推送（晨报/午报/日报）
 * @param {string} scheduleName - '晨报' / '午报' / '日报'
 * @param {Object} ctx
 */
async function pushByName(scheduleName, ctx) {
  ctx = ctx || {};
  ctx.label = '📋 运营' + (scheduleName || '摘要');
  return pushOpsSummary(ctx);
}

// ─── 定时调度 ────────────────────────────────────────────────

function start() {
  if (cronJobs.length > 0) {
    logger.info('Scheduler: already running');
    return;
  }

  for (const schedule of SCHEDULES) {
    try {
      const job = cron.schedule(schedule.cron, function () {
        pushByName(schedule.name, {});
      }, { timezone: schedule.timezone });
      cronJobs.push(job);
      logger.info('Scheduler: ' + schedule.name + ' registered (' + schedule.cron + ')');
    } catch (e) {
      logger.error('Scheduler: ' + schedule.name + ' FAILED - ' + e.message);
    }
  }

  logger.info('Scheduler: ' + cronJobs.length + ' jobs registered');
}

function stop() {
  for (const job of cronJobs) {
    job.stop();
  }
  cronJobs = [];
  logger.info('Scheduler: all jobs stopped');
}

function getJobs() {
  return SCHEDULES.map(function (s) { return s.name + ' (' + s.cron + ')'; });
}

module.exports = {
  pushOpsSummary,
  pushByName,
  start,
  stop,
  getJobs,
  SCHEDULES,
};
