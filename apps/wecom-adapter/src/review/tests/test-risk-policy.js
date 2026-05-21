const assert = require('assert');
const { analyzeRisk } = require('../risk-policy');

// 测试用例1：基础敏感文件
function testBasicSensitiveFiles() {
  const files = [
    'apps/wecom-adapter/src/commands/analysis.js',
    '.env',
    'nginx/default.conf',
  ];
  const result = analyzeRisk(files);
  assert.strictEqual(result.riskScore, 30 + 15); // .env=30, nginx=15
  assert.strictEqual(result.level, 'high'); // 45分属于high
  assert.deepStrictEqual(result.forbiddenHits, ['.env', 'nginx/default.conf']);
  assert.ok(result.mergeAdvice.includes('禁止合并'));
  assert.ok(result.checklist.some(item => item.includes('.env')));
  console.log('✅ 基础敏感文件检测通过');
}

// 测试用例2：企业微信主链路
function testWecomCrypto() {
  const files = [
    'apps/wecom-adapter/src/wecom/callback.js',
    'apps/wecom-adapter/src/wecom/encrypt.js',
    'apps/wecom-adapter/src/wecom/decrypt.js',
  ];
  const result = analyzeRisk(files);
  // 每个文件20分，3个文件共60分
  assert.strictEqual(result.riskScore, 60);
  assert.strictEqual(result.level, 'high');
  assert.deepStrictEqual(result.forbiddenHits, [
    'apps/wecom-adapter/src/wecom/callback.js',
    'apps/wecom-adapter/src/wecom/encrypt.js',
    'apps/wecom-adapter/src/wecom/decrypt.js',
  ]);
  assert.ok(result.checklist.some(item => item.includes('企业微信加解密')));
  console.log('✅ 企业微信主链路检测通过');
}

// 测试用例3：force push 脚本
function testForcePush() {
  const files = [
    'scripts/force-push-to-main.sh',
    'scripts/git-push-force.sh',
  ];
  const result = analyzeRisk(files);
  // 每个脚本20分，共40分
  assert.strictEqual(result.riskScore, 40);
  assert.strictEqual(result.level, 'medium');
  assert.deepStrictEqual(result.forbiddenHits, [
    'scripts/force-push-to-main.sh',
    'scripts/git-push-force.sh',
  ]);
  assert.ok(result.checklist.some(item => item.includes('force push')));
  console.log('✅ force push 脚本检测通过');
}

// 测试用例4：混合路径 (logs, node_modules, storage, cookies, screenshots)
function testMiscPaths() {
  const files = [
    'logs/app.log',
    'node_modules/lodash/index.js',
    'storage/cache.json',
    'cookies/session.txt',
    'screenshots/error.png',
  ];
  const result = analyzeRisk(files);
  // 每条5分，共25分
  assert.strictEqual(result.riskScore, 25);
  assert.strictEqual(result.level, 'medium');
  assert.deepStrictEqual(result.forbiddenHits.length, 5);
  assert.ok(result.checklist.some(item => item.includes('logs')));
  console.log('✅ 运行时/缓存目录检测通过');
}

// 测试用例5：组合场景 – 包含安全文件+高风险文件
function testMixedSafeAndRisk() {
  const files = [
    'src/index.js',
    'src/utils/helper.js',
    '.env',
    'nginx/ssl/server.key',
    'deploy/pm2.json',
  ];
  const result = analyzeRisk(files);
  // .env=30, .key=25, nginx=15, deploy=15, pm2=10 => 95分
  assert.strictEqual(result.riskScore, 95);
  assert.strictEqual(result.level, 'critical');
  assert.deepStrictEqual(result.forbiddenHits, ['.env', 'nginx/ssl/server.key', 'deploy/pm2.json']);
  assert.ok(result.mergeAdvice.includes('严重风险'));
  console.log('✅ 路径组合检测通过');
}

// 执行所有测试
function runAllTests() {
  testBasicSensitiveFiles();
  testWecomCrypto();
  testForcePush();
  testMiscPaths();
  testMixedSafeAndRisk();
  console.log('\n🎉 所有测试通过 (5/5)');
}

runAllTests();
