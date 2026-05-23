'use strict';

/**
 * 补丁管理器测试套件
 * 覆盖: 审计 / 应用 / 回滚 / 历史 / 边界 / 回归
 */

const path = require('path');

// 设置测试环境
process.env.PROJECT_ROOT = path.join(__dirname, '..', '..', '..', '..', '..');
process.env.PATCH_DIR = path.join(process.env.PROJECT_ROOT, 'storage', 'test-patches');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
  } catch (e) {
    failed++;
    console.error('  FAIL: ' + name);
    console.error('        ' + e.message);
  }
}

function assertEqual(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(
      (msg || 'assertEqual') +
        ': expected ' +
        JSON.stringify(expected) +
        ', got ' +
        JSON.stringify(actual)
    );
  }
}

function assertOk(val, msg) {
  if (!val) {
    throw new Error((msg || 'assertOk') + ': expected truthy, got ' + JSON.stringify(val));
  }
}

// ─── 载入模块 ────────────────────────────────────────────────

const patchManager = require('../lib/patch-manager');

// ─── Mock 环境 ────────────────────────────────────────────────

const opts = { mock: true };

// ─── 测试数据 ──────────────────────────────────────────────────

const SAFE_DIFF =
  'diff --git a/apps/wecom-adapter/src/commands/risk-alert.js b/apps/wecom-adapter/src/commands/risk-alert.js\n' +
  'index abc123..def456 100644\n' +
  '--- a/apps/wecom-adapter/src/commands/risk-alert.js\n' +
  '+++ b/apps/wecom-adapter/src/commands/risk-alert.js\n' +
  '@@ -1,5 +1,6 @@\n' +
  " 'use strict';\n" +
  '+// v1.1: added new threshold\n' +
  ' module.exports = { execute: function() {} };\n';

const ENV_DIFF =
  'diff --git a/.env b/.env\n' +
  'index abc123..def456 100644\n' +
  '--- a/.env\n' +
  '+++ b/.env\n' +
  '@@ -1,3 +1,4 @@\n' +
  ' WECOM_SECRET=old\n' +
  '+WECOM_SECRET=new_secret_here\n' +
  ' WECOM_CORP_ID=xxx\n';

const MULTI_FILE_DIFF =
  'diff --git a/apps/wecom-adapter/src/commands/risk-alert.js b/apps/wecom-adapter/src/commands/risk-alert.js\n' +
  'index abc123..def456 100644\n' +
  '--- a/apps/wecom-adapter/src/commands/risk-alert.js\n' +
  '+++ b/apps/wecom-adapter/src/commands/risk-alert.js\n' +
  '@@ -1,5 +1,6 @@\n' +
  " 'use strict';\n" +
  '+// v1.1\n' +
  ' module.exports = {};\n' +
  'diff --git a/apps/wecom-adapter/src/commands/activity.js b/apps/wecom-adapter/src/commands/activity.js\n' +
  'index aaa111..bbb222 100644\n' +
  '--- a/apps/wecom-adapter/src/commands/activity.js\n' +
  '+++ b/apps/wecom-adapter/src/commands/activity.js\n' +
  '@@ -1,3 +1,4 @@\n' +
  " 'use strict';\n" +
  '+// added feature\n' +
  ' module.exports = {};\n';

const NGINX_DIFF =
  'diff --git a/www/server/panel/vhost/nginx/api.yudong.shop.conf b/www/server/panel/vhost/nginx/api.yudong.shop.conf\n' +
  'index abc..def\n' +
  '--- a/www/server/panel/vhost/nginx/api.yudong.shop.conf\n' +
  '+++ b/www/server/panel/vhost/nginx/api.yudong.shop.conf\n' +
  '@@ -1,3 +1,4 @@\n' +
  ' server {\n' +
  '+  listen 80;\n' +
  ' }\n';

const DEPLOY_DIFF =
  'diff --git a/deploy/deploy.sh b/deploy/deploy.sh\n' +
  'index abc..def\n' +
  '--- a/deploy/deploy.sh\n' +
  '+++ b/deploy/deploy.sh\n' +
  '@@ -1,3 +1,4 @@\n' +
  ' #!/bin/bash\n' +
  '+echo "deploying"\n' +
  ' pm2 restart wecom-adapter\n';

const EMPTY_DIFF = '';

const NO_FILE_DIFF =
  'diff --git a/ b/\n' +
  'index 000..000\n' +
  '--- a/\n' +
  '+++ b/\n';

// ─── 测试组 1: extractFiles ────────────────────────────────────

console.log('\n=== 1. extractFiles ===');

test('提取单个文件', () => {
  const files = patchManager.extractFiles(SAFE_DIFF);
  assertEqual(files.length, 1);
  assertEqual(files[0], 'apps/wecom-adapter/src/commands/risk-alert.js');
});

test('提取多个文件', () => {
  const files = patchManager.extractFiles(MULTI_FILE_DIFF);
  assertEqual(files.length, 2);
  assertOk(files.includes('apps/wecom-adapter/src/commands/risk-alert.js'));
  assertOk(files.includes('apps/wecom-adapter/src/commands/activity.js'));
});

test('提取 .env 文件', () => {
  const files = patchManager.extractFiles(ENV_DIFF);
  assertEqual(files[0], '.env');
});

test('提取 nginx 文件', () => {
  const files = patchManager.extractFiles(NGINX_DIFF);
  assertOk(files[0].includes('nginx'));
});

test('空 diff 返回空数组', () => {
  const files = patchManager.extractFiles(EMPTY_DIFF);
  assertEqual(files.length, 0);
});

test('无 ---/+++ 的 diff 返回空数组', () => {
  const files = patchManager.extractFiles('just some text');
  assertEqual(files.length, 0);
});

// ─── 测试组 2: audit ──────────────────────────────────────────

console.log('\n=== 2. audit ===');

test('安全补丁审计通过', () => {
  const result = patchManager.audit(SAFE_DIFF);
  assertEqual(result.safe, true, 'safe should be true');
  assertEqual(result.files.length, 1);
  assertOk(result.riskScore < 40, 'riskScore should be low');
});

test('.env 补丁审计拒绝', () => {
  const result = patchManager.audit(ENV_DIFF);
  // .env=35 + no-test=25 = 60 → medium level but safe=false (forbiddenHits)
  assertEqual(result.safe, false, '.env should be rejected');
  assertEqual(result.level, 'medium');
  assertOk(result.forbiddenHits.includes('.env'));
});

test('nginx 补丁审计拒绝', () => {
  const result = patchManager.audit(NGINX_DIFF);
  // nginx=20 + no-test=25 = 45 → medium but safe=false
  assertEqual(result.safe, false, 'nginx should be rejected');
  assertOk(result.forbiddenHits.length > 0);
});

test('deploy 补丁审计拒绝', () => {
  const result = patchManager.audit(DEPLOY_DIFF);
  // deploy=20 + no-test=25 = 45 → medium level, safe=false
  assertEqual(result.safe, false, 'deploy should be rejected');
});

test('多文件审计 — 即使一个安全文件也会标记', () => {
  const result = patchManager.audit(MULTI_FILE_DIFF);
  assertEqual(result.files.length, 2);
  // 两个文件都是安全路径
  assertEqual(result.safe, true);
});

test('空内容审计返回高风险', () => {
  const result = patchManager.audit('');
  assertEqual(result.safe, false);
  assertEqual(result.riskScore, 100);
});

test('null 内容审计返回高风险', () => {
  const result = patchManager.audit(null);
  assertEqual(result.safe, false);
  assertEqual(result.riskScore, 100);
});

test('审计结果包含 summary', () => {
  const result = patchManager.audit(SAFE_DIFF);
  assertOk(result.summary.length > 0);
  assertOk(result.summary.includes('风险评分'));
});

test('审计结果包含 files, level, forbiddenHits', () => {
  const result = patchManager.audit(ENV_DIFF);
  assertOk(Array.isArray(result.files));
  assertOk(typeof result.level === 'string');
  assertOk(Array.isArray(result.forbiddenHits));
});

// ─── 测试组 3: apply (mock) ────────────────────────────────────

console.log('\n=== 3. apply (mock) ===');

test('安全补丁应用成功', () => {
  const result = patchManager.apply(SAFE_DIFF, 'test: safe patch', opts);
  assertEqual(result.status, 'applied');
  assertOk(result.patchId !== null);
  assertOk(result.patchId.startsWith('patch-'));
  assertOk(result.backupPath !== null);
});

test('高风险补丁被拒绝', () => {
  const result = patchManager.apply(ENV_DIFF, 'test: env patch', opts);
  assertEqual(result.status, 'rejected');
  assertEqual(result.patchId, null);
});

test('应用结果包含 message', () => {
  const result = patchManager.apply(SAFE_DIFF, 'test patch', opts);
  assertOk(result.message.includes('已应用'));
});

test('dryRun 模式标记为 dry-run', () => {
  const result = patchManager.apply(SAFE_DIFF, 'dry', { mock: true, dryRun: true });
  assertEqual(result.status, 'dry-run');
});

test('多次应用生成不同 ID', () => {
  const r1 = patchManager.apply(SAFE_DIFF, 'a', opts);
  const r2 = patchManager.apply(SAFE_DIFF, 'b', opts);
  assertOk(r1.patchId !== r2.patchId);
});

test('无描述时显示默认值', () => {
  const result = patchManager.apply(SAFE_DIFF, null, opts);
  assertEqual(result.status, 'applied');
});

// ─── 测试组 4: rollback (mock) ─────────────────────────────────

console.log('\n=== 4. rollback (mock) ===');

test('回滚已应用的补丁', () => {
  const applyResult = patchManager.apply(SAFE_DIFF, 'rollback test', opts);
  const rollbackResult = patchManager.rollback(applyResult.patchId, opts);
  assertEqual(rollbackResult.success, true);
  assertEqual(rollbackResult.patchId, applyResult.patchId);
});

test('回滚不存在的补丁 ID', () => {
  const result = patchManager.rollback('nonexistent-id', opts);
  assertEqual(result.success, false);
  assertOk(result.message.includes('未找到'));
});

test('回滚结果包含恢复文件列表', () => {
  const applyResult = patchManager.apply(SAFE_DIFF, 'files test', opts);
  const rollbackResult = patchManager.rollback(applyResult.patchId, opts);
  assertOk(Array.isArray(rollbackResult.restoredFiles));
  assertEqual(rollbackResult.restoredFiles.length, 1);
});

// ─── 测试组 5: getHistory ─────────────────────────────────────

console.log('\n=== 5. getHistory ===');

test('获取历史记录', () => {
  // 确保有记录
  patchManager.apply(SAFE_DIFF, 'history test 1', opts);
  patchManager.apply(SAFE_DIFF, 'history test 2', opts);

  const history = patchManager.getHistory(5, true);
  assertOk(history.total >= 2);
  assertOk(history.patches.length > 0);
  assertOk(history.patches[0].patchId);
  assertOk(history.patches[0].timestamp);
});

test('限制返回条数', () => {
  const history = patchManager.getHistory(2, true);
  assertOk(history.patches.length <= 2);
});

test('历史记录包含必要字段', () => {
  patchManager.apply(SAFE_DIFF, 'field test', opts);
  const history = patchManager.getHistory(1, true);
  const p = history.patches[0];
  assertOk('patchId' in p);
  assertOk('timestamp' in p);
  assertOk('description' in p);
  assertOk('files' in p);
  assertOk('riskScore' in p);
  assertOk('level' in p);
  assertOk('status' in p);
});

// ─── 测试组 6: 命令处理器 ─────────────────────────────────────

console.log('\n=== 6. 命令处理器 ===');

// 需要 mock fs 来测试命令处理器
// 因为 patch.js 用 fs.readFileSync 读取文件，需要实际文件
// 这里测试命令处理器的帮助和其他非文件操作

const patchCmd = require('./patch');

test('命令有 execute 和 desc', () => {
  assertOk(typeof patchCmd.execute === 'function');
  assertOk(typeof patchCmd.desc === 'string');
});

test('无参数返回帮助', async () => {
  const result = await patchCmd.execute({ mock: true }, '');
  assertOk(result.includes('补丁管理器'));
  assertOk(result.includes('审计'));
  assertOk(result.includes('应用'));
});

test('帮助模式', async () => {
  const result = await patchCmd.execute({ mock: true }, '');
  assertOk(result.includes('回滚'));
  assertOk(result.includes('历史'));
});

test('未知子命令返回错误', async () => {
  const result = await patchCmd.execute({ mock: true }, '未知子命令');
  assertOk(result.includes('未知子命令'));
});

test('审计无文件路径返回提示', async () => {
  const result = await patchCmd.execute({ mock: true }, '审计');
  assertOk(result.includes('请指定补丁文件路径'));
});

test('应用无文件路径返回提示', async () => {
  const result = await patchCmd.execute({ mock: true }, '应用');
  assertOk(result.includes('请指定补丁文件路径'));
});

test('回滚无 ID 返回提示', async () => {
  const result = await patchCmd.execute({ mock: true }, '回滚');
  assertOk(result.includes('请指定补丁 ID'));
});

test('历史无记录', async () => {
  const result = await patchCmd.execute({ mock: true }, '历史');
  assertOk(result.includes('暂无补丁记录') || result.includes('补丁历史'));
});

// ─── 测试组 7: 边界情况 ───────────────────────────────────────

console.log('\n=== 7. 边界情况 ===');

test('generatePatchId 生成唯一 ID', () => {
  const ids = new Set();
  for (let i = 0; i < 50; i++) {
    ids.add(patchManager.generatePatchId());
  }
  assertEqual(ids.size, 50, '50 个 ID 应该全不同');
});

test('补丁 ID 格式正确', () => {
  const id = patchManager.generatePatchId();
  assertOk(id.startsWith('patch-'));
  assertOk(id.length > 20);
});

// ─── 测试组 8: 回归 — command-center REGISTRY ─────────────────

console.log('\n=== 8. 回归 — command-center ===');

test('REGISTRY 包含 /补丁', () => {
  const cc = require('../lib/command-center');
  assertOk('/补丁' in cc.REGISTRY);
});

test('REGISTRY 别名包含 /patch', () => {
  const cc = require('../lib/command-center');
  assertOk(cc.REGISTRY['/补丁'].aliases.includes('/patch'));
});

test('REGISTRY 别名包含 /补丁管理', () => {
  const cc = require('../lib/command-center');
  assertOk(cc.REGISTRY['/补丁'].aliases.includes('/补丁管理'));
});

test('resolve("/补丁") 返回 handler', () => {
  const cc = require('../lib/command-center');
  const result = cc.resolve('/补丁');
  assertOk(result !== null);
  assertOk(typeof result.handler === 'function');
});

test('resolve("/patch") 返回 handler (别名)', () => {
  const cc = require('../lib/command-center');
  const result = cc.resolve('/patch');
  assertOk(result !== null);
  assertOk(typeof result.handler === 'function');
});

test('resolve("/补丁 历史") 返回 handler + args', () => {
  const cc = require('../lib/command-center');
  const result = cc.resolve('/补丁 历史');
  assertOk(result !== null);
  assertEqual(result.args, '历史');
});

test('REGISTRY 总数 = 20', () => {
  const cc = require('../lib/command-center');
  assertEqual(Object.keys(cc.REGISTRY).length, 20);
});

// ─── 测试组 9: mock 模式集成 ───────────────────────────────────

console.log('\n=== 9. mock 模式集成 ===');

test('mock 模式下 apply 不写文件', () => {
  const result = patchManager.apply(SAFE_DIFF, 'mock test', { mock: true });
  assertEqual(result.status, 'applied');
});

test('mock 模式下 rollback 不操作文件', () => {
  const applyResult = patchManager.apply(SAFE_DIFF, 'mock rollback', { mock: true });
  const rollbackResult = patchManager.rollback(applyResult.patchId, { mock: true });
  assertEqual(rollbackResult.success, true);
});

test('审计低风险', () => {
  const result = patchManager.audit(SAFE_DIFF);
  assertEqual(result.level, 'low');
});

test('审计中风险 (deploy)', () => {
  const result = patchManager.audit(DEPLOY_DIFF);
  // deploy=20 + no-test=25 = 45 → medium level, but safe=false (forbiddenHits)
  assertEqual(result.level, 'medium');
  assertEqual(result.safe, false);
});

// ─── 汇总 ──────────────────────────────────────────────────────

console.log('\n=== 结果 ===');
console.log('通过: ' + passed);
console.log('失败: ' + failed);

if (failed > 0) {
  console.log('\n❌ 测试失败！');
  process.exit(1);
} else {
  console.log('✅ 全部通过！');
}
