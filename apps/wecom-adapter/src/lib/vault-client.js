/**
 * vault-client.js — OpenClaw Secret Vault 客户端
 *
 * 从 HashiCorp Vault (AppRole 认证) 读取密钥到内存。
 * 所有密钥值自动注册到 sanitize 白名单，供 logger 使用。
 *
 * 使用方式:
 *   const vault = require('./lib/vault-client');
 *   await vault.init();
 *   const token = vault.get('WECOM_TOKEN');
 *
 * 安全特性:
 *   - 密钥仅在内存中，不写入磁盘
 *   - 自动 sanitize：日志中密钥显示为 WECO-****abcd 格式
 *   - AppRole 登录，禁止 root token
 *   - Token 自动续期（提前 60s 刷新）
 */

const https = require('https');
const http = require('http');

// ─── 配置（从 .env 读取 VAULT 连接信息，不含真实密钥）─────
const VAULT_ADDR = process.env.VAULT_ADDR || 'http://127.0.0.1:8200';
const VAULT_ROLE_ID = process.env.VAULT_ROLE_ID || '';
const VAULT_SECRET_ID = process.env.VAULT_SECRET_ID || '';

// 密钥映射: 应用侧 key → Vault 路径
const SECRET_MAP = {
  // wecom-adapter 核心
  WECOM_TOKEN:             { path: 'kv/wecom/prod', field: 'token' },
  WECOM_ENCODING_AES_KEY:  { path: 'kv/wecom/prod', field: 'encoding_aes_key' },
  WECOM_CORP_ID:           { path: 'kv/wecom/prod', field: 'corp_id' },
  WECOM_SECRET:            { path: 'kv/wecom/prod', field: 'secret' },
  WECOM_WEBHOOK_URL:       { path: 'kv/wecom/prod', field: 'webhook_url' },
  // OpenAI
  OPENAI_API_KEY:          { path: 'kv/openclaw/prod/openai', field: 'openai_api_key' },
  // 抖店
  DOUYIN_APP_KEY:          { path: 'kv/doudian/prod', field: 'app_key' },
  DOUYIN_APP_SECRET:       { path: 'kv/doudian/prod', field: 'app_secret' },
  DOUYIN_ACCESS_TOKEN:     { path: 'kv/doudian/prod', field: 'access_token' },
  // MySQL/Redis
  MYSQL_ROOT_PASSWORD:     { path: 'kv/openclaw/prod', field: 'mysql_root_password' },
  MYSQL_PASSWORD:          { path: 'kv/openclaw/prod', field: 'mysql_password' },
  REDIS_PASSWORD:          { path: 'kv/openclaw/prod', field: 'redis_password' },
};

// ─── 内存缓存 ──────────────────────────
var _secrets = {};
var _token = null;
var _tokenExpiry = 0;

// ─── sanitize 注册表（供 logger 使用）────
var _sanitizePatterns = [];

function _registerSanitize(key, value) {
  if (!value || value.length < 6) return;
  var escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  _sanitizePatterns.push({
    pattern: new RegExp(escaped, 'g'),
    replacement: key.substring(0, 4).toUpperCase() + '-****' + value.slice(-4),
  });
}

/**
 * 对任意字符串进行 sanitize（mask 所有已知密钥值）
 */
function sanitize(msg) {
  if (!msg || typeof msg !== 'string') return msg;
  var result = msg;
  for (var i = 0; i < _sanitizePatterns.length; i++) {
    var p = _sanitizePatterns[i];
    result = result.replace(p.pattern, p.replacement);
  }
  // 通用 OpenAI key 格式 sk-...
  result = result.replace(/sk-[a-zA-Z0-9]{20,}/g, 'sk-****[REDACTED]');
  // 通用 WeCom Secret 格式（URL query 中的 secret=xxx 或 corsecret=xxx）
  result = result.replace(/([?&](corp?)?secret=)[^&\s]+/gi, function(m, p1) { return p1 + '[REDACTED]'; });
  return result;
}

// ─── HTTP 请求封装 ─────────────────────
function _vaultRequest(method, path, body, token) {
  return new Promise(function (resolve, reject) {
    var isHttps = VAULT_ADDR.indexOf('https') === 0;
    var lib = isHttps ? https : http;
    var url;
    try {
      url = new URL(VAULT_ADDR + '/v1' + path);
    } catch (e) {
      return reject(new Error('Vault invalid VAULT_ADDR: ' + VAULT_ADDR));
    }

    var options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname,
      method: method,
      headers: {
        'X-Vault-Token': token || _token,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    };

    var req = lib.request(options, function (res) {
      var data = '';
      res.on('data', function (chunk) { data += chunk; });
      res.on('end', function () {
        try {
          var json = JSON.parse(data);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(json);
          } else {
            var errMsg = (json.errors && json.errors.join('; ')) || JSON.stringify(json);
            reject(new Error('Vault ' + method + ' ' + path + ' -> ' + res.statusCode + ': ' + errMsg));
          }
        } catch (e) {
          reject(new Error('Vault parse error: ' + data.substring(0, 200)));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', function () { req.destroy(); reject(new Error('Vault timeout')); });

    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ─── AppRole 登录 ──────────────────────
async function _approleLogin() {
  if (_token && Date.now() < _tokenExpiry) return _token;

  var result = await _vaultRequest('POST', '/auth/approle/login', {
    role_id: VAULT_ROLE_ID,
    secret_id: VAULT_SECRET_ID,
  }, '');  // 不需要 X-Vault-Token

  _token = result.auth.client_token;
  // 提前 60s 刷新，避免 token 过期
  _tokenExpiry = Date.now() + (result.auth.lease_duration - 60) * 1000;
  return _token;
}

// ─── 从 Vault 读取密钥（kv-v2）─────────
// kv-v2 API 路径: GET /v1/{mount}/data/{path}
// 响应结构: { data: { data: {...}, metadata: {...} } }
async function _fetchSecret(vaultPath) {
  await _approleLogin();
  var result = await _vaultRequest('GET', '/' + vaultPath.replace(/^kv\/([^/]+)\/(.+)/, 'kv/$1/data/$2'));
  var inner = (result.data && result.data.data) || result.data || {};
  return inner;
}

// ─── 批量读取优化（同一路径只请求一次）────
async function _batchFetch(keys) {
  // 按 vault path 分组，同一路径只发一次请求
  var pathGroups = {};
  keys.forEach(function (key) {
    var entry = SECRET_MAP[key];
    if (!entry) return;
    var p = entry.path;
    if (!pathGroups[p]) pathGroups[p] = [];
    pathGroups[p].push(key);
  });

  var paths = Object.keys(pathGroups);
  for (var i = 0; i < paths.length; i++) {
    var vaultPath = paths[i];
    try {
      var data = await _fetchSecret(vaultPath);
      var groupKeys = pathGroups[vaultPath];
      for (var j = 0; j < groupKeys.length; j++) {
        var key = groupKeys[j];
        var field = SECRET_MAP[key].field;
        var value = data[field];
        if (value && value !== 'NOT_CONFIGURED') {
          _secrets[key] = value;
          _registerSanitize(key, value);
        }
      }
    } catch (e) {
      console.error('[Vault] Failed to fetch path ' + vaultPath + ': ' + e.message);
    }
  }
}

// ─── 公共 API ──────────────────────────

/**
 * 初始化: 从 Vault 拉取所有密钥到内存
 * 应在应用启动时调用一次
 * @param {string[]} [secretKeys] 可选，只加载指定密钥
 * @returns {object} 加载的密钥对象
 */
async function init(secretKeys) {
  var keys = secretKeys || Object.keys(SECRET_MAP);
  await _batchFetch(keys);

  var loaded = Object.keys(_secrets).length;
  if (loaded === 0) {
    throw new Error('[Vault] No secrets loaded. Check VAULT_ADDR/VAULT_ROLE_ID/VAULT_SECRET_ID and Vault status.');
  }

  console.log('[Vault] Initialized: ' + loaded + ' secrets loaded, ' + _sanitizePatterns.length + ' sanitize patterns registered');
  return _secrets;
}

/**
 * 获取单个密钥值
 * @param {string} key 密钥名称
 * @returns {string} 密钥值
 */
function get(key) {
  if (!(key in _secrets)) {
    // 延迟: 检查是否在 SECRET_MAP 中但未加载
    if (SECRET_MAP[key]) {
      throw new Error('[Vault] Secret not loaded: ' + key + '. Did you call vault.init()?');
    }
    throw new Error('[Vault] Unknown secret key: ' + key);
  }
  return _secrets[key];
}

/**
 * 尝试获取（不抛异常）
 * @param {string} key
 * @returns {string|null}
 */
function tryGet(key) {
  return _secrets[key] || null;
}

/**
 * 获取所有已加载的密钥（浅拷贝）
 */
function getAll() {
  var copy = {};
  var ks = Object.keys(_secrets);
  for (var i = 0; i < ks.length; i++) {
    copy[ks[i]] = _secrets[ks[i]];
  }
  return copy;
}

/**
 * 检查是否已初始化
 */
function isReady() {
  return Object.keys(_secrets).length > 0;
}

/**
 * 检查 Vault 连通性和认证状态
 * @returns {Promise<object>} { ok, addr, secrets, error? }
 */
async function health() {
  try {
    await _approleLogin();
    return { ok: true, addr: VAULT_ADDR, secrets: Object.keys(_secrets).length };
  } catch (e) {
    return { ok: false, error: sanitize(e.message) };
  }
}

module.exports = { init, get, tryGet, getAll, isReady, sanitize, health };
