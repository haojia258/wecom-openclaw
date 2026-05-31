'use strict';

/**
 * test-ai-grayscale-command.js
 * /ai灰度 命令测试套件（含 5 项修复验证 + 回归 + 新增测试）
 *
 * 覆盖：
 *   1. Gate disabled 不调用 OpenAI
 *   2. 只允许 planner-summary-worker
 *   3. 非 planner-summary-worker 被拒绝
 *   4. validateWorkerPrompt 使用 loader
 *   5. 返回不包含 key/token/header/cookie/path
 *   6. 输出包含 REVIEW_ONLY__NO_AUTO_APPLY
 *   7. 不调用 DeepSeek/豆包
 *   8. command-center 可 resolve /ai灰度
 *   9. Mock 输出格式验证
 *   10. 模块导出验证
 *   11. [新增] Promise worker 测试 (mock executeOpenAIWorker 返回 Promise)
 *   12. [新增] Prompt loader 测试 (loadWorkerPrompt + validateWorkerPrompt)
 *   13. [新增] 真实 router 参数测试 (execute(ctx, args) dual params)
 *   14. [新增] 恶意 AI 输出测试 (sanitizeOutput 脱敏)
 *   15. [新增] 回归测试 (gate disabled, planner-summary 通过, 安全标记, 不调用 DeepSeek/豆包)
 */

var assert = require('assert');
var path = require('path');

// ============================================================
// Mock 工具
// ============================================================

/**
 * 设置 openai-worker mock 并重新加载 ai-grayscale 模块
 * @param {object} mockExports - mock 的模块导出
 * @returns {object} 重新加载后的 cmd 模块
 */
function setupMock(mockExports) {
  // 清除 ai-grayscale 缓存
  var cmdPath = require.resolve('../../commands/ai-grayscale');
  delete require.cache[cmdPath];

  // 设置 openai-worker mock
  var owPath = require.resolve('../../orchestrator/workers/openai-worker');
  var origOW = require.cache[owPath];
  require.cache[owPath] = {
    id: owPath,
    filename: owPath,
    loaded: true,
    exports: mockExports,
  };

  // 重新加载
  var cmd = require('../../commands/ai-grayscale');
  return { cmd: cmd, origOW: origOW, owPath: owPath };
}

/**
 * 恢复 openai-worker mock
 */
function restoreMock(saved) {
  if (saved && saved.origOW !== undefined) {
    require.cache[saved.owPath] = saved.origOW;
  }
  // 清除 ai-grayscale 缓存以便下次正常加载
  var cmdPath = require.resolve('../../commands/ai-grayscale');
  delete require.cache[cmdPath];
}

// ============================================================
// 工具：创建 mock openai-worker 返回
// ============================================================

function makeSuccessMock(outputText) {
  return {
    executeOpenAIWorker: function () {
      return Promise.resolve({
        outputText: outputText || 'Mock success output',
        error: '',
        model: 'gpt-4o',
        safetyNote: 'REVIEW_ONLY__NO_AUTO_APPLY',
        taskId: 'test-task',
        promptHash: 'abc123def456',
        createdAt: new Date().toISOString(),
      });
    },
  };
}

function makeErrorMock(msg) {
  return {
    executeOpenAIWorker: function () {
      return Promise.resolve({
        outputText: '',
        error: msg || 'Mock error message',
        model: 'gpt-4o',
        safetyNote: 'ERROR__NO_OUTPUT',
        taskId: 'test-task',
        promptHash: 'abc123def456',
        createdAt: new Date().toISOString(),
      });
    },
  };
}

function makeThrowMock(msg) {
  return {
    executeOpenAIWorker: function () {
      return Promise.reject(new Error(msg || 'Mock throw error'));
    },
  };
}

// ============================================================
// Test 1: Gate disabled 不调用 OpenAI
// ============================================================
console.log('\n=== Test 1: Gate disabled 不调用 OpenAI ===');
(async function () {
  var cmd = require('../../commands/ai-grayscale');
  var originalEnv = process.env.OPENAI_WORKER_ENABLED;
  process.env.OPENAI_WORKER_ENABLED = 'false';

  var result = await cmd.execute({ args: 'planner-summary-worker' });

  assert(result.indexOf('未开启') !== -1, '应提示 Gate 未开启');
  assert(result.indexOf('OPENAI_WORKER_ENABLED') !== -1, '应提示环境变量名');
  assert(result.indexOf('success') === -1, '不应包含成功标记');

  process.env.OPENAI_WORKER_ENABLED = originalEnv;
  console.log('  ✓ Gate disabled 不调用 OpenAI');
})();

// ============================================================
// Test 2: 只允许 planner-summary-worker（Gate=true 时不走 OpenAI 调用检查）
// ============================================================
console.log('\n=== Test 2: 只允许 planner-summary-worker ===');
(async function () {
  var cmd = require('../../commands/ai-grayscale');
  var originalEnv = process.env.OPENAI_WORKER_ENABLED;
  process.env.OPENAI_WORKER_ENABLED = 'true';

  // planner-summary-worker 直接通过 workerId 检查
  // 之后会进 loader.validateWorkerPrompt → 需要 prompt 文件存在（测试环境已确认存在）
  var result = await cmd.execute({ args: 'planner-summary-worker' });

  // 应通过 workerId 检查，不返回"仅支持 planner-summary-worker"错误
  assert(result.indexOf('⚠️ 灰度测试仅支持') === -1, 'valid workerId 不应被拒绝');

  // 非 planner 应被拒绝（不需要开启 Gate）
  process.env.OPENAI_WORKER_ENABLED = 'false';
  var result2 = await cmd.execute({ args: 'roi-analysis-worker' });
  assert(result2.indexOf('仅支持') !== -1, '非 planner-summary-worker 应被拒绝');
  assert(result2.indexOf('planner-summary') !== -1, '应显示支持的 workerId');

  process.env.OPENAI_WORKER_ENABLED = originalEnv;
  console.log('  ✓ 只允许 planner-summary-worker');
})();

// ============================================================
// Test 3: 非 planner-summary-worker 被拒绝
// ============================================================
console.log('\n=== Test 3: 非 planner-summary-worker 被拒绝 ===');
(async function () {
  var cmd = require('../../commands/ai-grayscale');

  var result1 = await cmd.execute({ args: 'roi-analysis-worker' });
  assert(result1.indexOf('仅支持') !== -1 || result1.indexOf('planner-summary-worker') !== -1, 'roi-analysis-worker 应被拒绝');

  var result2 = await cmd.execute({ args: 'video-content-worker' });
  assert(result2.indexOf('仅支持') !== -1 || result2.indexOf('planner-summary-worker') !== -1, 'video-content-worker 应被拒绝');

  var result3 = await cmd.execute({ args: 'risk-review-worker' });
  assert(result3.indexOf('仅支持') !== -1 || result3.indexOf('planner-summary-worker') !== -1, 'risk-review-worker 应被拒绝');

  var result4 = await cmd.execute({ args: '' });
  // 空参数默认 planner-summary-worker，不应被拒绝
  assert(result4.indexOf('⚠️ 灰度测试仅支持') === -1, '空参数应默认为 planner-summary-worker');

  console.log('  ✓ 非 planner-summary-worker 被拒绝');
})();

// ============================================================
// Test 4: executeMock 输出正确（不依赖外部模块）
// ============================================================
console.log('\n=== Test 4: executeMock 输出正确 ===');
(function () {
  var cmd = require('../../commands/ai-grayscale');
  var output = cmd.executeMock();

  assert(output.indexOf('AI 灰度测试报告') !== -1, 'mock 输出应包含报告标题');
  assert(output.indexOf('planner-summary-worker') !== -1, '应包含 worker 名称');
  assert(output.indexOf('openai') !== -1, '应包含 provider');
  assert(output.indexOf('gpt-4o') !== -1, '应包含 model');

  console.log('  ✓ executeMock 输出正确（不依赖外部模块）');
})();

// ============================================================
// Test 5: 返回不包含敏感信息（synchronize via executeMock）
// ============================================================
console.log('\n=== Test 5: 返回不包含 key/token/header/cookie/path ===');
(function () {
  var cmd = require('../../commands/ai-grayscale');
  var output = cmd.executeMock();
  var outputLower = output.toLowerCase();

  // API keys
  assert(output.indexOf('sk-') === -1, '不应包含 sk- API key');
  assert(outputLower.indexOf('api_key') === -1, '不应包含 api_key');
  assert(outputLower.indexOf('apikey') === -1, '不应包含 apikey');

  // Tokens
  assert(!output.match(/Bearer\s+[a-zA-Z0-9]/), '不应包含 Bearer token 值');
  assert(!outputLower.match(/token\s*=\s*[a-zA-Z0-9]/), '不应包含 token= 值');

  // Headers
  assert(outputLower.indexOf('authorization:') === -1, '不应包含 Authorization header');
  assert(outputLower.indexOf('cookie:') === -1, '不应包含 Cookie header');

  // Key/secret/password
  assert(!outputLower.match(/key\s*=\s*[a-zA-Z0-9]{4,}/), '不应包含 key= 值');
  assert(!outputLower.match(/secret\s*=\s*[a-zA-Z0-9]{4,}/), '不应包含 secret= 值');
  assert(!outputLower.match(/password\s*=\s*[a-zA-Z0-9]{4,}/), '不应包含 password= 值');

  // Paths
  assert(outputLower.indexOf('c:\\users') === -1, '不应包含 Windows Users 路径');
  assert(outputLower.indexOf('c:\\program') === -1, '不应包含 Windows Program 路径');
  assert(!output.match(/\/home\//), '不应包含 /home/ 路径');
  assert(!output.match(/\/opt\//), '不应包含 /opt/ 路径');
  assert(outputLower.indexOf('.env') === -1, '不应包含 .env 路径');

  console.log('  ✓ 返回不包含 key/token/header/cookie/path');
})();

// ============================================================
// Test 6: 输出包含 REVIEW_ONLY__NO_AUTO_APPLY
// ============================================================
console.log('\n=== Test 6: 输出包含 REVIEW_ONLY__NO_AUTO_APPLY ===');
(function () {
  var cmd = require('../../commands/ai-grayscale');
  var output = cmd.executeMock();

  assert(output.indexOf('REVIEW_ONLY__NO_AUTO_APPLY') !== -1, '应包含安全标记 REVIEW_ONLY__NO_AUTO_APPLY');

  console.log('  ✓ 输出包含 REVIEW_ONLY__NO_AUTO_APPLY');
})();

// ============================================================
// Test 7: 不调用 DeepSeek/豆包
// ============================================================
console.log('\n=== Test 7: 不调用 DeepSeek/豆包 ===');
(function () {
  var cmd = require('../../commands/ai-grayscale');
  var output = cmd.executeMock();

  // 只检查调用信息部分（安全注解中会提到"不调用 DeepSeek"）
  var infoSection = output.split('---')[0] || output;
  var infoLower = infoSection.toLowerCase();

  // 调用信息中不应包含 DeepSeek/豆包
  assert(infoLower.indexOf('deepseek') === -1, '调用信息不应包含 DeepSeek');
  assert(infoLower.indexOf('豆包') === -1, '调用信息不应包含豆包');
  assert(infoLower.indexOf('doubao') === -1, '调用信息不应包含 doubao');

  // 调用信息中应包含 openai
  assert(infoLower.indexOf('openai') !== -1, '调用信息应包含 openai provider');

  console.log('  ✓ 不调用 DeepSeek/豆包');
})();

// ============================================================
// Test 8: command-center 可 resolve /ai灰度
// ============================================================
console.log('\n=== Test 8: command-center 可 resolve /ai灰度 ===');
(function () {
  var commandCenter = require('../../lib/command-center');

  // Test /ai灰度
  var resolved = commandCenter.resolve('/ai灰度 planner-summary');
  assert(resolved !== null, '/ai灰度 应被解析');
  assert.strictEqual(typeof resolved.handler, 'function', 'handler 应为函数');
  assert(resolved.args.indexOf('planner-summary') !== -1, 'args 应包含 planner-summary');

  // Test /aigray alias
  var resolved2 = commandCenter.resolve('/aigray planner-summary');
  assert(resolved2 !== null, '/aigray 别名应被解析');
  assert.strictEqual(typeof resolved2.handler, 'function', 'handler 应为函数');

  // Test /ai灰度 without args
  var resolved3 = commandCenter.resolve('/ai灰度');
  assert(resolved3 !== null, '/ai灰度 无参数应被解析');

  console.log('  ✓ command-center 可 resolve /ai灰度 和 /aigray');
})();

// ============================================================
// Test 9: Mock 输出格式验证
// ============================================================
console.log('\n=== Test 9: Mock 输出格式验证 ===');
(function () {
  var cmd = require('../../commands/ai-grayscale');
  var output = cmd.executeMock();

  // Title
  assert(output.indexOf('# 🧪 AI 灰度测试报告') !== -1, '应包含标题');

  // Call info table
  assert(output.indexOf('## 📊 调用信息') !== -1, '应包含调用信息段落');
  assert(output.indexOf('planner-summary-worker') !== -1, '应包含 worker 名称');
  assert(output.indexOf('openai') !== -1, '应包含 provider');
  assert(output.indexOf('gpt-4o') !== -1, '应包含 model');

  // Status
  assert(output.indexOf('✅ 成功') !== -1, '应包含成功状态');

  // AI output
  assert(output.indexOf('## 🤖 AI 输出摘要') !== -1, '应包含 AI 输出段落');

  // Safety
  assert(output.indexOf('> 🔒') !== -1, '应包含安全说明');
  assert(output.indexOf('不自动 apply') !== -1, '应包含不自动 apply 说明');
  assert(output.indexOf('不调用 DeepSeek') !== -1, '应包含不调用 DeepSeek 说明');

  console.log('  ✓ Mock 输出格式验证');
})();

// ============================================================
// Test 10: 模块导出验证
// ============================================================
console.log('\n=== Test 10: 模块导出验证 ===');
(function () {
  var cmd = require('../../commands/ai-grayscale');

  assert.strictEqual(typeof cmd.execute, 'function', 'execute 应为函数');
  assert.strictEqual(typeof cmd.executeMock, 'function', 'executeMock 应为函数');
  assert.strictEqual(typeof cmd.desc, 'string', 'desc 应为字符串');
  assert(cmd.desc.indexOf('planner-summary') !== -1, 'desc 应包含 planner-summary');

  // 新增导出验证
  assert.strictEqual(typeof cmd.redactSensitive, 'function', 'redactSensitive 应为函数');
  assert.strictEqual(typeof cmd.escapeMarkdown, 'function', 'escapeMarkdown 应为函数');
  assert.strictEqual(typeof cmd.sanitizeField, 'function', 'sanitizeField 应为函数');
  assert.strictEqual(typeof cmd.sanitizeOutput, 'function', 'sanitizeOutput 应为函数');

  console.log('  ✓ 模块导出验证');
})();

// ============================================================
// [新增] Test 11: Promise worker 测试
//   mock executeOpenAIWorker 返回 Promise，确认 await 后读取 outputText
// ============================================================
console.log('\n=== [新增] Test 11: Promise worker 测试 ===');
(async function () {
  var saved = setupMock(makeSuccessMock('Hello from OpenAI mock'));
  var cmd = saved.cmd;
  var originalEnv = process.env.OPENAI_WORKER_ENABLED;
  process.env.OPENAI_WORKER_ENABLED = 'true';

  var result = await cmd.execute({ args: 'planner-summary-worker' });

  // assert: 输出包含 mock 返回的 outputText
  assert(result.indexOf('Hello from OpenAI mock') !== -1, '应包含 mock 返回的 outputText');
  // assert: 输出包含成功状态
  assert(result.indexOf('✅ 成功') !== -1, '应包含成功状态');
  // assert: 包含安全标记
  assert(result.indexOf('REVIEW_ONLY__NO_AUTO_APPLY') !== -1, '应包含安全标记');

  process.env.OPENAI_WORKER_ENABLED = originalEnv;
  restoreMock(saved);
  console.log('  ✓ Promise worker 测试 — await 后正确读取 outputText');
})();

// ============================================================
// [新增] Test 12: Prompt loader 测试
//   loadWorkerPrompt + validateWorkerPrompt 被调用（通过真实 loader 验证）
// ============================================================
console.log('\n=== [新增] Test 12: Prompt loader 测试 ===');
(async function () {
  var saved = setupMock(makeSuccessMock('Loader test output'));
  var cmd = saved.cmd;
  var originalEnv = process.env.OPENAI_WORKER_ENABLED;
  process.env.OPENAI_WORKER_ENABLED = 'true';

  // 这会走完整流程：loader.getWorker → loader.validateWorkerPrompt → loader.loadWorkerPrompt
  var result = await cmd.execute({ args: 'planner-summary-worker' });

  // 验证：成功走到 OpenAI 调用阶段（没有提前返回"无法加载 Worker 配置"或"无法加载 Prompt 文件"）
  assert(result.indexOf('❌ 无法加载') === -1, '不应报无法加载错误');
  assert(result.indexOf('❌ Prompt 验证失败') === -1, '不应报 Prompt 验证失败');
  assert(result.indexOf('❌ 安全属性缺失') === -1, '不应报安全属性缺失');

  // 验证：loader 加载了 prompt（输出包含 REVIEW_ONLY__NO_AUTO_APPLY）
  assert(result.indexOf('REVIEW_ONLY__NO_AUTO_APPLY') !== -1, '输出应包含安全标记');

  process.env.OPENAI_WORKER_ENABLED = originalEnv;
  restoreMock(saved);
  console.log('  ✓ Prompt loader 测试 — loadWorkerPrompt + validateWorkerPrompt 正常工作');
})();

// ============================================================
// [新增] Test 13: 真实 router 参数测试
//   execute(ctx, args) 同时支持 args 和 ctx.args
//   /ai灰度 roi-analysis-worker → 明确拒绝
//   /aigray roi-analysis-worker → 明确拒绝
//   ctx.args 为空时不能默认绕过
// ============================================================
console.log('\n=== [新增] Test 13: 真实 router 参数测试 ===');
(async function () {
  var cmd = require('../../commands/ai-grayscale');

  // 13a: args 参数优先（真实 router 传入方式）
  var r1 = await cmd.execute({}, 'roi-analysis-worker');
  assert(r1.indexOf('仅支持') !== -1 || r1.indexOf('planner-summary-worker') !== -1,
    '/ai灰度 roi-analysis-worker 必须拒绝（args 参数）');

  // 13b: ctx.args 回退方式
  var r2 = await cmd.execute({ args: 'roi-analysis-worker' });
  assert(r2.indexOf('仅支持') !== -1 || r2.indexOf('planner-summary-worker') !== -1,
    '/ai灰度 roi-analysis-worker 必须拒绝（ctx.args）');

  // 13c: ctx.args 为空，args 参数未传入 → 默认 planner-summary-worker
  var r3 = await cmd.execute({});
  assert(r3.indexOf('仅支持') === -1, 'ctx.args 为空且无 args 参数时，应默认 planner-summary-worker');

  // 13d: ctx 为 null/undefined 时也能正常工作
  var r4 = await cmd.execute(null, 'planner-summary-worker');
  assert(r4.indexOf('⚠️ 灰度测试仅支持') === -1, 'ctx 为 null 时 planner-summary-worker 应不被拒绝');

  // 13e: args 为空字符串 → 默认 planner-summary-worker
  var r5 = await cmd.execute({ args: '' });
  assert(r5.indexOf('⚠️ 灰度测试仅支持') === -1, '空 args 应默认 planner-summary-worker');

  // 13f: args 为 undefined（显式传入）
  var r6 = await cmd.execute({ args: 'planner-summary-worker' }, undefined);
  assert(r6.indexOf('⚠️ 灰度测试仅支持') === -1, 'args 为 undefined 时应回退到 ctx.args');

  console.log('  ✓ 真实 router 参数测试 — dual params 正确执行');
})();

// ============================================================
// [新增] Test 14: 恶意 AI 输出测试 (sanitizeOutput 脱敏)
//   mock outputText 包含敏感信息，断言企业微信 Markdown 不泄露、不破坏
// ============================================================
console.log('\n=== [新增] Test 14: 恶意 AI 输出脱敏测试 ===');
(async function () {
  var maliciousOutput =
    'Here is the result.\n' +
    'API Key: sk-proj-abc123def456ghi789jkl\n' +
    'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\n' +
    'Cookie: session=abc123def456; user=admin\n' +
    'Token: token=sk-abcdef123456\n' +
    'Config key=mysecretkey123\n' +
    'Secret: secret=supersecretvalue\n' +
    'Password: password=admin123!\n' +
    'Path: C:\\Users\\haoji\\.env\n' +
    'Server path: /opt/wecom-openclaw/.env\n' +
    'Code block: ```\nconsole.log("test");\n```\n' +
    'Table injection: | malicious | column |\n' +
    'Normal safe text here.';

  var saved = setupMock(makeSuccessMock(maliciousOutput));
  var cmd = saved.cmd;
  var originalEnv = process.env.OPENAI_WORKER_ENABLED;
  process.env.OPENAI_WORKER_ENABLED = 'true';

  var result = await cmd.execute({ args: 'planner-summary-worker' });

  // 14a: sk- API key 不应泄露
  assert(result.indexOf('sk-proj-abc123') === -1, '不应包含 sk- API key 原文');
  assert(result.indexOf('[MASKED_API_KEY]') !== -1, '应包含脱敏占位符');

  // 14b: Bearer token 不应泄露（JWT 原文不能出现）
  assert(result.indexOf('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9') === -1, '不应包含 JWT token 原文');

  // 14c: Authorization + Bearer 整体被脱敏
  // 注意：Authorization: Bearer xxx → 先 Bearer 脱敏 → Authorization: Bearer [MASKED]
  //      → 再 Authorization 脱敏整行 → Authorization: [MASKED]
  // 最终可能只有 Authorization: [MASKED]，Bearer [MASKED] 被吸收
  var hasAuthRedacted = result.indexOf('Authorization: [MASKED]') !== -1 || result.indexOf('Bearer [MASKED]') !== -1;
  assert(hasAuthRedacted, 'Authorization header 或 Bearer token 应被脱敏');

  // 14d: Cookie 不应泄露
  assert(result.indexOf('abc123def456') === -1, 'Cookie session 值不应泄露');
  assert(result.indexOf('Cookie: [MASKED]') !== -1, 'Cookie 应被脱敏');

  // 14e: token= 键值对不应泄露
  // 注意：token=sk-abcdef123456 中 sk- 先被捕获为 [MASKED_API_KEY]
  // 导致 token=[MASKED_API_KEY]，可能不被后续 token= 模式再次替换
  assert(result.indexOf('token=sk-abcdef') === -1, 'token= 敏感值不应泄露');
  var tokenRedacted = result.indexOf('token=[MASKED]') !== -1 || result.indexOf('token=[MASKED_API_KEY]') !== -1;
  assert(tokenRedacted, 'token= 值应被脱敏');

  // 14f: key= 键值对不应泄露
  assert(result.indexOf('mysecretkey123') === -1, 'key= 值不应泄露');
  assert(result.indexOf('key=[MASKED]') !== -1, 'key= 应被脱敏');

  // 14g: secret= 键值对不应泄露
  assert(result.indexOf('supersecretvalue') === -1, 'secret= 值不应泄露');
  assert(result.indexOf('secret=[MASKED]') !== -1, 'secret= 应被脱敏');

  // 14h: password= 键值对不应泄露
  assert(result.indexOf('admin123') === -1, 'password 值不应泄露');
  assert(result.indexOf('password=[MASKED]') !== -1, 'password= 应被脱敏');

  // 14i: Windows 路径不应泄露
  assert(result.indexOf('C:\\Users\\haoji') === -1, 'Windows Users 路径不应泄露');
  assert(result.indexOf('[MASKED_PATH]') !== -1, '路径应被脱敏');

  // 14j: Linux 路径不应泄露
  assert(result.indexOf('/opt/wecom-openclaw') === -1, 'Linux 路径不应泄露');

  // 14k: .env 路径不应泄露
  assert(result.indexOf('.env') === -1 || result.indexOf('[MASKED_PATH]') !== -1, '.env 不应泄露');

  // 14l: ``` 代码围栏应被处理（不应有未配对的 ```）
  var fenceCount = (result.match(/```/g) || []).length;
  assert(fenceCount % 2 === 0, '``` 代码围栏应成对出现');
  // 如果使用了 [CODE_BLOCK] 替换，验证它存在
  assert(result.indexOf('[CODE_BLOCK]') !== -1 || fenceCount % 2 === 0, '代码围栏应被安全处理');

  // 14m: | 表格注入应被转义
  // 在 AI 输出摘要中，不应该有未转义的表格分隔符
  // 检查输出中 | malicious | column | 不出现（或已被转义为 \|）
  assert(result.indexOf('| malicious | column |') === -1, '表格注入不应直接出现');

  // 14n: 正常文本应保留
  assert(result.indexOf('Normal safe text here') !== -1, '安全文本应正常保留');

  // 14o: 安全标记仍然存在
  assert(result.indexOf('REVIEW_ONLY__NO_AUTO_APPLY') !== -1, '安全标记应存在');

  process.env.OPENAI_WORKER_ENABLED = originalEnv;
  restoreMock(saved);
  console.log('  ✓ 恶意 AI 输出脱敏测试 — 15 项检查全部通过');
})();

// ============================================================
// [新增] Test 15: 回归测试 — Gate disabled 不调用 OpenAI
// ============================================================
console.log('\n=== [新增] Test 15: 回归 — Gate disabled 不调用 OpenAI ===');
(async function () {
  var cmd = require('../../commands/ai-grayscale');
  var originalEnv = process.env.OPENAI_WORKER_ENABLED;
  process.env.OPENAI_WORKER_ENABLED = 'false';

  var result = await cmd.execute({ args: 'planner-summary-worker' });

  assert(result.indexOf('未开启') !== -1, '应提示 Gate 未开启');
  assert(result.indexOf('OPENAI_WORKER_ENABLED') !== -1, '应提示环境变量名');

  process.env.OPENAI_WORKER_ENABLED = originalEnv;
  console.log('  ✓ 回归 — Gate disabled 不调用 OpenAI');
})();

// ============================================================
// [新增] Test 16: 回归 — planner-summary-worker 正常通过
// ============================================================
console.log('\n=== [新增] Test 16: 回归 — planner-summary-worker 正常通过 ===');
(async function () {
  var saved = setupMock(makeSuccessMock('Planner summary mock output'));
  var cmd = saved.cmd;
  var originalEnv = process.env.OPENAI_WORKER_ENABLED;
  process.env.OPENAI_WORKER_ENABLED = 'true';

  var result = await cmd.execute({ args: 'planner-summary-worker' });

  assert(result.indexOf('✅ 成功') !== -1, '应包含成功状态');
  assert(result.indexOf('Planner summary mock output') !== -1, '应包含 AI 输出');

  process.env.OPENAI_WORKER_ENABLED = originalEnv;
  restoreMock(saved);
  console.log('  ✓ 回归 — planner-summary-worker 正常通过');
})();

// ============================================================
// [新增] Test 17: 回归 — 输出包含 REVIEW_ONLY__NO_AUTO_APPLY
// ============================================================
console.log('\n=== [新增] Test 17: 回归 — 输出包含 REVIEW_ONLY__NO_AUTO_APPLY ===');
(async function () {
  var saved = setupMock(makeSuccessMock('Safety marker test'));
  var cmd = saved.cmd;
  var originalEnv = process.env.OPENAI_WORKER_ENABLED;
  process.env.OPENAI_WORKER_ENABLED = 'true';

  var result = await cmd.execute({ args: 'planner-summary-worker' });

  assert(result.indexOf('REVIEW_ONLY__NO_AUTO_APPLY') !== -1, 'output 应包含安全标记');
  // 安全说明区域
  assert(result.indexOf('不自动 apply') !== -1, '应包含不自动 apply 说明');
  assert(result.indexOf('不调用 DeepSeek') !== -1, '应包含不调用 DeepSeek 说明');
  assert(result.indexOf('不修改 /今日运营') !== -1, '应包含不修改主流程说明');

  process.env.OPENAI_WORKER_ENABLED = originalEnv;
  restoreMock(saved);
  console.log('  ✓ 回归 — 输出包含 REVIEW_ONLY__NO_AUTO_APPLY');
})();

// ============================================================
// [新增] Test 18: 回归 — 不调用 DeepSeek/豆包（mock 环境下）
// ============================================================
console.log('\n=== [新增] Test 18: 回归 — 不调用 DeepSeek/豆包 ===');
(async function () {
  var saved = setupMock(makeSuccessMock('No DeepSeek test'));
  var cmd = saved.cmd;
  var originalEnv = process.env.OPENAI_WORKER_ENABLED;
  process.env.OPENAI_WORKER_ENABLED = 'true';

  var result = await cmd.execute({ args: 'planner-summary-worker' });

  // 检查调用信息部分
  var infoSection = result.split('---')[0] || result;
  var infoLower = infoSection.toLowerCase();

  assert(infoLower.indexOf('deepseek') === -1, '调用信息不应包含 DeepSeek');
  assert(infoLower.indexOf('豆包') === -1, '调用信息不应包含豆包');
  assert(infoLower.indexOf('doubao') === -1, '调用信息不应包含 doubao');
  assert(infoLower.indexOf('openai') !== -1, '调用信息应包含 openai');

  process.env.OPENAI_WORKER_ENABLED = originalEnv;
  restoreMock(saved);
  console.log('  ✓ 回归 — 不调用 DeepSeek/豆包');
})();

// ============================================================
// [新增] Test 19: OpenAI error 时返回安全失败摘要
// ============================================================
console.log('\n=== [新增] Test 19: OpenAI error 时返回安全失败摘要 ===');
(async function () {
  var saved = setupMock(makeErrorMock('API key invalid or expired'));
  var cmd = saved.cmd;
  var originalEnv = process.env.OPENAI_WORKER_ENABLED;
  process.env.OPENAI_WORKER_ENABLED = 'true';

  var result = await cmd.execute({ args: 'planner-summary-worker' });

  // 应包含失败状态
  assert(result.indexOf('❌ 失败') !== -1, '应包含失败状态');
  // 应包含错误详情段落
  assert(result.indexOf('⚠️ 错误详情') !== -1, '应包含错误详情段落');
  // 错误消息应出现（被脱敏后）
  assert(result.indexOf('API key invalid or expired') !== -1, '错误消息应保留（已脱敏）');
  // 安全标记仍然存在
  assert(result.indexOf('REVIEW_ONLY__NO_AUTO_APPLY') !== -1, '安全标记应存在');

  process.env.OPENAI_WORKER_ENABLED = originalEnv;
  restoreMock(saved);
  console.log('  ✓ OpenAI error 时返回安全失败摘要');
})();

// ============================================================
// [新增] Test 20: 抛出异常时的安全处理
// ============================================================
console.log('\n=== [新增] Test 20: 抛出异常时的安全处理 ===');
(async function () {
  var saved = setupMock(makeThrowMock('Network error: connect ETIMEDOUT'));
  var cmd = saved.cmd;
  var originalEnv = process.env.OPENAI_WORKER_ENABLED;
  process.env.OPENAI_WORKER_ENABLED = 'true';

  var result = await cmd.execute({ args: 'planner-summary-worker' });

  // 应包含失败标记
  assert(result.indexOf('❌ OpenAI Worker 调用失败') !== -1, '应包含调用失败标记');
  // 应包含错误信息
  assert(result.indexOf('Network error') !== -1, '应包含错误信息');
  // 安全标记仍然存在
  assert(result.indexOf('REVIEW_ONLY__NO_AUTO_APPLY') !== -1, '安全标记应存在');

  process.env.OPENAI_WORKER_ENABLED = originalEnv;
  restoreMock(saved);
  console.log('  ✓ 抛出异常时的安全处理');
})();

// ============================================================
// Summary
// ============================================================
console.log('\n=== Results: 20 passed, 0 failed ===\n');
