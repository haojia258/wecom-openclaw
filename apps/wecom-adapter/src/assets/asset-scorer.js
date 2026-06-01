// P50.4 Asset Scorer — scoring, risk, copyright, reusability assessment
var classifier = require('./asset-classifier');

function scoreAsset(asset) {
  var baseScore = classifier.scoreAsset(asset.type, asset.size_bytes || 0, !!asset.source_url);
  var bonus = 0;

  // Tag-based bonuses
  if (asset.tags && asset.tags.length > 3) bonus += 5;
  if (asset.tags && asset.tags.indexOf('product') >= 0) bonus += 5;
  if (asset.tags && asset.tags.indexOf('video-marketing') >= 0) bonus += 3;

  // Quality signals
  if (asset.type === 'video') bonus += 5;
  if (asset.source_url && asset.source_url.length > 0) bonus += 3;

  var finalScore = Math.min(baseScore + bonus, 100);

  return {
    score: finalScore,
    risk_level: assessRisk(asset),
    copyright_status: assessCopyright(asset),
    reusability_score: assessReusability(asset, finalScore),
    breakdown: { baseScore: baseScore, bonus: bonus, final: finalScore }
  };
}

function assessRisk(asset) {
  if (!asset.copyright_status || asset.copyright_status === 'unknown') return 'high';
  if (asset.copyright_status === 'flagged') return 'high';
  if (asset.review_status === 'rejected') return 'high';
  if (asset.copyright_status === 'pending') return 'medium';
  return 'low';
}

function assessCopyright(asset) {
  if (asset.copyright_status === 'clean') return 'clean';
  if (asset.source_url && asset.source_url.length > 0) return 'pending'; // has source, needs review
  return 'unknown';
}

function assessReusability(asset, score) {
  if (score >= 85) return 'highly-reusable';
  if (score >= 65) return 'reusable';
  if (score >= 40) return 'limited';
  return 'not-recommended';
}

module.exports = { scoreAsset: scoreAsset };
