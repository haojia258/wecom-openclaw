'use strict';
// P14.6 — Command Alias Map: canonical + NLP fallback
var ALIAS_MAP = {
  '/总控':    '/总控', '/dashboard': '/总控', '/home': '/总控',
  '/运营':    '/运营', '/operations': '/运营', '/投流中心': '/运营', '/marketing': '/运营',
  '/活动':    '/活动', '/campaigns': '/活动', '/活动报名': '/活动', '/活动利润': '/活动',
  '/视频':    '/视频', '/video': '/视频', '/视频素材': '/视频', '/视频计划': '/视频', '/素材匹配': '/视频',
  '/风险':    '/风险', '/risk': '/风险', '/风控': '/风险',
  '/AI':      '/AI', '/ai': '/AI', '/ai任务': '/AI', '/ai调度': '/AI', '/开源雷达': '/AI', '/oss-radar': '/AI',
  '/董事会':  '/董事会', '/board': '/董事会', '/目标': '/董事会', '/策略': '/董事会',
  '/目标':    '/目标', '/goals': '/目标', '/goal': '/目标',
  '/自治公司':'/自治公司', '/autonomous': '/自治公司', '/闭环': '/自治公司'
};

function resolve(cmd) {
  var canonical = ALIAS_MAP[cmd] || null;
  if (canonical) return canonical;

  // NLP fallback: try prefix/suffix matching
  var clean = cmd.replace(/^[\/\s]+/, '').replace(/[\s]+$/, '');
  var keys = Object.keys(ALIAS_MAP);
  for (var i = 0; i < keys.length; i++) {
    if (keys[i].indexOf(clean) >= 0 || clean.indexOf(keys[i].replace('/', '')) >= 0) return ALIAS_MAP[keys[i]];
  }
  return null;
}

function getAliases(canonical) {
  var result = [];
  Object.keys(ALIAS_MAP).forEach(function (k) { if (ALIAS_MAP[k] === canonical && k !== canonical) result.push(k); });
  return result;
}

function listCanonicals() {
  var seen = {};
  Object.values(ALIAS_MAP).forEach(function (v) { seen[v] = true; });
  return Object.keys(seen);
}

module.exports = { resolve: resolve, getAliases: getAliases, listCanonicals: listCanonicals, ALIAS_MAP: ALIAS_MAP };
