'use strict';

const { buildPrompt } = require('./prompt-builder');
const { evaluate } = require('./score-model');
const { buildFallbackReport, generateAnalysis } = require('./fallback-analysis');

async function analyze(input = {}, options = {}) {
  const scores = evaluate(input);
  const prompt = buildPrompt(input);

  const enhancer = options.enhancer
    ? () => options.enhancer({ prompt, input, scores })
    : null;

  const report = await generateAnalysis({ rawData: input, enhancer });
  return {
    prompt,
    scores,
    report,
    fallback: buildFallbackReport(input),
  };
}

module.exports = {
  analyze,
};
