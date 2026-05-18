const crypto = require('crypto');
const xml2js = require('xml2js');

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

// ====== 构造模拟企微 POST ======
const ts = Math.floor(Date.now() / 1000).toString();
const nonce = 'diag_test_nonce_' + ts;

const fakeMsgXml =
  '<xml>' +
  '<ToUserName><![CDATA[' + WECOM_CORP_ID + ']]></ToUserName>' +
  '<FromUserName><![CDATA[HaoZhongLiang]]></FromUserName>' +
  '<CreateTime>' + ts + '</CreateTime>' +
  '<MsgType><![CDATA[text]]></MsgType>' +
  '<Content><![CDATA[/帮助]]></Content>' +
  '<MsgId>8888888888</MsgId>' +
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

console.log('===== REQUEST =====');
console.log('ts=' + ts + ' nonce=' + nonce);
console.log('body length=' + requestBody.length);

const http = require('http');
const req = http.request({
  hostname: '127.0.0.1',
  port: 3001,
  path: '/wecom/callback?msg_signature=' + signature + '&timestamp=' + ts + '&nonce=' + nonce,
  method: 'POST',
  headers: {
    'Content-Type': 'text/xml; charset=utf-8',
    'Content-Length': Buffer.byteLength(requestBody, 'utf8')
  }
}, (res) => {
  let data = '';
  console.log('\n===== RESPONSE =====');
  console.log('status=' + res.statusCode);
  console.log('headers:', JSON.stringify(res.headers));

  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    console.log('body length=' + data.length);
    console.log('body (first 300): ' + data.substring(0, 300));

    if (!data || data.length === 0) {
      console.log('\nEMPTY RESPONSE! No reply sent.');
      process.exit(1);
    }

    xml2js.parseString(data, (err, result) => {
      if (err) {
        console.log('\nXML PARSE ERROR:', err.message);
        process.exit(1);
      }

      const respEncrypt = result.xml.Encrypt[0];
      const respSignature = result.xml.MsgSignature[0];
      const respTimestamp = result.xml.TimeStamp[0];
      const respNonce = result.xml.Nonce[0];

      console.log('\n===== RESPONSE FIELDS =====');
      console.log('Encrypt length=' + respEncrypt.length);
      console.log('MsgSignature=' + respSignature);
      console.log('TimeStamp=' + respTimestamp);
      console.log('Nonce=' + respNonce);

      // 验证签名
      const verifySig = buildMsgSignature(respEncrypt, ts, nonce);
      console.log('\n===== SIGNATURE CHECK =====');
      console.log('Expected (using req ts/nonce): ' + verifySig);
      console.log('Response MsgSignature:         ' + respSignature);
      console.log('Match: ' + (verifySig === respSignature ? 'YES' : 'NO'));

      // 解密响应
      try {
        const { msg, appId } = decryptWeCom(respEncrypt);
        console.log('\n===== DECRYPTED RESPONSE =====');
        console.log('appId=' + appId + ' match=' + (appId === WECOM_CORP_ID ? 'YES' : 'NO'));
        console.log('msg=' + msg.substring(0, 500));

        xml2js.parseString(msg, (err2, inner) => {
          if (err2) {
            console.log('Inner XML parse error:', err2.message);
          } else {
            console.log('\n===== INNER XML STRUCTURE =====');
            console.log('ToUserName=' + (inner.xml.ToUserName ? inner.xml.ToUserName[0] : 'MISSING'));
            console.log('FromUserName=' + (inner.xml.FromUserName ? inner.xml.FromUserName[0] : 'MISSING'));
            console.log('CreateTime=' + (inner.xml.CreateTime ? inner.xml.CreateTime[0] : 'MISSING'));
            console.log('MsgType=' + (inner.xml.MsgType ? inner.xml.MsgType[0] : 'MISSING'));
            console.log('Content length=' + (inner.xml.Content ? inner.xml.Content[0].length : 'MISSING'));

            const toUser = inner.xml.ToUserName ? inner.xml.ToUserName[0] : '';
            const fromUser = inner.xml.FromUserName ? inner.xml.FromUserName[0] : '';
            console.log('\nToUserName=' + toUser + ' (expect HaoZhongLiang): ' + (toUser === 'HaoZhongLiang' ? 'OK' : 'BUG'));
            console.log('FromUserName=' + fromUser + ' (expect CorpID): ' + (fromUser === WECOM_CORP_ID ? 'OK' : 'BUG'));
          }
        });
      } catch (decryptErr) {
        console.log('DECRYPT ERROR:', decryptErr.message);
      }
    });
  });
});

req.on('error', (e) => {
  console.error('REQUEST ERROR:', e.message);
});
req.write(requestBody);
req.end();
