// P50.4 AI Classifier — auto-classification and tagging for assets
var classifier = require('./asset-classifier');

function classifyAsset(asset) {
  var type = asset.type || classifier.detectType(asset.title || '');
  var platform = asset.platform || classifier.detectPlatform(asset.source_url || '');
  var suggestedTags = [];

  // AI-simulated tagging based on content clues
  if (type === 'image') {
    suggestedTags.push('visual');
    if (asset.title && asset.title.toLowerCase().indexOf('product') >= 0) suggestedTags.push('product');
    if (asset.title && asset.title.toLowerCase().indexOf('banner') >= 0) suggestedTags.push('ad');
  }
  if (type === 'video') {
    suggestedTags.push('media');
    if (asset.title && asset.title.toLowerCase().indexOf('tutorial') >= 0) suggestedTags.push('tutorial');
    if (asset.title && asset.title.toLowerCase().indexOf('live') >= 0) suggestedTags.push('live');
    suggestedTags.push('video-marketing');
  }
  if (type === 'text') {
    suggestedTags.push('document');
    if (asset.title && asset.title.toLowerCase().indexOf('report') >= 0) suggestedTags.push('report');
    if (asset.title && asset.title.toLowerCase().indexOf('strategy') >= 0) suggestedTags.push('strategy');
  }
  if (type === 'audio') {
    suggestedTags.push('sound');
    suggestedTags.push('voiceover');
  }

  // Platform-specific tags
  if (platform === 'douyin') suggestedTags.push('douyin-content');
  if (platform === 'taobao') suggestedTags.push('ecommerce');

  return {
    type: type,
    platform: platform,
    tags: suggestedTags,
    confidence: calculateConfidence(suggestedTags.length),
    model: 'ai-classifier-v0.1 (simulated)'
  };
}

function calculateConfidence(tagCount) {
  if (tagCount >= 4) return 'high';
  if (tagCount >= 2) return 'medium';
  return 'low';
}

module.exports = { classifyAsset: classifyAsset };
