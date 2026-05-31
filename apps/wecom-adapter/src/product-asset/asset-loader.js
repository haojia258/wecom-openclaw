'use strict';

// P13 Product Asset System — Asset Loader
const fs = require('fs');
const path = require('path');

var VALID_TYPES = ['json', 'image', 'video'];
var VALID_CATEGORIES = ['general', 'marketing', 'ad_creative', 'video_clip',
  'product_image', 'roi_report', 'ctr_data', 'strategy_doc'];

/**
 * Scan a directory and load all asset JSON files into memory
 */
function scanDirectory(assetDir) {
  var assets = {};
  if (!fs.existsSync(assetDir)) {
    fs.mkdirSync(assetDir, { recursive: true });
    return assets;
  }

  var files = fs.readdirSync(assetDir).filter(function (f) { return f.endsWith('.json'); });
  files.forEach(function (f) {
    try {
      var record = JSON.parse(fs.readFileSync(path.join(assetDir, f), 'utf-8'));
      if (record.id && !record._archived) {
        assets[record.id] = record;
      }
    } catch (e) {
      // Skip corrupt files
    }
  });

  return assets;
}

/**
 * Validate a single asset record
 */
function validate(record) {
  var errors = [];

  if (!record.id) errors.push('Missing id');
  if (!record.name) errors.push('Missing name');
  if (!record.type || VALID_TYPES.indexOf(record.type) < 0) {
    errors.push('Invalid type: ' + record.type + ' (valid: ' + VALID_TYPES.join(', ') + ')');
  }
  if (!record.category || VALID_CATEGORIES.indexOf(record.category) < 0) {
    errors.push('Invalid category: ' + record.category + ' (valid: ' + VALID_CATEGORIES.join(', ') + ')');
  }
  if (record.reviewOnly !== true) {
    errors.push('reviewOnly must be true');
  }
  if (record.requiresHumanApproval !== true) {
    errors.push('requiresHumanApproval must be true');
  }

  return { valid: errors.length === 0, errors: errors };
}

/**
 * Filter assets by type
 */
function filterByType(assets, type) {
  if (!type) return assets;
  return assets.filter(function (a) { return a.type === type; });
}

/**
 * Get supported file types for assets
 */
function getSupportedTypes() {
  return VALID_TYPES.slice();
}

/**
 * Get supported categories
 */
function getSupportedCategories() {
  return VALID_CATEGORIES.slice();
}

module.exports = {
  scanDirectory: scanDirectory,
  validate: validate,
  filterByType: filterByType,
  getSupportedTypes: getSupportedTypes,
  getSupportedCategories: getSupportedCategories,
  VALID_TYPES: VALID_TYPES,
  VALID_CATEGORIES: VALID_CATEGORIES
};
