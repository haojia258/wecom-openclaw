'use strict';

const { loadSnapshots } = require('./memory-store');
const { analyzeTrends } = require('./trend-analysis');

function buildContext(options = {}) {
  const snapshots = loadSnapshots(options.filePath);
  const trends = analyzeTrends(snapshots);

  const lines = [
    '【连续运营趋势】',
    ...trends.summary.map((s) => `- ${s}`),
    `最近样本数: ${snapshots.length}`,
  ];

  return {
    snapshots,
    trends,
    trendText: lines.join('\n'),
  };
}

module.exports = { buildContext };
