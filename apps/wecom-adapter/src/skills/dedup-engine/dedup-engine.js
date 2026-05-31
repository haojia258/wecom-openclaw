'use strict';

/**
 * dedup-engine.js — P17.1 Dedup Engine
 *
 * Detects duplicate assets by checksum, name, or URL. REVIEW_ONLY.
 */

function findDuplicates(assets, field) {
  var seen = {};
  var dups = [];

  assets.forEach(function (a) {
    var key = a[field || 'checksum'] || a.name || a.id;
    if (!key) return;
    if (seen[key]) {
      dups.push({ duplicate: a, original: seen[key], field: field || 'checksum' });
    } else {
      seen[key] = a;
    }
  });

  return dups;
}

function findByName(assets) {
  var seen = {};
  var dups = [];
  assets.forEach(function (a) {
    var name = (a.name || '').toLowerCase();
    if (!name) return;
    if (seen[name]) { dups.push({ duplicate: a, original: seen[name], field: 'name' }); }
    else { seen[name] = a; }
  });
  return dups;
}

function findByChecksum(assets) {
  return findDuplicates(assets.filter(function (a) { return a.checksum; }), 'checksum');
}

function findByUrl(assets) {
  return findDuplicates(assets.filter(function (a) { return a.url; }), 'url');
}

function dedupReport(assets) {
  return {
    total: assets.length,
    byName: findByName(assets),
    byChecksum: findByChecksum(assets),
    byUrl: findByUrl(assets),
    uniqueCount: function () {
      var seen = new Set();
      assets.forEach(function (a) { seen.add(a.checksum || a.name || a.id); });
      return seen.size;
    }()
  };
}

module.exports = {
  findDuplicates: findDuplicates, findByName: findByName,
  findByChecksum: findByChecksum, findByUrl: findByUrl,
  dedupReport: dedupReport
};
