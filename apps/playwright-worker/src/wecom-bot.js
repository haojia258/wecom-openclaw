#!/usr/bin/env node
/**
 * wecom-bot.js
 * 企业微信群机器人推送模块
 * 支持两种模式：
 *   1. 企微官方 webhook: https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxx
 *   2. 自定义回调: https://api.yudong.shop/wecom/callback (body 需带 corpid)
 * 支持 markdown 消息、错误重试、超时控制、SOCKS5 代理
 * webhook 未配置时只打印日志，不中断主流程
 *
 * 返回格式:
 *   { success, attempt, webhookHost, httpStatus, responseBody, errcode, errmsg }
 */

const axios = require('axios');
const fs   = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const execPromise = promisify(exec);

const WEBHOOK  = process.env.WECOM_BOT_WEBHOOK || '';
const CORP_ID  = process.env.WECOM_CORP_ID   || '';   // 自定义回调需要
const PROXY    = process.env.WECOM_PROXY     || '';    // e.g. socks5h://127.0.0.1:1080
const LOG_DIR = path.join(__dirname, '..', 'logs', 'ops');

// 判断是否是自定义回调格式（非企微官方域名）
function isCustomCallback(url) {
  return url && !url.includes('qyapi.weixin.qq.com');
}

// 确保日志目录存在
function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

/**
 * 通过 curl + SOCKS5 代理发送（服务器环境）
 * PROXY 格式：socks5h://127.0.0.1:1080
 * 返回: { httpStatus: number, body: string }
 */
async function sendViaCurl(url, payload, timeoutSec) {
  const proxyType  = PROXY.includes('socks5h') ? '--socks5-hostname' : '--socks5';
  const proxyAddr = PROXY.replace(/^socks5h?:\/\//, '');
  const jsonBody  = JSON.stringify(payload).replace(/'/g, "'\\''");

  const cmd = [
    'curl -s -w "\\n%{http_code}" -X POST',
    `"${url}"`,
    '-H "Content-Type: application/json"',
    `--data '${jsonBody}'`,
    `${proxyType} "${proxyAddr}"`,
    `--connect-timeout ${timeoutSec}`,
    `-m ${timeoutSec}`
  ].join(' ');

  const { stdout, stderr } = await execPromise(cmd);
  if (stderr) console.warn('[wecom-bot] curl stderr:', stderr.slice(0, 200));

  const lines = stdout.trim().split('\n');
  const httpStatus = parseInt(lines[lines.length - 1], 10) || 0;
  const body = lines.slice(0, -1).join('\n');

  return { httpStatus, body };
}

/**
 * 发送企微机器人 markdown 消息
 * @param {string} markdownContent
 * @param {object} [options]
 * @returns {Promise<{
 *   success: boolean,
 *   attempt?: number,
 *   webhookHost?: string,
 *   httpStatus?: number,
 *   responseBody?: string,
 *   errcode?: number,
 *   errmsg?: string,
 *   error?: string,
 *   skipped?: boolean
 * }>}
 */
async function sendMarkdown(markdownContent, options = {}) {
  const { maxRetries = 3, timeout = 10000 } = options;
  const timeoutSec = Math.ceil(timeout / 1000);

  // webhook 未配置：只打印日志，不中断
  if (!WEBHOOK) {
    const msg = '[wecom-bot] WECOM_BOT_WEBHOOK 未配置，跳过推送，内容如下：\n' + markdownContent;
    console.log(msg);
    ensureLogDir();
    fs.appendFileSync(
      path.join(LOG_DIR, 'push_skip.log'),
      new Date().toISOString() + ' ' + msg + '\n\n'
    );
    return { success: false, skipped: true, message: 'WECOM_BOT_WEBHOOK 未配置' };
  }

  const webhookHost = new URL(WEBHOOK).hostname;

  // 构建请求体
  let payload;
  if (isCustomCallback(WEBHOOK)) {
    // 自定义回调格式：body 里带 corpid
    if (!CORP_ID) {
      const msg = '[wecom-bot] 自定义回调需要 WECOM_CORP_ID，跳过推送';
      console.error(msg);
      return { success: false, error: 'WECOM_CORP_ID 未配置' };
    }
    payload = {
      corpid: CORP_ID,
      msgtype: 'markdown',
      markdown: { content: markdownContent }
    };
  } else {
    // 企微官方格式
    payload = {
      msgtype: 'markdown',
      markdown: { content: markdownContent }
    };
  }

  let lastError = null;
  let lastHttpStatus = 0;
  let lastResponseBody = '';
  let lastErrcode = undefined;
  let lastErrmsg = undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      let httpStatus = 0;
      let responseBody = '';
      let resData = null;

      if (PROXY) {
        const curlResult = await sendViaCurl(WEBHOOK, payload, timeoutSec);
        httpStatus = curlResult.httpStatus;
        responseBody = curlResult.body;
        try { resData = JSON.parse(responseBody); } catch (_) { resData = { raw: responseBody }; }
      } else {
        const res = await axios.post(WEBHOOK, payload, {
          timeout,
          headers: { 'Content-Type': 'application/json' }
        });
        httpStatus = res.status;
        resData = res.data;
        responseBody = JSON.stringify(resData);
      }

      // 保存最后一次尝试的状态
      lastHttpStatus = httpStatus;
      lastResponseBody = responseBody;

      // 解析企微返回
      const errcode = resData && typeof resData.errcode === 'number' ? resData.errcode : undefined;
      const errmsg  = resData && typeof resData.errmsg  === 'string' ? resData.errmsg  : undefined;
      lastErrcode = errcode;
      lastErrmsg = errmsg;

      // 打印诊断信息
      console.log(`[wecom-bot] attempt=${attempt} webhookHost=${webhookHost} httpStatus=${httpStatus} errcode=${errcode !== undefined ? errcode : 'N/A'} errmsg=${errmsg || 'N/A'}`);
      console.log(`[wecom-bot] responseBody: ${responseBody.slice(0, 500)}${responseBody.length > 500 ? '...(truncated)' : ''}`);

      // 判断是否成功（企微官方：errcode === 0；自定义回调：code === 0 或 status === 'success'）
      const isOk = resData && (
        resData.errcode === 0 ||
        resData.code === 0 ||
        resData.status === 'success'
      );

      if (isOk) {
        ensureLogDir();
        fs.appendFileSync(
          path.join(LOG_DIR, 'push_success.log'),
          new Date().toISOString() + ' [attempt=' + attempt + '] 推送成功\n' + markdownContent + '\n\n'
        );
        return {
          success: true,
          attempt,
          webhookHost,
          httpStatus,
          responseBody,
          errcode: errcode !== undefined ? errcode : 0,
          errmsg: errmsg || 'ok'
        };
      } else {
        lastError = new Error(`推送返回错误: errcode=${errcode !== undefined ? errcode : 'N/A'} errmsg=${errmsg || 'N/A'}`);
      }
    } catch (err) {
      lastError = err;
      console.warn(`[wecom-bot] 第 ${attempt}/${maxRetries} 次推送失败: ${err.message}`);
    }

    if (attempt < maxRetries) {
      await sleep(1000 * attempt);
    }
  }

  // 全部失败
  const errMsg = `[wecom-bot] 推送失败（已重试 ${maxRetries} 次）: ${lastError ? lastError.message : 'unknown'}`;
  console.error(errMsg);
  ensureLogDir();
  fs.appendFileSync(
    path.join(LOG_DIR, 'push_error.log'),
    new Date().toISOString() + ' ' + errMsg + '\n' + markdownContent + '\n\n'
  );

  return {
    success: false,
    retries: maxRetries,
    webhookHost,
    httpStatus: lastHttpStatus,
    responseBody: lastResponseBody,
    errcode: lastErrcode,
    errmsg: lastErrmsg,
    error: lastError ? lastError.message : 'unknown'
  };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 发送简单文本消息（备用）
 */
async function sendText(content, options) {
  if (!WEBHOOK) {
    console.log('[wecom-bot] WECOM_BOT_WEBHOOK 未配置，跳过推送:', content);
    return { success: false, skipped: true };
  }

  try {
    let resData;
    const payload = isCustomCallback(WEBHOOK)
      ? { corpid: CORP_ID, msgtype: 'text', text: { content } }
      : { msgtype: 'text', text: { content } };

    if (PROXY) {
      const curlResult = await sendViaCurl(WEBHOOK, payload, 10);
      resData = JSON.parse(curlResult.body);
    } else {
      const res = await axios.post(WEBHOOK, payload, { timeout: 10000 });
      resData = res.data;
    }
    return { success: resData && (resData.errcode === 0 || resData.code === 0), response: resData };
  } catch (err) {
    console.error('[wecom-bot] 文本推送失败:', err.message);
    return { success: false, error: err.message };
  }
}

module.exports = { sendMarkdown, sendText };
