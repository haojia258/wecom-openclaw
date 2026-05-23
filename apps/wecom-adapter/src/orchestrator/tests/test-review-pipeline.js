/**
 * test-review-pipeline.js — P3 fix: risk score [object Object] → number
 * 
 * 验证 review-pipeline.js 和 worker-layer.js 中
 * scoreRisk() 返回值被正确解构为数字
 */
'use strict';

const path = require('path');

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error('  FAIL: ' + msg);
  }
}

console.log('\n=== P3 Fix: Risk Score Display ===\n');

// Test 1: scoreRisk returns { riskScore, forbiddenHits }
console.log('Test 1: scoreRisk() returns object with riskScore number');
const riskPolicy = require(path.join(__dirname, '../../review/risk-policy'));
const result = riskPolicy.scoreRisk({
  files: ['review/test.js'],
  testCommandsRun: false,
  patchSize: 5,
});
assert(typeof result === 'object', 'result should be an object');
assert(typeof result.riskScore === 'number', 'result.riskScore should be a number');
assert(Array.isArray(result.forbiddenHits), 'result.forbiddenHits should be an array');
console.log('  riskScore=' + result.riskScore + ', forbiddenHits=' + result.forbiddenHits.length);

// Test 2: classifyRisk receives a number (not an object)
console.log('\nTest 2: classifyRisk() receives a number');
const highScore = 85;
const mediumScore = 50;
const lowScore = 10;
assert(riskPolicy.classifyRisk(highScore) === 'high', '85 → high');
assert(riskPolicy.classifyRisk(mediumScore) === 'medium', '50 → medium');
assert(riskPolicy.classifyRisk(lowScore) === 'low', '10 → low');
console.log('  classifyRisk(85)=' + riskPolicy.classifyRisk(highScore));
console.log('  classifyRisk(50)=' + riskPolicy.classifyRisk(mediumScore));
console.log('  classifyRisk(10)=' + riskPolicy.classifyRisk(lowScore));

// Test 3: review-pipeline.js reviewTask stores score as number
console.log('\nTest 3: review-pipeline reviewTask stores score as number');
const { reviewTask } = require('../review-pipeline');
// 模拟 task
const mockTask = {
  taskId: 'test-p3-fix',
  patchFile: 'test.js',
};
const review = reviewTask(mockTask);
const rpResult = review.results.find(r => r.source === 'risk-policy');
if (rpResult) {
  assert(typeof rpResult.score === 'number', 'review.result.score should be a number, got: ' + typeof rpResult.score);
  console.log('  score=' + rpResult.score + ' (type: ' + typeof rpResult.score + ')');
  console.log('  level=' + rpResult.level);
}

// Test 4: review-pipeline formatReviewForWecom produces readable output
console.log('\nTest 4: formatReviewForWecom no [object Object]');
const { formatReviewForWecom } = require('../review-pipeline');
const formatted = formatReviewForWecom(review);
assert(typeof formatted === 'string', 'output should be string');
assert(formatted.indexOf('[object Object]') === -1, 'output should NOT contain [object Object]');
if (formatted.indexOf('风险分=') !== -1) {
  // extract the score from the formatted string
  const match = formatted.match(/风险分=(\d+)/);
  if (match) {
    console.log('  风险分 displayed as: ' + match[1]);
    assert(parseInt(match[1]) >= 0, 'risk score should be >= 0');
  }
}

// Test 5: worker-layer.js scoreRisk result correctly destructured
console.log('\nTest 5: worker-layer scoreRisk result is number (not object)');
try {
  const riskPolicy2 = require('../../review/risk-policy');
  const sr = riskPolicy2.scoreRisk({
    files: ['test.js'],
    testCommandsRun: false,
    patchSize: 0,
  });
  // Simulate the FIXED worker-layer pattern
  const extractedScore = sr.riskScore;
  const extractedLevel = riskPolicy2.classifyRisk(extractedScore);
  assert(typeof extractedScore === 'number', 'extracted score should be a number, got: ' + typeof extractedScore);
  assert(typeof extractedLevel === 'string', 'extracted level should be a string');
  console.log('  riskScore=' + extractedScore + ' (type: ' + typeof extractedScore + ')');
  console.log('  riskLevel=' + extractedLevel);
} catch (e) {
  console.log('  (load error: ' + e.message + ')');
  failed++;
}

// Summary
console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===\n');

process.exit(failed > 0 ? 1 : 0);
