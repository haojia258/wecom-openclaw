// P48 Secret Redactor — redacts secrets from audit logs
// NEVER log: codes, tokens, api keys, secrets, webhooks, cookies, session tokens, auth headers
var REDACTED = '***REDACTED***';

var SECRET_PATTERNS = [
  { field: 'code',           pattern: /"code":\s*"[^"]+"/ },
  { field: 'token',          pattern: /"token":\s*"[^"]+"/ },
  { field: 'sessionToken',   pattern: /"sessionToken":\s*"[^"]+"/ },
  { field: 'session_token',  pattern: /"session_token":\s*"[^"]+"/ },
  { field: 'apiKey',         pattern: /"apiKey":\s*"[^"]+"/ },
  { field: 'api_key',        pattern: /"api_key":\s*"[^"]+"/ },
  { field: 'secret',         pattern: /"secret":\s*"[^"]+"/ },
  { field: 'password',       pattern: /"password":\s*"[^"]+"/ },
  { field: 'webhook',        pattern: /"webhook":\s*"[^"]+"/ },
  { field: 'webhook_url',    pattern: /"webhook_url":\s*"[^"]+"/ },
  { field: 'cookie',         pattern: /"cookie":\s*"[^"]+"/ },
  { field: 'authorization',  pattern: /"authorization":\s*"[^"]+"/ },
  { field: 'Authorization',  pattern: /"Authorization":\s*"[^"]+"/ },
  { field: 'wcom_session',   pattern: /wcom_session=[^;\s"]+/ }
];

// Redact secrets from a plain string
function redactString(str) {
  if (typeof str !== 'string') return str;
  var result = str;
  SECRET_PATTERNS.forEach(function (item) {
    result = result.replace(item.pattern, function (match) {
      var parts = match.split(':');
      return parts[0] + ': "' + REDACTED + '"';
    });
  });
  return result;
}

// Redact secrets from an object (deep clone + redact)
function redactObject(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  var redacted = JSON.parse(JSON.stringify(obj));

  var sensitiveFields = [
    'code', 'token', 'sessionToken', 'session_token', 'apiKey', 'api_key',
    'secret', 'password', 'webhook', 'webhook_url', 'cookie',
    'authorization', 'Authorization', 'accessToken', 'access_token'
  ];

  function walk(node) {
    if (!node || typeof node !== 'object') return;
    Object.keys(node).forEach(function (key) {
      if (sensitiveFields.indexOf(key) !== -1) {
        node[key] = REDACTED;
      } else if (typeof node[key] === 'object') {
        walk(node[key]);
      }
    });
  }
  walk(redacted);
  return redacted;
}

// Redact before writing to log
function redactMetadata(metadata) {
  return redactObject(metadata || {});
}

module.exports = { redactString: redactString, redactObject: redactObject, redactMetadata: redactMetadata, REDACTED: REDACTED, SECRET_PATTERNS: SECRET_PATTERNS };
