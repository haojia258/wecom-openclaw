'use strict';

/**
 * wecom-sender.js - 企业微信消息发送模块
 * 提供可复用的企微消息发送能力，支持 mock 传输用于测试
 */

const https = require('https');
const config = require('../lib/config');

let cachedToken = null;
let tokenExpireAt = 0;

const WECOM_CORP_ID = config.WECOM.CORP_ID;
const WECOM_SECRET = config.WECOM.SECRET;
const AGENT_ID = config.WECOM.AGENT_ID;

// ─── 获取 access_token（缓存） ───────────────────────────────

function getToken() {
  return new Promise(function (resolve, reject) {
    if (cachedToken && Date.now() < tokenExpireAt) {
      resolve(cachedToken);
      return;
    }
    const url = 'https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid='
      + WECOM_CORP_ID + '&corpsecret=' + WECOM_SECRET;
    https.get(url, function (res) {
      let d = '';
      res.on('data', function (c) { d += c; });
      res.on('end', function () {
        try {
          const j = JSON.parse(d);
          if (j.errcode === 0) {
            cachedToken = j.access_token;
            tokenExpireAt = Date.now() + (j.expires_in - 300) * 1000;
            resolve(cachedToken);
          } else {
            reject(new Error('gettoken failed: ' + d));
          }
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', function (e) { reject(e); });
  });
}

// ─── 发送企微消息 ───────────────────────────────────────────

/**
 * 发送企业微信文本消息
 * @param {string} touser - 接收者 userid
 * @param {string} content - 消息内容
 * @param {Object} options
 * @param {boolean} options.mock - mock 模式，不实际发送
 * @param {string} options.agentid - 覆盖默认 agentid
 * @returns {Promise<{success: boolean, result: string, mock: boolean}>}
 */
function send(touser, content, options) {
  options = options || {};

  if (options.mock) {
    return Promise.resolve({
      success: true,
      result: 'mock send ok',
      mock: true,
      touser: touser,
    });
  }

  return new Promise(function (resolve, reject) {
    getToken().then(function (token) {
      const agentid = options.agentid || AGENT_ID;
      const body = JSON.stringify({
        touser: touser,
        msgtype: 'text',
        agentid: parseInt(agentid, 10),
        text: { content: content },
      });
      const u = new URL('https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=' + token);
      const opt = {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      };
      const req = https.request(opt, function (res) {
        let d = '';
        res.on('data', function (c) { d += c; });
        res.on('end', function () {
          try {
            const j = JSON.parse(d);
            if (j.errcode === 0) {
              resolve({ success: true, result: d, mock: false });
            } else {
              resolve({ success: false, result: d, mock: false });
            }
          } catch (e) {
            resolve({ success: false, result: d, mock: false });
          }
        });
      });
      req.on('error', function (e) {
        reject(e);
      });
      req.write(body);
      req.end();
    }).catch(function (e) {
      reject(e);
    });
  });
}

/**
 * 向所有配置的 PUSH_USERS 发送消息
 * @param {string} content - 消息内容
 * @param {Object} options - 传递给 send() 的选项
 * @returns {Promise<{success: boolean, sent: number, errors: string[]}>}
 */
async function sendToConfiguredUsers(content, options) {
  options = options || {};

  // mock 模式：直接返回模拟成功，不检查 PUSH_USERS 配置
  if (options.mock) {
    return { success: true, sent: 1, total: 1, errors: [], mock: true };
  }

  const users = config.WECOM.PUSH_USERS;

  if (!users || users.length === 0) {
    return { success: false, sent: 0, errors: ['无推送用户（PUSH_USERS 未配置）'] };
  }

  let sent = 0;
  const errors = [];

  for (const user of users) {
    if (!user) continue;
    try {
      const result = await send(user, content, options);
      if (result.success) {
        sent++;
      } else {
        errors.push(user + ': ' + result.result);
      }
    } catch (e) {
      errors.push(user + ': ' + e.message);
    }
  }

  return {
    success: errors.length === 0,
    sent: sent,
    total: users.filter(Boolean).length,
    errors: errors,
  };
}

module.exports = { send, sendToConfiguredUsers };
