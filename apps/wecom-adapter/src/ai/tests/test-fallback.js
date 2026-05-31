'use strict';

const assert = require('assert');
const { generateAnalysis } = require('../fallback-analysis');
const sample = require('./mock-data/sample');

(async () => {
  const timeoutLike = await generateAnalysis({
    rawData: sample.risky,
    enhancer: async () => {
      throw new Error('timeout');
    },
  });

  assert(timeoutLike.includes('今日运营分析'), 'fallback should always return analysis text');

  const emptyLike = await generateAnalysis({
    rawData: sample.risky,
    enhancer: async () => '   ',
  });

  assert(emptyLike.includes('本地回退'), 'empty enhancer output should fallback');
  console.log('test-fallback passed');
})();
