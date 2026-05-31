'use strict';

// P13 Product Asset System — Asset Matcher
// Routes tasks to appropriate product assets based on task type and metadata

/**
 * Matching rules: taskType → preferred category + type
 * Priority decreases down the list.
 */
var MATCH_RULES = [
  { taskType: 'roi',        category: 'roi_report',    type: 'json',   weight: 10 },
  { taskType: 'analysis',   category: 'roi_report',    type: 'json',   weight: 9  },
  { taskType: 'ctr',        category: 'ctr_data',      type: 'json',   weight: 10 },
  { taskType: 'video',      category: 'video_clip',    type: 'video',  weight: 10 },
  { taskType: 'video',      category: 'ad_creative',   type: 'image',  weight: 7  },
  { taskType: 'marketing',  category: 'marketing',     type: 'json',   weight: 9  },
  { taskType: 'marketing',  category: 'ad_creative',   type: 'image',  weight: 8  },
  { taskType: 'marketing',  category: 'product_image', type: 'image',  weight: 7  },
  { taskType: 'asset',      category: 'general',       type: null,     weight: 5  },
  { taskType: 'strategy',   category: 'strategy_doc',  type: 'json',   weight: 10 },
  { taskType: 'development',category: 'general',       type: 'json',   weight: 5  },
  { taskType: 'validation', category: 'general',       type: null,     weight: 3  },
  { taskType: 'audit',      category: 'general',       type: null,     weight: 3  }
];

/**
 * Match assets to a task
 * @param {Array} assets — list of asset records
 * @param {Object} task — { type, tags, category, ... }
 * @returns {Array} sorted matching assets with scores
 */
function match(assets, task) {
  if (!task || !task.type) return [];

  var scored = [];
  assets.forEach(function (asset) {
    var score = 0;

    MATCH_RULES.forEach(function (rule) {
      if (rule.taskType === task.type) {
        if (asset.category === rule.category) score += rule.weight * 3;
        if (rule.type && asset.type === rule.type) score += rule.weight * 2;
        if (!rule.type) score += rule.weight;
        if (asset.taskType === rule.taskType) score += rule.weight * 2;
      }
    });

    // Bonus for tag overlap
    if (task.tags && asset.tags) {
      task.tags.forEach(function (tt) {
        if (asset.tags.indexOf(tt) >= 0) score += 5;
      });
    }

    // Bonus for keyword in name
    if (task.name && asset.name.toLowerCase().indexOf(task.name.toLowerCase()) >= 0) {
      score += 8;
    }

    if (score > 0) {
      scored.push({ asset: asset, score: score });
    }
  });

  // Sort by score descending
  scored.sort(function (a, b) { return b.score - a.score; });
  return scored;
}

/**
 * Get recommended asset count for a task type
 */
function recommendedAssetCount(taskType) {
  var counts = { roi: 5, ctr: 5, video: 3, marketing: 8, asset: 10, strategy: 3, development: 5, validation: 3, audit: 3 };
  return counts[taskType] || 5;
}

/**
 * Generate match report
 */
function matchReport(allAssets, task) {
  var matches = match(allAssets, task);
  return {
    task: task,
    matches: matches.length,
    topMatches: matches.slice(0, 5).map(function (m) {
      return { id: m.asset.id, name: m.asset.name, score: m.score };
    }),
    recommendedCount: recommendedAssetCount(task.type),
    reviewOnly: true
  };
}

module.exports = {
  match: match,
  matchReport: matchReport,
  recommendedAssetCount: recommendedAssetCount,
  MATCH_RULES: MATCH_RULES
};
