'use strict';

/**
 * test-runtime-guardrails.js
 * AI Runtime PR Guardrails 完整测试套件
 *
 * 覆盖：
 *   Part A: sanitize-output.js
 *     A1. sk- API key 脱敏
 *     A2. Bearer token 脱敏
 *     A3. Authorization header 脱敏
 *     A4. Cookie header 脱敏
 *     A5. token=/key=/secret=/password= 键值对脱敏
 *     A6. Windows/Linux 路径脱敏
 *     A7. .env 路径脱敏
 *     A8. null/undefined/非字符串安全处理
 *     A9. 混合输入综合脱敏
 *
 *   Part B: markdown-safe.js
 *     B1. 管道符转义 (表格注入防御)
 *     B2. 代码围栏替换
 *     B3. 完整 sanitizeOutput 管线
 *     B4. 截断功能
 *     B5. null/undefined 安全处理
 *
 *   Part C: command-args.js
 *     C1. args 参数优先
 *     C2. ctx.args 回退
 *     C3. ctx 为 null/undefined
 *     C4. args 为空字符串
 *     C5. args 为 undefined
 *
 *   Part D: async-worker-result.js
 *     D1. normalizeWorkerResult 正常值
 *     D2. normalizeWorkerResult 错误值
 *     D3. normalizeWorkerResult null/undefined
 *     D4. normalizeWorkerResult 被安全层拒绝
 *     D5. assertReviewOnly 通过
 *     D6. assertReviewOnly 失败
 *     D7. assertReviewOnly 空输入
 *     D8. assertNoDangerousActions 安全文本
 *     D9. assertNoDangerousActions apply 拦截
 *     D10. assertNoDangerousActions deploy 拦截
 *     D11. assertNoDangerousActions rollback 拦截
 *     D12. assertNoDangerousActions 中文拦截
 *     D13. assertNoDangerousActions 多重违规
 *     D14. assertNoDangerousActions 空输入
 *
 *   Part E: 集成测试
 *     E1. 模块导出完整性
 *     E2. REVIEW_ONLY__NO_AUTO_APPLY 不被误伤
 */

var assert = require('assert');

var guard = require('../../orchestrator/security');

// ============================================================
// Part A: sanitize-output.js — redactSensitive
// ============================================================

console.log('\n=== Part A: sanitize-output.js — redactSensitive ===');

// A1: sk- API key 脱敏
(function () {
  var r1 = guard.redactSensitive('My key is sk-proj-abc123def456ghi789jkl');
  assert(r1.indexOf('sk-proj-abc') === -1, 'A1a: sk- key 原文不应出现');
  assert(r1.indexOf('[MASKED_API_KEY]') !== -1, 'A1b: 应包含脱敏占位符');

  var r2 = guard.redactSensitive('sk-1234567890abcdef in middle of text');
  assert(r2.indexOf('sk-1234') === -1, 'A1c: 短 sk- key 也应被脱敏（>=10 chars）');

  var r3 = guard.redactSensitive('sk-short'); // < 10 chars → 不匹配
  assert(r3.indexOf('sk-short') !== -1, 'A1d: 短于 10 字符的 sk- 前缀不应被脱敏');

  console.log('  ✓ A1: sk- API key 脱敏');
})();

// A2: Bearer token 脱敏
// 注意: Authorization: Bearer xxx → 先 Bearer脱敏 → Authorization: Bearer [MASKED]
//       → 再 Authorization脱敏整行 → Authorization: [MASKED]
//       最终 Bearer [MASKED] 可能被 Authorization 模式吸收
(function () {
  var r = guard.redactSensitive('Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xxxxx');
  assert(r.indexOf('eyJhbGci') === -1, 'A2a: JWT token 原文不应出现');
  var hasAuthOrBearer = r.indexOf('Authorization: [MASKED]') !== -1 || r.indexOf('Bearer [MASKED]') !== -1;
  assert(hasAuthOrBearer, 'A2b: 应包含 Authorization 或 Bearer 脱敏占位符');

  console.log('  ✓ A2: Bearer token 脱敏');
})();

// A3: Authorization header 脱敏
(function () {
  var r = guard.redactSensitive('Authorization: my-secret-token-12345');
  assert(r.indexOf('my-secret-token') === -1, 'A3a: Authorization 值不应泄露');
  assert(r.indexOf('Authorization: [MASKED]') !== -1, 'A3b: Authorization 应被脱敏');

  console.log('  ✓ A3: Authorization header 脱敏');
})();

// A4: Cookie header 脱敏
(function () {
  var r = guard.redactSensitive('Cookie: session=abc123def456; user=admin');
  assert(r.indexOf('abc123def456') === -1, 'A4a: Cookie session 值不应泄露');
  assert(r.indexOf('Cookie: [MASKED]') !== -1, 'A4b: Cookie 应被脱敏');

  console.log('  ✓ A4: Cookie header 脱敏');
})();

// A5: token=/key=/secret=/password= 键值对脱敏
(function () {
  var r = guard.redactSensitive(
    'Params: token=abc123def, key=mykey456, secret=s3cr3t!, password=p@ssw0rd'
  );

  assert(r.indexOf('abc123def') === -1, 'A5a: token 值不应泄露');
  assert(r.indexOf('token=[MASKED]') !== -1, 'A5b: token= 应被脱敏');

  assert(r.indexOf('mykey456') === -1, 'A5c: key 值不应泄露');
  assert(r.indexOf('key=[MASKED]') !== -1, 'A5d: key= 应被脱敏');

  assert(r.indexOf('s3cr3t') === -1, 'A5e: secret 值不应泄露');
  assert(r.indexOf('secret=[MASKED]') !== -1, 'A5f: secret= 应被脱敏');

  assert(r.indexOf('p@ssw0rd') === -1, 'A5g: password 值不应泄露');
  assert(r.indexOf('password=[MASKED]') !== -1, 'A5h: password= 应被脱敏');

  console.log('  ✓ A5: token=/key=/secret=/password= 键值对脱敏');
})();

// A6: Windows/Linux 路径脱敏
(function () {
  var rW = guard.redactSensitive('File at C:\\Users\\haoji\\Documents\\secret.txt');
  assert(rW.indexOf('C:\\Users\\haoji') === -1, 'A6a: Windows Users 路径不应泄露');
  assert(rW.indexOf('[MASKED_PATH]') !== -1, 'A6b: Windows 路径应被脱敏');

  var rL = guard.redactSensitive('Config: /opt/wecom-openclaw/config.json');
  assert(rL.indexOf('/opt/wecom-openclaw') === -1, 'A6c: Linux /opt 路径不应泄露');
  assert(rL.indexOf('[MASKED_PATH]') !== -1, 'A6d: Linux 路径应被脱敏');

  var rHome = guard.redactSensitive('Log: /home/admin/app.log');
  assert(rHome.indexOf('/home/admin') === -1, 'A6e: Linux /home 路径不应泄露');

  var rEtc = guard.redactSensitive('File: /etc/nginx/nginx.conf');
  assert(rEtc.indexOf('/etc/nginx') === -1, 'A6f: Linux /etc 路径不应泄露');

  console.log('  ✓ A6: Windows/Linux 路径脱敏');
})();

// A7: .env 路径脱敏
(function () {
  var r1 = guard.redactSensitive('C:\\Users\\haoji\\.env file');
  assert(r1.indexOf('.env') === -1, 'A7a: Windows .env 路径不应泄露');

  var r2 = guard.redactSensitive('/opt/app/.env');
  assert(r2.indexOf('.env') === -1, 'A7b: Linux .env 路径不应泄露');

  var r3 = guard.redactSensitive('just the word .env here');
  assert(r3.indexOf('.env') === -1, 'A7c: 独立的 .env 也应被脱敏');

  console.log('  ✓ A7: .env 路径脱敏');
})();

// A8: null/undefined/非字符串安全处理
(function () {
  assert.strictEqual(guard.redactSensitive(null), '', 'A8a: null → ""');
  assert.strictEqual(guard.redactSensitive(undefined), '', 'A8b: undefined → ""');
  assert.strictEqual(typeof guard.redactSensitive(42), 'string', 'A8c: 数字 → string');
  assert.strictEqual(guard.redactSensitive(42), '42', 'A8d: 数字内容不变');

  // 对象转 String() 得到 "[object Object]"，不触发脱敏
  // 这是预期行为：redactSensitive 不序列化对象
  var rObj = guard.redactSensitive({ key: 'sk-abc123' });
  assert(rObj.indexOf('[object Object]') !== -1, 'A8e: 对象不序列化，返回 [object Object]');

  console.log('  ✓ A8: null/undefined/非字符串安全处理');
})();

// A9: 混合输入综合脱敏
(function () {
  var mixed = [
    'API: sk-proj-xyz999888777666',
    'Bearer token-abcdefg12345',
    'Cookie: sid=secret123456',
    '/home/user/config/.env',
    'Normal safe text',
  ].join('\n');

  var r = guard.redactSensitive(mixed);

  assert(r.indexOf('sk-proj-xyz') === -1, 'A9a: API key');
  assert(r.indexOf('token-abcdefg') === -1, 'A9b: Bearer token');
  assert(r.indexOf('secret123456') === -1, 'A9c: Cookie session');
  assert(r.indexOf('/home/user') === -1, 'A9d: Linux path');
  assert(r.indexOf('[MASKED_API_KEY]') !== -1, 'A9e: 脱敏占位符存在');
  assert(r.indexOf('Normal safe text') !== -1, 'A9f: 安全文本保留');

  console.log('  ✓ A9: 混合输入综合脱敏');
})();

// ============================================================
// Part B: markdown-safe.js
// ============================================================

console.log('\n=== Part B: markdown-safe.js ===');

// B1: 管道符转义
(function () {
  var r = guard.escapeMarkdown('col1|col2|col3');
  assert(r.indexOf('col1\\|col2\\|col3') !== -1, 'B1a: 管道符应被转义');

  var r2 = guard.escapeMarkdown('normal text');
  assert.strictEqual(r2, 'normal text', 'B1b: 无管道符文本不变');

  console.log('  ✓ B1: 管道符转义');
})();

// B2: 代码围栏替换（sanitizeOutput 内部）
(function () {
  var r = guard.sanitizeOutput('some ```code``` here');
  assert(r.indexOf('```') === -1, 'B2a: 不应有原始 ```');
  var count = (r.match(/\[CODE_BLOCK\]/g) || []).length;
  assert(count === 2, 'B2b: 两个 ``` 应替换为两个 [CODE_BLOCK]');

  console.log('  ✓ B2: 代码围栏替换');
})();

// B3: 完整 sanitizeOutput 管线
(function () {
  var input = 'API key: sk-proj-abc123def456 | table cell | ```code```';
  var r = guard.sanitizeOutput(input);

  assert(r.indexOf('sk-proj-abc123def456') === -1, 'B3a: API key 脱敏');
  assert(r.indexOf('[MASKED_API_KEY]') !== -1, 'B3b: 脱敏占位符');
  assert(r.indexOf('|') === -1 || r.indexOf('\\|') !== -1, 'B3c: 管道符转义');
  assert(r.indexOf('```') === -1, 'B3d: 代码围栏替换');

  console.log('  ✓ B3: 完整 sanitizeOutput 管线');
})();

// B4: 截断功能
(function () {
  var text = '12345678901234567890'; // 20 chars
  var r = guard.truncateText(text, 15);
  assert(r.length <= 15 + '...(截断)'.length, 'B4a: 截断后长度正确');
  assert(r.indexOf('...(截断)') !== -1, 'B4b: 截断标记存在');

  var r2 = guard.truncateText(text, 100);
  assert.strictEqual(r2, text, 'B4c: 短文本不截断');

  console.log('  ✓ B4: 截断功能');
})();

// B5: null/undefined 安全处理
(function () {
  assert.strictEqual(guard.escapeMarkdown(null), '', 'B5a: escapeMarkdown null');
  assert.strictEqual(guard.escapeMarkdown(undefined), '', 'B5b: escapeMarkdown undefined');
  assert.strictEqual(guard.sanitizeField(null), '', 'B5c: sanitizeField null');
  assert.strictEqual(guard.sanitizeOutput(''), '', 'B5d: sanitizeOutput 空字符串');
  assert.strictEqual(guard.sanitizeOutput(null), '', 'B5e: sanitizeOutput null');
  assert.strictEqual(guard.truncateText('', 10), '', 'B5f: truncateText 空字符串');
  assert.strictEqual(guard.truncateText(null, 10), '', 'B5g: truncateText null');

  console.log('  ✓ B5: null/undefined 安全处理');
})();

// ============================================================
// Part C: command-args.js — normalizeCommandArgs
// ============================================================

console.log('\n=== Part C: command-args.js — normalizeCommandArgs ===');

// C1: args 参数优先
(function () {
  var r = guard.normalizeCommandArgs({ args: 'from-ctx' }, 'from-args');
  assert.strictEqual(r.args, 'from-args', 'C1a: args 参数优先');
  assert.strictEqual(r.argStr, 'from-args', 'C1b: argStr 一致');
  assert.deepStrictEqual(r.ctx, { args: 'from-ctx' }, 'C1c: ctx 不变');

  console.log('  ✓ C1: args 参数优先');
})();

// C2: ctx.args 回退
(function () {
  var r = guard.normalizeCommandArgs({ args: 'from-ctx' });
  assert.strictEqual(r.args, 'from-ctx', 'C2a: 回退到 ctx.args');
  assert.strictEqual(r.argStr, 'from-ctx', 'C2b: argStr 一致');

  console.log('  ✓ C2: ctx.args 回退');
})();

// C3: ctx 为 null/undefined
(function () {
  var r1 = guard.normalizeCommandArgs(null, 'planner-summary-worker');
  assert.deepStrictEqual(r1.ctx, {}, 'C3a: null ctx → {}');
  assert.strictEqual(r1.args, 'planner-summary-worker', 'C3b: null ctx 仍使用 args');

  var r2 = guard.normalizeCommandArgs(undefined, 'planner-summary-worker');
  assert.deepStrictEqual(r2.ctx, {}, 'C3c: undefined ctx → {}');

  console.log('  ✓ C3: ctx 为 null/undefined 安全处理');
})();

// C4: args 为空字符串
(function () {
  var r = guard.normalizeCommandArgs({}, '');
  assert.strictEqual(r.args, '', 'C4a: 空字符串 args');
  assert.strictEqual(r.argStr, '', 'C4b: 空字符串 argStr');

  var r2 = guard.normalizeCommandArgs({ args: '' }, undefined);
  assert.strictEqual(r2.args, '', 'C4c: args=undefined 回退 ctx.args=""');

  console.log('  ✓ C4: args 为空字符串');
})();

// C5: args 为 undefined
(function () {
  var r = guard.normalizeCommandArgs({ args: 'from-ctx' }, undefined);
  assert.strictEqual(r.args, 'from-ctx', 'C5a: args=undefined 回退 ctx.args');

  var r2 = guard.normalizeCommandArgs({}, undefined);
  assert.strictEqual(r2.args, '', 'C5b: ctx.args=undefined → ""');

  console.log('  ✓ C5: args 为 undefined 回退');
})();

// ============================================================
// Part D: async-worker-result.js
// ============================================================

console.log('\n=== Part D: async-worker-result.js ===');

// D1: normalizeWorkerResult 正常值（模拟 openai-worker 返回）
(function () {
  var input = {
    outputText: 'Hello from AI',
    error: '',
    model: 'gpt-4o',
    safetyNote: 'REVIEW_ONLY__NO_AUTO_APPLY',
    taskId: 'task-001',
    promptHash: 'abc123def456',
    createdAt: '2026-05-25T10:00:00.000Z',
  };
  var r = guard.normalizeWorkerResult(input);

  assert.strictEqual(r.outputText, 'Hello from AI', 'D1a: outputText');
  assert.strictEqual(r.error, '', 'D1b: error 空字符串');
  assert.strictEqual(r.model, 'gpt-4o', 'D1c: model');
  assert.strictEqual(r.hasError, false, 'D1d: hasError = false');
  assert.strictEqual(r.safetyNote, 'REVIEW_ONLY__NO_AUTO_APPLY', 'D1e: safetyNote');
  assert.strictEqual(r.taskId, 'task-001', 'D1f: taskId');
  assert.strictEqual(r.promptHash, 'abc123def456', 'D1g: promptHash');
  assert.strictEqual(r.isRejected, false, 'D1h: isRejected = false');

  console.log('  ✓ D1: normalizeWorkerResult 正常值');
})();

// D2: normalizeWorkerResult 错误值
(function () {
  var input = {
    outputText: '',
    error: 'API key invalid',
    model: 'gpt-4o',
    safetyNote: 'ERROR__NO_OUTPUT',
    taskId: 'task-002',
    promptHash: 'xyz789',
    createdAt: '2026-05-25T10:01:00.000Z',
  };
  var r = guard.normalizeWorkerResult(input);

  assert.strictEqual(r.outputText, '', 'D2a: outputText 空');
  assert.strictEqual(r.error, 'API key invalid', 'D2b: error');
  assert.strictEqual(r.hasError, true, 'D2c: hasError = true');
  assert.strictEqual(r.safetyNote, 'ERROR__NO_OUTPUT', 'D2d: safetyNote');
  assert.strictEqual(r.isRejected, false, 'D2e: isRejected = false (ERROR__NO_OUTPUT 不是 REJECTED__)');

  console.log('  ✓ D2: normalizeWorkerResult 错误值');
})();

// D3: normalizeWorkerResult null/undefined
(function () {
  var r1 = guard.normalizeWorkerResult(null);
  assert.strictEqual(r1.outputText, '', 'D3a: null → 空 outputText');
  assert.strictEqual(r1.hasError, false, 'D3b: null → hasError=false');

  var r2 = guard.normalizeWorkerResult(undefined);
  assert.strictEqual(r2.model, 'unknown', 'D3c: undefined → model=unknown');

  var r3 = guard.normalizeWorkerResult({});
  assert.strictEqual(r3.outputText, '', 'D3d: {} → 空 outputText');
  assert.strictEqual(r3.hasError, false, 'D3e: {} → hasError=false');
  assert.strictEqual(r3.model, 'unknown', 'D3f: {} → model=unknown');

  console.log('  ✓ D3: normalizeWorkerResult null/undefined');
})();

// D4: normalizeWorkerResult 被安全层拒绝
(function () {
  var input = {
    outputText: '',
    error: 'HARD_CONSTRAINT: 永不自动 apply patch',
    model: 'gpt-4o',
    safetyNote: 'REJECTED__SAFETY_LAYER: blocked',
    taskId: 'task-003',
    promptHash: 'rej001',
    createdAt: '2026-05-25T10:02:00.000Z',
  };
  var r = guard.normalizeWorkerResult(input);

  assert.strictEqual(r.hasError, true, 'D4a: hasError = true');
  assert.strictEqual(r.isRejected, true, 'D4b: isRejected = true (REJECTED__ in safetyNote)');

  console.log('  ✓ D4: normalizeWorkerResult 被安全层拒绝');
})();

// D5: assertReviewOnly 通过
(function () {
  var r = guard.assertReviewOnly('REVIEW_ONLY__NO_AUTO_APPLY — 安全输出');
  assert.strictEqual(r.valid, true, 'D5a: 包含标记 → valid=true');

  console.log('  ✓ D5: assertReviewOnly 通过');
})();

// D6: assertReviewOnly 失败
(function () {
  var r = guard.assertReviewOnly('Some output without safety marker');
  assert.strictEqual(r.valid, false, 'D6a: 缺少标记 → valid=false');
  assert(r.reason.indexOf('REVIEW_ONLY__NO_AUTO_APPLY') !== -1, 'D6b: reason 包含缺失标记名');

  console.log('  ✓ D6: assertReviewOnly 失败');
})();

// D7: assertReviewOnly 空输入
(function () {
  var r1 = guard.assertReviewOnly('');
  assert.strictEqual(r1.valid, false, 'D7a: 空字符串 → invalid');

  var r2 = guard.assertReviewOnly(null);
  assert.strictEqual(r2.valid, false, 'D7b: null → invalid');

  var r3 = guard.assertReviewOnly(undefined);
  assert.strictEqual(r3.valid, false, 'D7c: undefined → invalid');

  console.log('  ✓ D7: assertReviewOnly 空输入');
})();

// D8: assertNoDangerousActions 安全文本
(function () {
  var r = guard.assertNoDangerousActions('This is a safe review summary about GMV trends.');
  assert.strictEqual(r.safe, true, 'D8a: 安全文本 → safe=true');
  assert.strictEqual(r.violations.length, 0, 'D8b: 无违规');

  console.log('  ✓ D8: assertNoDangerousActions 安全文本');
})();

// D9: assertNoDangerousActions apply 拦截
(function () {
  var r = guard.assertNoDangerousActions('I will apply_patch to fix the bug');
  assert.strictEqual(r.safe, false, 'D9a: apply_patch → unsafe');
  assert(r.violations.indexOf('apply_patch') !== -1, 'D9b: violations 包含 apply_patch');

  console.log('  ✓ D9: assertNoDangerousActions apply 拦截');
})();

// D10: assertNoDangerousActions deploy 拦截
(function () {
  var r = guard.assertNoDangerousActions('auto_deploy to production now');
  assert.strictEqual(r.safe, false, 'D10a: auto_deploy → unsafe');
  assert(r.violations.indexOf('auto_deploy') !== -1, 'D10b: violations 包含 auto_deploy');

  console.log('  ✓ D10: assertNoDangerousActions deploy 拦截');
})();

// D11: assertNoDangerousActions rollback 拦截
(function () {
  var r = guard.assertNoDangerousActions('Need to rollback_production immediately');
  assert.strictEqual(r.safe, false, 'D11a: rollback_production → unsafe');
  assert(r.violations.indexOf('rollback_production') !== -1, 'D11b: violations 包含 rollback_production');

  console.log('  ✓ D11: assertNoDangerousActions rollback 拦截');
})();

// D12: assertNoDangerousActions 中文拦截
(function () {
  var r = guard.assertNoDangerousActions('系统即将自动部署到生产环境');
  assert.strictEqual(r.safe, false, 'D12a: 自动部署 → unsafe');
  assert(r.violations.indexOf('自动部署') !== -1, 'D12b: violations 包含 自动部署');

  var r2 = guard.assertNoDangerousActions('需要修改nginx配置');
  assert.strictEqual(r2.safe, false, 'D12c: 修改nginx → unsafe');
  assert(r2.violations.indexOf('修改nginx') !== -1, 'D12d: violations 包含 修改nginx');

  var r3 = guard.assertNoDangerousActions('强制推送到 main 分支');
  assert.strictEqual(r3.safe, false, 'D12e: 强制推送 → unsafe');

  console.log('  ✓ D12: assertNoDangerousActions 中文拦截');
})();

// D13: assertNoDangerousActions 多重违规
(function () {
  var r = guard.assertNoDangerousActions(
    'Step 1: auto_apply the patch. Step 2: auto_deploy to prod. Step 3: modify_nginx.'
  );
  assert.strictEqual(r.safe, false, 'D13a: 多重违规 → unsafe');
  assert(r.violations.length >= 3, 'D13b: 应有至少 3 个 violations');

  console.log('  ✓ D13: assertNoDangerousActions 多重违规');
})();

// D14: assertNoDangerousActions 空输入
(function () {
  var r1 = guard.assertNoDangerousActions('');
  assert.strictEqual(r1.safe, true, 'D14a: 空字符串 → safe');
  assert.strictEqual(r1.violations.length, 0, 'D14b: 空 violations');

  var r2 = guard.assertNoDangerousActions(null);
  assert.strictEqual(r2.safe, true, 'D14c: null → safe');

  console.log('  ✓ D14: assertNoDangerousActions 空输入');
})();

// ============================================================
// Part E: 集成测试
// ============================================================

console.log('\n=== Part E: 集成测试 ===');

// E1: 模块导出完整性
(function () {
  assert.strictEqual(typeof guard.redactSensitive, 'function', 'E1a: redactSensitive');
  assert.strictEqual(typeof guard.escapeMarkdown, 'function', 'E1b: escapeMarkdown');
  assert.strictEqual(typeof guard.sanitizeField, 'function', 'E1c: sanitizeField');
  assert.strictEqual(typeof guard.sanitizeOutput, 'function', 'E1d: sanitizeOutput');
  assert.strictEqual(typeof guard.truncateText, 'function', 'E1e: truncateText');
  assert.strictEqual(typeof guard.normalizeCommandArgs, 'function', 'E1f: normalizeCommandArgs');
  assert.strictEqual(typeof guard.normalizeWorkerResult, 'function', 'E1g: normalizeWorkerResult');
  assert.strictEqual(typeof guard.assertReviewOnly, 'function', 'E1h: assertReviewOnly');
  assert.strictEqual(typeof guard.assertNoDangerousActions, 'function', 'E1i: assertNoDangerousActions');

  console.log('  ✓ E1: 模块导出完整性 (9/9)');
})();

// E2: REVIEW_ONLY__NO_AUTO_APPLY 不被误伤
// 确认脱敏和危险操作扫描不会误伤系统级安全标记
(function () {
  var marker = 'REVIEW_ONLY__NO_AUTO_APPLY';

  var r1 = guard.redactSensitive(marker);
  assert.strictEqual(r1, marker, 'E2a: redactSensitive 不误伤安全标记');

  var r2 = guard.sanitizeOutput(marker);
  assert(r2.indexOf(marker) !== -1, 'E2b: sanitizeOutput 保留安全标记');

  var r3 = guard.assertReviewOnly(marker);
  assert.strictEqual(r3.valid, true, 'E2c: assertReviewOnly 识别安全标记');

  var r4 = guard.assertNoDangerousActions('This output is ' + marker + ', safe to review');
  assert.strictEqual(r4.safe, true, 'E2d: assertNoDangerousActions 不误伤安全标记');

  console.log('  ✓ E2: REVIEW_ONLY__NO_AUTO_APPLY 不被误伤');
})();

// ============================================================
// Summary
// ============================================================
console.log('\n=== Results: all guardrail tests passed ===\n');
