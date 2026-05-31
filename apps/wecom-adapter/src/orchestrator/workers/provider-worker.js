'use strict';

/**
 * provider-worker.js — 统一 AI Provider HTTP Client
 *
 * 支持: OpenAI / DeepSeek / Doubao
 * 复用安全层: feature-gate / allowlist / rate-limit / audit
 */

var https = require('https');
var http = require('http');

// ─── API 调用 ──────────────────────────────────────────────

/**
 * 调用兼容 OpenAI Chat Completions 格式的 API
 * @param {object} opts
 * @param {string} opts.hostname - API host
 * @param {string} opts.apiKey - API key
 * @param {string} opts.model - 模型名
 * @param {object[]} opts.messages - 消息数组
 * @param {number} [opts.temperature=0.7]
 * @param {number} [opts.maxTokens=4096]
 * @param {number} [opts.timeout=60000]
 * @param {object} [opts.extraBody] - 额外请求体字段
 * @returns {Promise<object>} { text, usage, model }
 */
function callChatCompletions(opts) {
  return new Promise(function (resolve, reject) {
    var body = JSON.stringify({
      model: opts.model,
      messages: opts.messages,
      temperature: opts.temperature !== undefined ? opts.temperature : 0.7,
      max_tokens: opts.maxTokens || 4096,
      stream: false,
    });

    if (opts.extraBody) {
      Object.keys(opts.extraBody).forEach(function (k) {
        body[k] = opts.extraBody[k];
      });
    }

    var options = {
      hostname: opts.hostname,
      path: opts.path || '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + opts.apiKey,
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: opts.timeout || 60000,
    };

    var req = https.request(options, function (res) {
      var data = '';
      res.on('data', function (chunk) { data += chunk; });
      res.on('end', function () {
        try {
          var json = JSON.parse(data);
          if (res.statusCode !== 200) {
            reject(new Error('API error ' + res.statusCode + ': ' + (json.error && json.error.message ? json.error.message : data.substring(0, 200))));
            return;
          }
          var text = json.choices && json.choices[0] && json.choices[0].message ?
                     json.choices[0].message.content : '';
          resolve({
            text: text,
            usage: json.usage || null,
            model: json.model || opts.model,
          });
        } catch (e) {
          reject(new Error('JSON parse error: ' + e.message + ' | raw: ' + data.substring(0, 200)));
        }
      });
    });

    req.on('error', function (e) { reject(e); });
    req.on('timeout', function () { req.destroy(); reject(new Error('API timeout after ' + (opts.timeout || 60000) + 'ms')); });

    req.write(body);
    req.end();
  });
}

module.exports = { callChatCompletions };
