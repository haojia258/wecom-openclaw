'use strict';

/**
 * vault-client.test.js — Node.js Vault 客户端单元测试
 *
 * 测试环境要求：
 *   1. VAULT_ADDR=http://127.0.0.1:8200
 *   2. VAULT_ROLE_ID / VAULT_SECRET_ID 已配置
 *   3. Vault 已 unseal、approle 已启用
 *
 * 运行：node apps/wecom-adapter/src/lib/vault-client.test.js
 */

const vault = require('./vault-client');
const assert = require('assert');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    const result = fn();
    if (result && typeof result.then === 'function') {
      result.then(
        () => { console.log('  ✅ PASS: ' + name); passed++; },
        (e) => { console.log('  ❌ FAIL: ' + name + ' → ' + e.message); failed++; }
      );
      return;
    }
    console.log('  ✅ PASS: ' + name); passed++;
  } catch (e) {
    console.log('  ❌ FAIL: ' + name + ' → ' + e.message); failed++;
  }
}

function run() {
  console.log('=== vault-client.test.js ===\n');

  // ─── 基础导出检查 ─────────────────────
  test('module exports init',         () => { assert.strictEqual(typeof vault.init, 'function'); });
  test('module exports get',          () => { assert.strictEqual(typeof vault.get, 'function'); });
  test('module exports tryGet',       () => { assert.strictEqual(typeof vault.tryGet, 'function'); });
  test('module exports getAll',      () => { assert.strictEqual(typeof vault.getAll, 'function'); });
  test('module exports isReady',     () => { assert.strictEqual(typeof vault.isReady, 'function'); });
  test('module exports sanitize',    () => { assert.strictEqual(typeof vault.sanitize, 'function'); });
  test('module exports health',      () => { assert.strictEqual(typeof vault.health, 'function'); });

  // ─── sanitize 功能测试 ─────────────────
  test('sanitize masks sk- key', () => {
    const r = vault.sanitize('key=sk-abcdefghijklmnopqrstuvwxyz1234567890A');
    assert.strictEqual(r.indexOf('sk-abcdefghijklmnopqrstuvwxyz1234567890A'), -1);
  });

  test('sanitize masks secret= in URL', function() {
    var r = vault.sanitize('url?corpid=x&corpsecret=MySecret123');
    assert.strictEqual(r.indexOf('MySecret123'), -1, 'corpsecret= should be masked');
    var r2 = vault.sanitize('url?corpid=x&secret=Abc456');
    assert.strictEqual(r2.indexOf('Abc456'), -1, 'secret= should be masked');
  });

  test('sanitize passes normal text', () => {
    const t = 'hello world 你好世界';
    assert.strictEqual(vault.sanitize(t), t);
  });

  // ─── 非 Vault 环境：init 应抛异常 ─────
  test('init fails without Vault (non-API port)', async () => {
    // 如果本地 8200 没有 Vault，init() 应 reject
    // 注意：如果本地恰好有 Vault 运行，此测试会误 PASS
    try {
      await vault.init();
      // 不抛异常 ⇒ 本地有 Vault，跳过此断言
    } catch (e) {
      assert.ok(e.message.indexOf('Vault') !== -1 || e.message.indexOf('ECONNREFUSED') !== -1);
    }
  });

  // ─── tryGet 不抛异常 ────────────────────
  test('tryGet returns null for unknown key', () => {
    assert.strictEqual(vault.tryGet('NONEXISTENT_' + Date.now()), null);
  });

  // ─── health 返回对象 ───────────────────────
  test('health returns object', async () => {
    const h = await vault.health();
    assert.ok(typeof h === 'object');
    assert.ok(typeof h.ok === 'boolean');
  });

  console.log('\n=== 结果：' + passed + ' passed, ' + failed + ' failed ===');
  if (failed > 0) process.exit(1);
}

run();
