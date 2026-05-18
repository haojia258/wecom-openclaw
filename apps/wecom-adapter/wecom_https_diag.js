const crypto = require('crypto');
const xml2js = require('xml2js');
const https = require('https');

const WECOM_TOKEN = 'openclaw123';
const WECOM_ENCODING_AES_KEY = 'MztjE4hEwftpfHvxcAwgG764kHsobGbYKjl3nbqACtL';
const WECOM_CORP_ID = 'wwb5c359f492d2b26b';

function getAesKey() {
  return Buffer.from(WECOM_ENCODING_AES_KEY + '=', 'base64');
}

function encryptWeCom(plainXml) {
  const key = getAesKey();
  const iv = key.slice(0, 16);
  const random = crypto.randomBytes(16);
  const msgBuf = Buffer.from(plainXml, 'utf8');
  const msgLenBuf = Buffer.alloc(4);
  msgLenBuf.writeUInt32BE(msgBuf.length, 0);
  const appIdBuf = Buffer.from(WECOM_CORP_ID, 'utf8');
  const plaintext = Buffer.concat([random, msgLenBuf, msgBuf, appIdBuf]);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return encrypted.toString('base64');
}

function decryptWeCom(encryptMsgBase64) {
  const key = getAesKey();
  const iv = key.slice(0, 16);
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  decipher.setAutoPadding(false);
  let decrypted = Buffer.concat([decipher.update(encryptMsgBase64, 'base64'), decipher.final()]);
  const padByte = decrypted[decrypted.length - 1];
  if (padByte >= 1 && padByte <= 32) {
    decrypted = decrypted.slice(0, decrypted.length - padByte);
  }
  const msgLen = decrypted.readUInt32BE(16);
  const msg = decrypted.slice(20, 20 + msgLen).toString('utf8');
  const appId = decrypted.slice(20 + msgLen).toString('utf8');
  return { msg, appId };
}

function sha1(str) {
  return crypto.createHash('sha1').update(str).digest('hex');
}

function buildMsgSignature(encryptMsg, timestamp, nonce) {
  const arr = [WECOM_TOKEN, timestamp, nonce, encryptMsg].sort();
  return sha1(arr.join(''));
}

const ts = Math.floor(Date.now() / 1000).toString();
const nonce = 'nginx_test_' + ts;

const fakeMsgXml =
  '<xml>' +
  '<ToUserName><![CDATA[' + WECOM_CORP_ID + ']]></ToUserName>' +
  '<FromUserName><![CDATA[HaoZhongLiang]]></FromUserName>' +
  '<CreateTime>' + ts + '</CreateTime>' +
  '<MsgType><![CDATA[text]]></MsgType>' +
  '<Content><![CDATA[ping]]></Content>' +
  '<MsgId>9999999999</MsgId>' +
  '<AgentID>1000006</AgentID>' +
  '</xml>';

const encryptField = encryptWeCom(fakeMsgXml);
const signature = buildMsgSignature(encryptField, ts, nonce);

const requestBody =
  '<xml>' +
  '<Encrypt><![CDATA[' + encryptField + ']]></Encrypt>' +
  '<MsgSignature><![CDATA[' + signature + ']]></MsgSignature>' +
  '<TimeStamp>' + ts + '</TimeStamp>' +
  '<Nonce><![CDATA[' + nonce + ']]></Nonce>' +
  '</xml>';

console.log('===== HTTPS TEST (via nginx) =====');

const req = https.request({
  hostname: 'api.yudong.shop',
  port: 443,
  path: '/wecom/callback?msg_signature=' + signature + '&timestamp=' + ts + '&nonce=' + nonce,
  method: 'POST',
  headers: {
    'Content-Type': 'text/xml; charset=utf-8',
    'Content-Length': Buffer.byteLength(requestBody, 'utf8'),
    'User-Agent': 'Mozilla/4.0'
  },
  rejectUnauthorized: false
}, (res) => {
  const chunks = [];
  let totalSize = 0;
  console.log('status=' + res.statusCode);
  console.log('headers:', JSON.stringify(res.headers, null, 2));

  res.on('data', (chunk) => {
    chunks.push(chunk);
    totalSize += chunk.length;
  });

  res.on('end', () => {
    const data = Buffer.concat(chunks).toString('utf8');
    console.log('body total bytes=' + totalSize);
    console.log('body length=' + data.length);
    console.log('body starts with: ' + data.substring(0, 50));
    console.log('body ends with: ' + data.substring(data.length - 30));

    // Check for any extra whitespace or invisible chars
    if (data.length > 0 && data[0] !== '<') {
      console.log('WARNING: First char is NOT <, got: ' + JSON.stringify(data[0]) + ' (code ' + data.charCodeAt(0) + ')');
    }
    if (data.length > 0 && data[data.length - 1] !== '>') {
      console.log('WARNING: Last char is NOT >, got: ' + JSON.stringify(data[data.length - 1]) + ' (code ' + data.charCodeAt(data.length - 1) + ')');
    }

    // Check for BOM
    if (data.charCodeAt(0) === 0xFEFF) {
      console.log('WARNING: BOM detected at start!');
    }

    // Full response bytes hex dump (first 20 bytes)
    const buf = Buffer.concat(chunks);
    console.log('First 20 bytes hex:', buf.slice(0, 20).toString('hex'));

    if (data.length === 0) {
      console.log('EMPTY RESPONSE via HTTPS!');
      return;
    }

    xml2js.parseString(data, (err, result) => {
      if (err) {
        console.log('XML PARSE ERROR via HTTPS:', err.message);
        return;
      }
      const respEncrypt = result.xml.Encrypt[0];
      const respSignature = result.xml.MsgSignature[0];

      const verifySig = buildMsgSignature(respEncrypt, ts, nonce);
      console.log('\nHTTPS Signature: ' + (verifySig === respSignature ? 'MATCH' : 'MISMATCH!'));
      console.log('  expected: ' + verifySig);
      console.log('  got:      ' + respSignature);

      try {
        const { msg, appId } = decryptWeCom(respEncrypt);
        console.log('Decrypt OK, appId=' + (appId === WECOM_CORP_ID ? 'CORRECT' : 'WRONG: ' + appId));
        console.log('Content: ' + (msg.match(/<Content><!\[CDATA\[([\s\S]*?)\]\]><\/Content>/) || ['', 'N/A'])[1]);
      } catch (e) {
        console.log('Decrypt FAIL:', e.message);
      }
    });
  });
});

req.on('error', (e) => {
  console.error('HTTPS REQUEST ERROR:', e.message);
});
req.write(requestBody);
req.end();
