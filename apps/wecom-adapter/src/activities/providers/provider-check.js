// P58 Provider Self-Check — dry run only, no real API calls
var pl = require('./provider-layer');

function checkAll() {
  var results = [];

  // MockProvider
  var mock = pl.PROVIDERS.mock;
  results.push({
    provider: 'MockProvider',
    status: mock ? 'PASS' : 'MISSING',
    configured: !!mock,
    dryRun: true,
    note: mock ? 'Mock provider ready. No real API calls.' : 'Provider not found.'
  });

  // PlaywrightProvider
  var pw = pl.PROVIDERS.playwright;
  if (pw) {
    results.push({
      provider: 'PlaywrightProvider',
      status: 'AVAILABLE',
      configured: true,
      dryRun: true,
      note: 'Playwright provider loaded. Will only check page reachable, no form submission.'
    });
  } else {
    results.push({
      provider: 'PlaywrightProvider',
      status: 'NOT_CONFIGURED',
      configured: false,
      dryRun: true,
      note: 'Playwright provider not installed. Run: npm install playwright'
    });
  }

  // OpenAPIProvider
  var api = pl.PROVIDERS.openapi;
  if (api) {
    results.push({
      provider: 'OpenAPIProvider',
      status: 'AVAILABLE',
      configured: true,
      dryRun: true,
      note: 'OpenAPI provider loaded. Will only check API key/config exists, no production calls.'
    });
  } else {
    results.push({
      provider: 'OpenAPIProvider',
      status: 'NOT_CONFIGURED',
      configured: false,
      dryRun: true,
      note: 'OpenAPI provider not configured. Requires API credentials.'
    });
  }

  return results;
}

function selfCheck() {
  var results = checkAll();

  var lines = ['🔍 Provider 自检 (Dry Run)', '', '⚠️ 不提交真实报名/调价', '', '| Provider | Status | 配置 | 说明 |', '|----------|--------|------|------|'];
  results.forEach(function (r) {
    var s = r.status === 'PASS' || r.status === 'AVAILABLE' ? '✅ ' + r.status : r.status === 'NOT_CONFIGURED' ? '⚪ ' + r.status : '❌ ' + r.status;
    lines.push('| ' + r.provider + ' | ' + s + ' | ' + (r.configured ? '已配置' : '未配置') + ' | ' + (r.note || '') + ' |');
  });
  lines.push('', 'Active: ' + pl.getActive(), 'All providers: ' + Object.keys(pl.PROVIDERS).join(', '), '', '⚠️ Dry run only. No production API calls.');
  return lines.join('\n');
}

function status() {
  var results = checkAll();
  return {
    providers: results,
    active: pl.getActive(),
    total: results.length,
    available: results.filter(function (r) { return r.configured; }).length
  };
}

module.exports = { checkAll: checkAll, selfCheck: selfCheck, status: status };
