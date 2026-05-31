'use strict';

/**
 * tag-engine.js — P17.1 Tag Engine
 *
 * Auto-tagging and tag management for assets. REVIEW_ONLY.
 */

var TAG_RULES = [
  { pattern: /\.(png|jpg|jpeg|gif|webp|svg)$/i, tags: ['image', 'visual'] },
  { pattern: /\.(mp4|mov|avi|mkv|webm)$/i, tags: ['video', 'visual'] },
  { pattern: /\.(pdf|doc|docx|xls|xlsx|ppt|pptx)$/i, tags: ['document', 'office'] },
  { pattern: /\.(js|ts|jsx|tsx|py|go|rs|java)$/i, tags: ['code', 'source'] },
  { pattern: /\.(json|yaml|yml|toml|xml)$/i, tags: ['config', 'data'] },
  { pattern: /(banner|hero|header)/i, tags: ['banner', 'hero'] },
  { pattern: /(logo|icon|favicon)/i, tags: ['brand', 'logo'] },
  { pattern: /(product|商品|sku)/i, tags: ['product', 'commerce'] },
  { pattern: /(screenshot|截图|screen)/i, tags: ['screenshot', 'demo'] }
];

function autoTag(asset) {
  var name = (asset.name || '') + (asset.format ? '.' + asset.format : '');
  var tags = new Set(asset.tags || []);

  TAG_RULES.forEach(function (rule) {
    if (rule.pattern.test(name)) {
      rule.tags.forEach(function (t) { tags.add(t); });
    }
  });

  // Category-based tags
  if (asset.category) tags.add(asset.category);

  return Array.from(tags);
}

function suggestTags(query) {
  return TAG_RULES
    .filter(function (r) { return r.pattern.test(query); })
    .reduce(function (acc, r) { return acc.concat(r.tags); }, []);
}

function getAllTags(assets) {
  var allTags = new Set();
  assets.forEach(function (a) {
    (a.tags || []).forEach(function (t) { allTags.add(t); });
  });
  return Array.from(allTags).sort();
}

function tagStats(assets) {
  var stats = {};
  assets.forEach(function (a) {
    (a.tags || []).forEach(function (t) {
      stats[t] = (stats[t] || 0) + 1;
    });
  });
  return stats;
}

module.exports = { autoTag: autoTag, suggestTags: suggestTags, getAllTags: getAllTags, tagStats: tagStats };
