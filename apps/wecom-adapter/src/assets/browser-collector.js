// P50.3 Browser Collector — safe web crawling (REVIEW_ONLY, no bypass)
var fs = require('fs');
var path = require('path');

var COLLECTOR_DIR = path.join(__dirname, '..', '..', 'storage', 'openclaw-assets', 'raw');

// Safety rules — enforced
var BLOCKED_DOMAINS = ['paywall', 'premium', 'private', 'login-required'];
var REVIEW_ONLY = true;

var collectorText = null;
var collectorImage = null;
var collectorAudio = null;
var collectorVideo = null;
try { collectorText = require('./collector-text'); } catch (e) {}
try { collectorImage = require('./collector-image'); } catch (e) {}
try { collectorAudio = require('./collector-audio'); } catch (e) {}
try { collectorVideo = require('./collector-video'); } catch (e) {}

function collect(url, options) {
  options = options || {};
  if (REVIEW_ONLY && !options.approved) {
    return { success: false, reason: 'approval_required', message: 'Browser collection requires approved task. REVIEW_ONLY=true.' };
  }

  // Safety: check no blocked domains
  var isBlocked = BLOCKED_DOMAINS.some(function (d) { return url.toLowerCase().indexOf(d) >= 0; });
  if (isBlocked) {
    return { success: false, reason: 'blocked_domain', message: 'Cannot collect from paywall/private/login-protected pages.' };
  }

  // Simulated collection (no real browser in REVIEW_ONLY mode)
  var results = [];
  var types = options.collectTypes || ['text'];

  types.forEach(function (t) {
    var collector = t === 'text' ? collectorText : t === 'image' ? collectorImage : t === 'audio' ? collectorAudio : t === 'video' ? collectorVideo : null;
    if (collector) {
      var r = collector.collect(url, options);
      if (r && r.success) results.push(r);
    }
  });

  var screenshot = null;
  if (options.saveScreenshot) {
    screenshot = { type: 'screenshot', url: url + '/screenshot', saved: true, timestamp: new Date().toISOString() };
  }

  return {
    success: true,
    url: url,
    items: results.length,
    types: types,
    screenshot: screenshot,
    account: options.account || null,
    message: 'Collection simulated (REVIEW_ONLY). In production, Puppeteer/Playwright would execute.'
  };
}

module.exports = { collect: collect, REVIEW_ONLY: REVIEW_ONLY, BLOCKED_DOMAINS: BLOCKED_DOMAINS };
