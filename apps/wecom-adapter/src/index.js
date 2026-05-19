'use strict';

/**
 * index.js - wecom-adapter 入口
 * v1.0 - 基于 v5-api-reply，增加日志、超时保护、fallback、定时推送
 */

require('dotenv').config({ path: '/opt/wecom-openclaw/.env', override: true });

const express = require('express');
const https = require('https');
const xml2js = require('xml2js');
const crypto = require('crypto');
const logger = require('./lib/logger');
const pushScheduler = require('./lib/push-scheduler');

const app = express();
app.use(express.text({ type: '*/xml' }));
app.disable('x-powered-by');
app.disable('etag');

const PORT = process.env.WECOM_ADAPTER_PORT || 3001;
const WECOM_TOKEN = process.env.WECOM_TOKEN || 'openclaw123';
const WECOM_ENCODING_AES_KEY = process.env.WECOM_ENCODING_AES_KEY || '';
const WECOM_CORP_ID = process.env.WECOM_CORP_ID || '';
const WECOM_SECRET = process.env.WECOM_SECRET || '';

logger.info('WeCom Adapter v1.0 starting, port=' + PORT);
logger.info('CorpID: ' + WECOM_CORP_ID);

// ─── 企微 API 发送消息 ──────────────────────────────

let cachedToken = null;
let tokenExpireAt = 0;

function getAccessToken(callback) {
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
          logger.info('getAccessToken: ok');
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

function sendWeComMessage(touser, content, agentid) {
  getAccessToken(function(err, token) {
    if (err) { logger.error('sendWeComMessage getToken failed: ' + err.message); return; }
    const body = JSON.stringify({
      touser: touser,
      msgtype: 'text',
      agentid: parseInt(agentid || '1000006'),
      text: { content: content }
    });
    const url = 'https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=' + token;
    const u = new URL(url);
    const opt = {
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    };
    const req = https.request(opt, function(res) {
      let d = '';
      res.on('data', function(c) { d += c; });
      res.on('end', function() { logger.reply('sendWeCom result: ' + d); });
    });
    req.on('error', function(e) { logger.error('sendWeCom error: ' + e.message); });
    req.write(body);
    req.end();
  });
}

// ─── AES 解密（入站） ──────────────────────────────────

function getAesKey() {
  return Buffer.from(WECOM_ENCODING_AES_KEY + '=', 'base64');
}

function decryptWeCom(encryptMsgBase64) {
  const key = getAesKey();
  const iv = key.slice(0, 16);
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  decipher.setAutoPadding(false);
  let decrypted = Buffer.concat([decipher.update(Buffer.from(encryptMsgBase64, 'base64')), decipher.final()]);
  const padByte = decrypted[decrypted.length - 1];
  if (padByte >= 1 && padByte <= 32) {
    decrypted = decrypted.slice(0, decrypted.length - padByte);
  }
  if (decrypted.length < 20) throw new Error('decrypted too short');
  const msgLen = decrypted.readUInt32BE(16);
  if (msgLen < 0 || msgLen > decrypted.length - 20) throw new Error('msgLen invalid: ' + msgLen);
  const msg = decrypted.slice(20, 20 + msgLen).toString('utf8');
  const appId = decrypted.slice(20 + msgLen).toString('utf8');
  return { msg: msg, appId: appId };
}

function sha1(str) {
  return crypto.createHash('sha1').update(str).digest('hex');
}

function buildMsgSignature(encryptMsg, timestamp, nonce) {
  const arr = [WECOM_TOKEN, timestamp, nonce, encryptMsg].sort();
  return sha1(arr.join(''));
}

// ─── 超时工具 ──────────────────────────────────────

function timeoutPromise(ms, label) {
  return new Promise(function(_, reject) {
    setTimeout(function() { reject(new Error('TIMEOUT:' + label)); }, ms);
  });
}

// ─── GET 验证 ──────────────────────────────────────

app.get('/wecom/callback', function(req, res) {
  const echostr = req.query.echostr;
  logger.info('GET verify');
  try {
    if (WECOM_ENCODING_AES_KEY && echostr && echostr.length > 40) {
      const result = decryptWeCom(echostr);
      res.send(result.msg);
    } else {
      res.send(echostr || '');
    }
  } catch (e) {
    logger.error('GET verify FAIL: ' + e.message);
    res.status(500).send('verify failed');
  }
});

// ─── POST 消息处理 ──────────────────────────────────

app.post('/wecom/callback', async function(req, res) {
  const rawBody = req.body || '';
  const reqTimestamp = req.query.timestamp || Math.floor(Date.now() / 1000).toString();
  const reqNonce = req.query.nonce || reqTimestamp;

  logger.in('body=' + rawBody.length + 'B ts=' + reqTimestamp);

  let xmlMsg = rawBody;
  const reqMsgSignature = req.query.msg_signature || '';

  try {
    const preParsed = await new xml2js.Parser().parseStringPromise(rawBody || '<xml/>');
    const encryptField = preParsed.xml && preParsed.xml.Encrypt && preParsed.xml.Encrypt[0] || '';

    if (encryptField && reqMsgSignature) {
      const calcSig = buildMsgSignature(encryptField, reqTimestamp, reqNonce);
      if (calcSig !== reqMsgSignature) {
        logger.error('Inbound signature MISMATCH');
      } else {
        logger.info('Inbound signature OK');
      }
    }

    if (encryptField) {
      const result = decryptWeCom(encryptField);
      xmlMsg = result.msg;
      logger.in('decrypted appId=' + result.appId);
    }
  } catch (e) {
    logger.error('Decrypt FAIL: ' + e.message);
    res.send('success');
    return;
  }

  // 立即返回 success（企微要求 5 秒内）
  res.send('success');
  logger.info('Returned success, start async processing...');

  // 异步处理命令并发送回复
  try {
    const parsed = await new xml2js.Parser().parseStringPromise(xmlMsg);
    const msgType = (parsed.xml.MsgType && parsed.xml.MsgType[0]) || '';
    const content = (parsed.xml.Content && parsed.xml.Content[0]) || '';
    const fromUser = (parsed.xml.FromUserName && parsed.xml.FromUserName[0]) || '';
    const toUser = (parsed.xml.ToUserName && parsed.xml.ToUserName[0]) || '';
    const agentId = (parsed.xml.AgentID && parsed.xml.AgentID[0]) || '1000006';

    logger.in('from=' + fromUser + ' agentId=' + agentId + ' content=' + content);

    if (msgType === 'text' && content) {
      const ctx = { fromUser: fromUser, toUser: toUser, agentId: agentId };

      // 超时保护：4 秒
      let replyText;
      try {
        replyText = await Promise.race([
          require('./router').routeCommand(content, ctx),
          timeoutPromise(4000, content)
        ]);
      } catch (e) {
        if (e.message.startsWith('TIMEOUT:')) {
          logger.error('Command TIMEOUT: ' + content);
          sendWeComMessage(fromUser, 'AI处理中，请稍后再试', agentId);
          return;
        }
        throw e; // re-throw to outer catch
      }

      if (!replyText || typeof replyText !== 'string') {
        replyText = 'OpenClaw 已收到：' + content + '\n发送 /帮助 查看可用命令';
      }
      logger.reply('len=' + replyText.length + 'B');
      sendWeComMessage(fromUser, replyText, agentId);
    }
  } catch (e) {
    logger.error('Async processing FAIL: ' + e.message);
    // fallback：通知用户系统繁忙
    try {
      const parsed2 = xmlMsg ? await new xml2js.Parser().parseStringPromise(xmlMsg) : null;
      const fromUser2 = parsed2 && parsed2.xml && parsed2.xml.FromUserName && parsed2.xml.FromUserName[0];
      if (fromUser2) {
        sendWeComMessage(fromUser2, '系统繁忙，请稍后再试', '1000006');
      }
    } catch (_) {}
  }
});

// ─── health ──────────────────────────────────────

app.get('/health', function(req, res) {
  res.json({ status: 'ok', port: PORT, corpId: WECOM_CORP_ID, version: 'v1.0.0' });
});

// ─── 启动 ──────────────────────────────────────

app.listen(PORT, function() {
  logger.info('WeCom Adapter v1.0 STARTED, port=' + PORT);
  // 启动日志 rotate
  logger.startRotate();
  // 启动定时推送
  pushScheduler.start();
});
