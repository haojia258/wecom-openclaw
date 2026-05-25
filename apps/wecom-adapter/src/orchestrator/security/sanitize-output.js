'use strict';

/**
 * sanitize-output.js — AI Runtime PR Guardrail: 输出脱敏
 *
 * 统一脱敏函数，覆盖所有已知敏感信息泄露向量：
 *   - sk-* API keys (OpenAI 格式)
 *   - Bearer tokens
 *   - Authorization headers
 *   - Cookie headers
 *   - token= / key= / secret= / password= 键值对
 *   - Windows 绝对路径 (C:\Users\, C:\Program Files\, etc.)
 *   - Linux 绝对路径 (/home/, /opt/, /etc/, etc.)
 *   - .env 路径片段
 *
 * 设计原则：
 *   1. 不抛出异常：任何输入都安全返回 string
 *   2. 不依赖运行时上下文：纯函数
 *   3. 顺序敏感：先匹配 sk-（最高优先级），再匹配 token=/key= 等
 *   4. 幂等：已脱敏的内容不会被重复替换
 */

/**
 * 统一脱敏函数 — 对所有输出到企业微信 Markdown 的字段做安全处理
 *
 * 覆盖（按优先级排序）：
 *   1. sk- 开头 API key（OpenAI 格式）
 *   2. Bearer token
 *   3. Authorization header（整行）
 *   4. Cookie header
 *   5. token=xxx 键值对
 *   6. key=xxx 键值对
 *   7. secret=xxx 键值对
 *   8. password=xxx 键值对
 *   9. Windows 绝对路径
 *   10. Linux 绝对路径
 *   11. .env 路径片段
 *
 * @param {*} value - 任意输入值
 * @returns {string} 脱敏后的安全字符串
 */
function redactSensitive(value) {
  if (value == null) return '';
  if (typeof value !== 'string') value = String(value);

  // 1. sk- 开头 API key（OpenAI 格式）
  value = value.replace(/\bsk-[a-zA-Z0-9\-_]{10,}\b/g, '[MASKED_API_KEY]');

  // 2. Bearer token
  value = value.replace(/\bBearer\s+[^,\s\n\r|]{10,}/gi, 'Bearer [MASKED]');

  // 3. Authorization header
  value = value.replace(/\bAuthorization\s*:\s*[^,\n\r|]{10,}/gi, 'Authorization: [MASKED]');

  // 4. Cookie header
  value = value.replace(/\bCookie\s*:\s*[^\s;`]{10,}/gi, 'Cookie: [MASKED]');

  // 5. token=xxx 键值对
  value = value.replace(/\btoken\s*=\s*['"]?[a-zA-Z0-9\-_\.\+]{6,}['"]?/gi, 'token=[MASKED]');

  // 6. key=xxx 键值对
  value = value.replace(/\bkey\s*=\s*['"]?[a-zA-Z0-9\-_\.\+]{6,}['"]?/gi, 'key=[MASKED]');

  // 7. secret=xxx 键值对
  value = value.replace(/\bsecret\s*=\s*['"]?[a-zA-Z0-9\-_\.\+]{6,}['"]?/gi, 'secret=[MASKED]');

  // 8. password=xxx 键值对
  value = value.replace(/\bpassword\s*=\s*['"]?[^\s,'";`|]{4,}['"]?/gi, 'password=[MASKED]');

  // 9. Windows 绝对路径
  value = value.replace(/[A-Za-z]:\\(?:Users|Program|Windows|WINDOWS|ProgramData)[^,;\s]*/gi, '[MASKED_PATH]');

  // 10. Linux 绝对路径
  value = value.replace(/\/(?:home|opt|etc|root|var|usr|tmp)\/[^,\s;|]*/g, '[MASKED_PATH]');

  // 11. .env 路径片段
  value = value.replace(/[^\s,;|]*\\\.env[^\s,;|]*/gi, '[MASKED_PATH]');
  value = value.replace(/[^\s,;|]*\/\.env[^\s,;|]*/g, '[MASKED_PATH]');
  value = value.replace(/(^|\s)\.env(?=\s|$)/g, '$1[MASKED_PATH]');

  return value;
}

module.exports = {
  redactSensitive: redactSensitive,
};
