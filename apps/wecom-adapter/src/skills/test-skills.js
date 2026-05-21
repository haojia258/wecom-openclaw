'use strict';

const assert = require('assert');
const { resolveSkill, SKILLS } = require('./index');

function testSkillRegistry() {
  assert.ok(SKILLS, 'SKILLS must exist');
  assert.ok(Object.keys(SKILLS).length > 0, 'SKILLS must not be empty');
  console.log('OK: skill registry exists');
}

function testResolveSkillById() {
  const result = resolveSkill('ops-summary');
  assert.ok(result, 'should find by id');
  assert.strictEqual(result.id, 'ops-summary');
  console.log('OK: resolve by id');
}

function testResolveSkillByAlias() {
  const result = resolveSkill('运营摘要');
  assert.ok(result, 'should find by alias');
  assert.strictEqual(result.id, 'ops-summary');
  console.log('OK: resolve by alias');
}

function testUnknownSkillReturnsNull() {
  const result = resolveSkill('nonexistent-skill');
  assert.strictEqual(result, null);
  console.log('OK: unknown skill returns null');
}

const tests = [testSkillRegistry, testResolveSkillById, testResolveSkillByAlias, testUnknownSkillReturnsNull];
let passed = 0;
let failed = 0;
for (const fn of tests) {
  try { fn(); passed++; } catch (e) { console.error('FAIL:', e.message); failed++; }
}
console.log('\nSkills tests: ' + passed + '/' + tests.length + ' passed');
process.exit(failed > 0 ? 1 : 0);
