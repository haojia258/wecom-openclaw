'use strict';

/**
 * index.js - wecom-adapter 入口
 * v1.1 - HashiCorp Vault 集成，密钥不再从 .env 明文读取
 */

require('dotenv').config({ path: '/opt/wecom-openclaw/.env', override: false });

const express = require('express');
const https = require('https');
const xml2js = require('xml2js');
const crypto = require('crypto');
const logger = require('./lib/logger');
const pushScheduler = require('./lib/push-scheduler');
const commandIngress = require('./runtime/command-ingress');
const aiGateway = require('./gateway/ai-gateway');
const missionRoutes = require('./mission/mission-routes');
const commanderGateway = require('./commander/commander-gateway');
const wecomMissionCenter = require('./wecom/wecom-mission-center');
const workbuddyAdapter = require('./execution/workbuddy-adapter');
const vault = require('./lib/vault-client');

const app = express();
app.use(express.text({ type: '*/xml' }));
app.disable('x-powered-by');
app.disable('etag');

const PORT = process.env.WECOM_ADAPTER_PORT || 3001;

// 密钥由 vault.init() 填充
let WECOM_TOKEN = '';
let WECOM_ENCODING_AES_KEY = '';
let WECOM_CORP_ID = '';
let WECOM_SECRET = '';

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
          // sanitize: 不在日志中泄露 secret
          const sanitized = vault.sanitize('gettoken: ' + d);
          callback(new Error(sanitized));
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

    // sanitize 用户内容（防止用户在聊天中发送密钥内容）
    logger.in('from=' + fromUser + ' agentId=' + agentId + ' content=' + vault.sanitize(content));

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
          logger.error('Command TIMEOUT: ' + vault.sanitize(content));
          sendWeComMessage(fromUser, 'AI处理中，请稍后再试', agentId);
          return;
        }
        throw e; // re-throw to outer catch
      }

      if (!replyText || typeof replyText !== 'string') {
        replyText = 'OpenClaw 已收到：' + vault.sanitize(content) + '\n发送 /帮助 查看可用命令';
      }
      logger.reply('len=' + replyText.length + 'B');
      sendWeComMessage(fromUser, replyText, agentId);
    }
  } catch (e) {
    logger.error('Async processing FAIL: ' + vault.sanitize(e.message));
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

// ─── ChatGPT Bridge (P8.0) ──────────────────────
commandIngress.registerRoutes(app);

// ─── AI Gateway (P8.0.3) ────────────────────────
aiGateway.registerGatewayRoutes(app);

// ─── AI Mission Control Dashboard (P10.0) ────────
missionRoutes.registerMissionRoutes(app);

// ─── P11.0 Commander Gateway ─────────────────────
commanderGateway.registerCommanderRoutes(app);

// ─── P11.1 WeCom Mission Center ──────────────────
wecomMissionCenter.registerWecomMissionRoutes(app);

// ─── P11.2 WorkBuddy Execution Adapter ───────────
app.use('/execution', express.json({ limit: '16kb' }));
workbuddyAdapter.registerWorkBuddyRoutes(app);

// 静态文件: Dashboard 页面
app.use('/mission', express.static(require('path').resolve(__dirname, '../public'), {
  index: 'mission-control.html'
}));

// ─── health（不再暴露 corpId） ──────────────────

app.get('/health', function(req, res) {
  res.json({ status: 'ok', port: PORT, version: 'v1.1.0' });
});

// ─── 启动 ──────────────────────────────────────

async function start() {
  // 1. 从 Vault 加载密钥 (staging/CI 模式可跳过)
  if (process.env.VAULT_SKIP === 'true' || process.env.NODE_ENV === 'staging') {
    logger.info('VAULT_SKIP mode: loading secrets from env');
    WECOM_TOKEN = process.env.WECOM_TOKEN || 'staging-token';
    WECOM_ENCODING_AES_KEY = process.env.WECOM_ENCODING_AES_KEY || '';
    WECOM_CORP_ID = process.env.WECOM_CORP_ID || 'staging-corp';
    WECOM_SECRET = process.env.WECOM_SECRET || 'staging-secret';
  } else {
    try {
      logger.info('Loading secrets from Vault...');
      await vault.init();
      WECOM_TOKEN = vault.get('WECOM_TOKEN');
      WECOM_ENCODING_AES_KEY = vault.get('WECOM_ENCODING_AES_KEY');
      WECOM_CORP_ID = vault.get('WECOM_CORP_ID');
      WECOM_SECRET = vault.get('WECOM_SECRET');
      logger.info('Vault secrets loaded successfully');
    } catch (e) {
      logger.error('FATAL: Vault init failed: ' + e.message);
      process.exit(1);
    }
  }

  // 2. 启动 HTTP 服务
  app.listen(PORT, function() {
    logger.info('WeCom Adapter v1.1 STARTED, port=' + PORT);
    // 启动日志 rotate
    logger.startRotate();
    // 启动定时推送
    pushScheduler.start();
  });
}

start().catch(function(e) {
  console.error('FATAL: Startup failed:', e.message);
  process.exit(1);
});
