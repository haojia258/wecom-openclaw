'use strict';

const assert = require('assert');

function testSkillsModuleLoads() {
  const mod = require('./index');
  assert.ok(mod, 'module must load');
  assert.strictEqual(typeof mod.resolveSkill, 'function');
  console.log('OK: skills/index loads correctly');
}

function testResolveSkillNonEmpty() {
  const { resolveSkill } = require('./index');
  const result = resolveSkill('日报');
  assert.ok(result, 'should resolve alias 日报');
  assert.strictEqual(result.id, 'ops-summary');
  console.log('OK: resolve alias 日报');
}

const tests = [testSkillsModuleLoads, testResolveSkillNonEmpty];
let passed = 0;
let failed = 0;
for (const fn of tests) {
  try { fn(); passed++; } catch (e) { console.error('FAIL:', e.message); failed++; }
}
console.log('\nSkills index tests: ' + passed + '/' + tests.length + ' passed');
process.exit(failed > 0 ? 1 : 0);
