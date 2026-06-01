// P50.1 Asset Classifier — type detection, scoring, risk assessment
var path = require('path');

var TYPE_MAP = {
  '.txt': 'text', '.md': 'text', '.json': 'text', '.csv': 'text', '.xml': 'text',
  '.jpg': 'image', '.jpeg': 'image', '.png': 'image', '.gif': 'image', '.webp': 'image', '.svg': 'image',
  '.mp3': 'audio', '.wav': 'audio', '.ogg': 'audio', '.aac': 'audio',
  '.mp4': 'video', '.mov': 'video', '.avi': 'video', '.webm': 'video', '.mkv': 'video'
};

function detectType(filename) {
  var ext = path.extname(filename || '').toLowerCase();
  return TYPE_MAP[ext] || 'unknown';
}

function detectPlatform(sourceUrl) {
  if (!sourceUrl) return 'unknown';
  var u = sourceUrl.toLowerCase();
  if (u.indexOf('douyin.com') >= 0 || u.indexOf('tiktok.com') >= 0) return 'douyin';
  if (u.indexOf('taobao.com') >= 0 || u.indexOf('tmall.com') >= 0) return 'taobao';
  if (u.indexOf('jd.com') >= 0) return 'jd';
  if (u.indexOf('pinduoduo.com') >= 0) return 'pinduoduo';
  if (u.indexOf('bilibili.com') >= 0) return 'bilibili';
  if (u.indexOf('weixin.qq.com') >= 0) return 'wechat';
  if (u.indexOf('kuaishou.com') >= 0) return 'kuaishou';
  if (u.indexOf('xiaohongshu.com') >= 0) return 'xiaohongshu';
  return 'other';
}

function suggestTags(type, title, platform) {
  var tags = [];
  if (type) tags.push(type);
  if (platform) tags.push(platform);
  return tags;
}

function scoreAsset(type, sizeBytes, hasSource) {
  var score = 50; // baseline
  if (type === 'video') score += 20;
  else if (type === 'image') score += 15;
  else if (type === 'audio') score += 10;
  if (hasSource) score += 10;
  if (sizeBytes > 1024 * 1024) score += 5; // >1MB
  return Math.min(score, 100);
}

function assessRisk(copyrightStatus, reviewStatus, platform) {
  if (copyrightStatus === 'unknown') return 'high';
  if (copyrightStatus === 'flagged') return 'high';
  if (reviewStatus === 'rejected') return 'high';
  if (copyrightStatus === 'pending') return 'medium';
  return 'low';
}

module.exports = { detectType: detectType, detectPlatform: detectPlatform, suggestTags: suggestTags, scoreAsset: scoreAsset, assessRisk: assessRisk };
