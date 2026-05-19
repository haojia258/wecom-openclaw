'use strict';

const { buildPrompt } = require('./prompt-builder');
const { evaluate } = require('./score-model');
const { buildFallbackReport, generateAnalysis } = require('./fallback-analysis');
const { buildContext } = require('./memory/context-builder');
const { persistSnapshot } = require('./memory/snapshot-manager');

async function analyze(input = {}, options = {}) {
  const scores = evaluate(input);
  const memoryContext = buildContext(options.memoryOptions || {});
  const prompt = buildPrompt({ ...input, memoryTrend: memoryContext.trendText });

  const enhancer = options.enhancer
    ? () => options.enhancer({ prompt, input, scores })
    : null;

  const report = await generateAnalysis({ rawData: input, enhancer, trends: memoryContext.trends });
  const snapshots = persistSnapshot(input, scores, options.memoryOptions || {});
  return {
    prompt,
    scores,
    report,
    fallback: buildFallbackReport(input, memoryContext.trends),
    trends: memoryContext.trends,
    snapshotCount: snapshots.length,
  };
}

module.exports = {
  analyze,
};
