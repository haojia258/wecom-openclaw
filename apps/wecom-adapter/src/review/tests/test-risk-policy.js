const assert = require('assert');
const { scoreRisk, classifyRisk, buildRiskReview } = require('../risk-policy');

// 测试 1: scoreRisk 基础评分
function testScoreRiskBasic() {
  // .env = 35, 无 testCommandsRun → +25 = 60
  const result = scoreRisk({ files: ['.env'], testCommandsRun: [] });
  assert.strictEqual(result.riskScore, 60);
  assert.deepStrictEqual(result.forbiddenHits, ['.env']);
  console.log('OK: scoreRisk basic');
}

// 测试 2: classifyRisk 阈值
function testClassifyRisk() {
  assert.strictEqual(classifyRisk(85), 'high');
  assert.strictEqual(classifyRisk(80), 'high');  // 边界
  assert.strictEqual(classifyRisk(45), 'medium');
  assert.strictEqual(classifyRisk(40), 'medium'); // 边界
  assert.strictEqual(classifyRisk(35), 'low');
  assert.strictEqual(classifyRisk(0), 'low');
  console.log('OK: classifyRisk');
}

// 测试 3: buildRiskReview 完整返回
function testBuildRiskReview() {
  // nginx=20, 有 testCommandsRun → 无罚分 = 20, level=low
  const result = buildRiskReview({ files: ['nginx/conf'], testCommandsRun: ['npm test'] });
  assert.strictEqual(result.riskScore, 20);
  assert.strictEqual(result.level, 'low');
  assert.deepStrictEqual(result.forbiddenHits, ['nginx/conf']);
  assert.strictEqual(result.mergeAdvice, '可合并，建议清理非必要文件');
  assert.ok(Array.isArray(result.checklist));
  console.log('OK: buildRiskReview');
}

// 测试 4: scoreRisk 边界情况（空 patch）
function testScoreRiskEdge() {
  // patchSize=0 → 最高风险 100
  const result = scoreRisk({ files: [], patchSize: 0 });
  assert.strictEqual(result.riskScore, 100);
  assert.deepStrictEqual(result.forbiddenHits, []);

  // 无 testCommandsRun 字段（undefined）→ 不罚分
  const noPenalty = scoreRisk({ files: ['.env'] });
  assert.strictEqual(noPenalty.riskScore, 35); // .env=35, 无附加罚分

  console.log('OK: scoreRisk edge cases');
}

// 执行所有测试
function runAllTests() {
  testScoreRiskBasic();
  testClassifyRisk();
  testBuildRiskReview();
  testScoreRiskEdge();
  console.log('\nRisk-policy tests PASSED (4/4)');
}

runAllTests();
