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

async function testSkillsExecuteOpsSummary() {
  const { execute } = require('../commands/skills');
  const result = await execute('ops-summary');
  assert.ok(typeof result === 'string', 'execute("ops-summary") should return string');
  assert.ok(!result.includes('可用技能'), 'should NOT contain "可用技能" (must not be list)');
  const hasKeyword = result.includes('运营摘要') || result.includes('GMV');
  assert.ok(hasKeyword, `result should contain "运营摘要" or "GMV", got: ${result.slice(0, 80)}`);
  console.log('OK: skills.execute("ops-summary") returns expected string');
}

const tests = [
  testSkillRegistry,
  testResolveSkillById,
  testResolveSkillByAlias,
  testUnknownSkillReturnsNull,
  testSkillsExecuteOpsSummary,
];

let passed = 0;
let failed = 0;

(async () => {
  for (const fn of tests) {
    try {
      await fn();
      passed++;
    } catch (e) {
      console.error('FAIL:', e.message);
      failed++;
    }
  }
  console.log('\nSkills tests: ' + passed + '/' + tests.length + ' passed');
  process.exit(failed > 0 ? 1 : 0);
})();
