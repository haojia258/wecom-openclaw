'use strict';

/**
 * push-scheduler.js - 主动推送调度
 * v1.0 - 每日 08:00 推送运营简报到企微
 * 依赖: node-cron
 */

const cron = require('node-cron');
const https = require('https');
const opsRules = require('./ops-rules');
const config = require('./config');
const logger = require('./logger');

let cronJob = null;
let cachedToken = null;
let tokenExpireAt = 0;

const WECOM_CORP_ID = config.WECOM.CORP_ID;
const WECOM_SECRET  = config.WECOM.SECRET;
const AGENT_ID      = config.WECOM.AGENT_ID;

// ─── 获取 access_token（缓存） ───────────────────────────────
function getToken(callback) {
  if (cachedToken && Date.now() < tokenExpireAt) {
    callback(null, cachedToken);
    return;
  }
  const url = 'https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=' + WECOM_CORP_ID + '&corpsecret=' + WECOM_SECRET;
  https.get(url, function(res) {
    let d = '';
    res.on('data', function(c) { d += c; });
    res.on('end', function() {
      try {
        const j = JSON.parse(d);
        if (j.errcode === 0) {
          cachedToken = j.access_token;
          tokenExpireAt = Date.now() + (j.expires_in - 300) * 1000;
          callback(null, cachedToken);
        } else {
          callback(new Error('gettoken: ' + d));
        }
      } catch (e) {
        callback(e);
      }
    });
  }).on('error', function(e) { callback(e); });
}

// ─── 发送企微消息 ───────────────────────────────────────────
function sendToUser(touser, content) {
  getToken(function(err, token) {
    if (err) { logger.error('push send getToken failed: ' + err.message); return; }
    const body = JSON.stringify({
      touser: touser,
      msgtype: 'text',
      agentid: parseInt(AGENT_ID),
      text: { content: content }
    });
    const u = new URL('https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=' + token);
    const opt = {
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    };
    const req = https.request(opt, function(res) {
      let d = '';
      res.on('data', function(c) { d += c; });
      res.on('end', function() { logger.push('sent to ' + touser + ': ' + d); });
    });
    req.on('error', function(e) { logger.error('push send error: ' + e.message); });
    req.write(body);
    req.end();
  });
}

// ─── 格式化日报 ─────────────────────────────────────────────
function formatReport(result) {
  const lines = ['【今日运营简报】', ''];
  lines.push(result.summary || '暂无数据');
  lines.push('');

  if (result.risks && result.risks.length > 0) {
    lines.push('⚠️ 风险提示：');
    for (const r of result.risks) lines.push('• ' + r);
    lines.push('');
  }

  lines.push('💡 SKU 建议：');
  lines.push(result.skuAdvice || '数据缺失');
  lines.push('');

  lines.push('📣 活动建议：');
  lines.push(result.activityAdvice || '数据缺失');
  lines.push('');

  lines.push('🔥 今日最优先：');
  lines.push(result.priorityAction || '暂无');
  lines.push('');

  lines.push('🕐 ' + new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }));

  return lines.join('\n').slice(0, 1800);
}

// ─── 执行推送 ───────────────────────────────────────────────
function sendDailyReport() {
  logger.push('Daily report start');
  try {
    const result = opsRules.analyzeFromDisk();
    const text = formatReport(result);
    const users = config.WECOM.PUSH_USERS;
    if (users.length === 0) {
      logger.info('No PUSH_USERS configured, skip push');
      return;
    }
    for (const user of users) {
      if (!user) continue;
      sendToUser(user, text);
    }
    logger.push('Daily report sent to ' + users.length + ' user(s)');
  } catch (e) {
    logger.error('Daily report failed: ' + e.message);
  }
}

// ─── 启动/停止 ─────────────────────────────────────────────
function start() {
  if (!config.WECOM.PUSH_ENABLED) {
    logger.info('Push scheduler: DISABLED (PUSH_ENABLED=false)');
    return;
  }
  if (cronJob) return;
  const expr = config.WECOM.PUSH_CRON || '0 8 * * *';
  try {
    cronJob = cron.schedule(expr, sendDailyReport, { timezone: 'Asia/Shanghai' });
    logger.info('Push scheduler STARTED: ' + expr);
  } catch (e) {
    logger.error('Push scheduler FAILED: ' + e.message);
  }
}

function stop() {
  if (cronJob) { cronJob.stop(); cronJob = null; logger.info('Push scheduler STOPPED'); }
}

module.exports = { start, stop, sendDailyReport };
