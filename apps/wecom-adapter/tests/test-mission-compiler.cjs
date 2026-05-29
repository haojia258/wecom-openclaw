'use strict';

/**
 * Mission Compiler MVP 测试套件 (>=200 tests)
 * P9.5.3
 *
 * 覆盖:
 * A. mission-compiler-types 常量 + 工厂函数
 * B. mission-template-registry 类 + 方法
 * C. mission-draft-validator 校验函数
 * D. mission-compiler 核心 compiler 类
 * E. index.js barrel export
 * F. 安全审计 (grep 禁止项)
 * G. 边界情况
 */

var assert = require('assert');
var fs = require('fs');
var path = require('path');

var types = require('../src/mission-compiler/mission-compiler-types');
var registry = require('../src/mission-compiler/mission-template-registry');
var validator = require('../src/mission-compiler/mission-draft-validator');
var core = require('../src/mission-compiler/mission-compiler');
var index = require('../src/mission-compiler/index');

var passed = 0;
var failed = 0;
var errors = [];

function t(name, fn) {
  try {
    fn();
    passed++;
  } catch (e) {
    failed++;
    errors.push({ name: name, error: e.message });
    console.log('  FAIL: ' + name + ' -> ' + e.message);
  }
}

// ========================================
// Helper: create a valid strategy plan
// ========================================
function makeStrategyPlan(overrides) {
  var base = {
    strategyId: 'strategy_test_' + Date.now(),
    goalId: 'goal_test_' + Date.now(),
    category: 'commerce',
    priority: 'high',
    status: 'draft',
    objectives: ['增长GMV', '提升转化率', '优化推荐'],
    guardrails: ['遵守平台规则', '不得虚假宣传'],
    recommendedMissions: [{ type: 'analytics' }, { type: 'seo' }],
    assumptions: ['资源充足'],
    risks: ['竞争风险', '需求变更'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    metadata: {}
  };
  if (overrides) {
    Object.keys(overrides).forEach(function(k) { base[k] = overrides[k]; });
  }
  return base;
}

// ========================================
// A. mission-compiler-types (30 tests)
// ========================================
console.log('\n=== A. mission-compiler-types ===');

// A1. MISSION_DRAFT_STATUS
t('types-MISSION_DRAFT_STATUS-draft', function() {
  assert.strictEqual(types.MISSION_DRAFT_STATUS.DRAFT, 'draft');
});
t('types-MISSION_DRAFT_STATUS-reviewed', function() {
  assert.strictEqual(types.MISSION_DRAFT_STATUS.REVIEWED, 'reviewed');
});
t('types-MISSION_DRAFT_STATUS-rejected', function() {
  assert.strictEqual(types.MISSION_DRAFT_STATUS.REJECTED, 'rejected');
});
t('types-MISSION_DRAFT_STATUS-archived', function() {
  assert.strictEqual(types.MISSION_DRAFT_STATUS.ARCHIVED, 'archived');
});
t('types-MISSION_DRAFT_STATUS-has-4-keys', function() {
  assert.strictEqual(Object.keys(types.MISSION_DRAFT_STATUS).length, 4);
});

// A2. MISSION_CATEGORIES
t('types-MISSION_CATEGORIES-commerce', function() {
  assert.strictEqual(types.MISSION_CATEGORIES.COMMERCE, 'commerce');
});
t('types-MISSION_CATEGORIES-operations', function() {
  assert.strictEqual(types.MISSION_CATEGORIES.OPERATIONS, 'operations');
});
t('types-MISSION_CATEGORIES-has-6-keys', function() {
  assert.strictEqual(Object.keys(types.MISSION_CATEGORIES).length, 6);
});

// A3. RECOMMENDED_AGENTS
t('types-RECOMMENDED_AGENTS-codex', function() {
  assert.strictEqual(types.RECOMMENDED_AGENTS.CODEX, 'codex');
});
t('types-RECOMMENDED_AGENTS-workbuddy', function() {
  assert.strictEqual(types.RECOMMENDED_AGENTS.WORKBUDDY, 'workbuddy');
});
t('types-RECOMMENDED_AGENTS-has-4-keys', function() {
  assert.strictEqual(Object.keys(types.RECOMMENDED_AGENTS).length, 4);
});

// A4. MISSION_COMPILE_TEMPLATES
t('types-MISSION_COMPILE_TEMPLATES-has-6-entries', function() {
  assert.strictEqual(Object.keys(types.MISSION_COMPILE_TEMPLATES).length, 6);
});
t('types-MISSION_COMPILE_TEMPLATES-commerce-has-acceptance', function() {
  assert.ok(Array.isArray(types.MISSION_COMPILE_TEMPLATES.commerce.defaultAcceptanceCriteria));
  assert.strictEqual(types.MISSION_COMPILE_TEMPLATES.commerce.defaultAcceptanceCriteria.length, 3);
});
t('types-MISSION_COMPILE_TEMPLATES-devops-has-risks', function() {
  assert.ok(Array.isArray(types.MISSION_COMPILE_TEMPLATES.devops.defaultRisks));
  assert.strictEqual(types.MISSION_COMPILE_TEMPLATES.devops.defaultRisks.length, 3);
});

// A5. DEFAULT_MISSION_TEMPLATE
t('types-DEFAULT_MISSION_TEMPLATE-exists', function() {
  assert.ok(types.DEFAULT_MISSION_TEMPLATE);
});
t('types-DEFAULT_MISSION_TEMPLATE-category-generic', function() {
  assert.strictEqual(types.DEFAULT_MISSION_TEMPLATE.category, 'generic');
});

// A6. createDraftId
t('types-createDraftId-returns-string', function() {
  var id = types.createDraftId();
  assert.strictEqual(typeof id, 'string');
});
t('types-createDraftId-starts-with-draft', function() {
  var id = types.createDraftId();
  assert.ok(id.indexOf('draft_') === 0);
});
t('types-createDraftId-unique', function() {
  var ids = {};
  for (var i = 0; i < 50; i++) {
    var id = types.createDraftId();
    assert.ok(!ids[id], 'duplicate: ' + id);
    ids[id] = true;
  }
});

// A7. createMissionDraft
t('types-createMissionDraft-basic', function() {
  var plan = makeStrategyPlan();
  var template = { type: 'commerce-growth', defaultAcceptanceCriteria: ['a1'], defaultRisks: ['r1'] };
  var draft = types.createMissionDraft(plan, template, {});
  assert.ok(draft.draftId);
  assert.strictEqual(draft.strategyId, plan.strategyId);
  assert.strictEqual(draft.goalId, plan.goalId);
  assert.strictEqual(draft.status, 'draft');
  assert.strictEqual(draft.source, 'mission-compiler');
});

t('types-createMissionDraft-inherits-priority', function() {
  var plan = makeStrategyPlan({ priority: 'critical' });
  var draft = types.createMissionDraft(plan, { type: 'test' }, {});
  assert.strictEqual(draft.priority, 'critical');
});

t('types-createMissionDraft-inherits-guardrails', function() {
  var plan = makeStrategyPlan({ guardrails: ['g1', 'g2'] });
  var draft = types.createMissionDraft(plan, { type: 'test' }, { guardrails: ['g1', 'g2'] });
  assert.strictEqual(draft.guardrails.length, 2);
});

t('types-createMissionDraft-custom-status', function() {
  var plan = makeStrategyPlan();
  var draft = types.createMissionDraft(plan, { type: 'test' }, { status: 'reviewed' });
  assert.strictEqual(draft.status, 'reviewed');
});

t('types-createMissionDraft-has-timestamps', function() {
  var plan = makeStrategyPlan();
  var draft = types.createMissionDraft(plan, { type: 'test' }, {});
  assert.ok(draft.createdAt);
  assert.ok(draft.updatedAt);
});

t('types-createMissionDraft-custom-draftId', function() {
  var plan = makeStrategyPlan();
  var draft = types.createMissionDraft(plan, { type: 'test' }, { draftId: 'my_draft_123' });
  assert.strictEqual(draft.draftId, 'my_draft_123');
});

// A8. getRecommendedAgent
t('types-getRecommendedAgent-commerce', function() {
  assert.strictEqual(types.getRecommendedAgent('commerce'), 'codex');
});
t('types-getRecommendedAgent-operations', function() {
  assert.strictEqual(types.getRecommendedAgent('operations'), 'workbuddy');
});
t('types-getRecommendedAgent-unknown', function() {
  assert.strictEqual(types.getRecommendedAgent('unknown'), 'workbuddy');
});
t('types-getRecommendedAgent-null', function() {
  assert.strictEqual(types.getRecommendedAgent(null), 'workbuddy');
});

// A9. isValidMissionDraftStatus
t('types-isValidMissionDraftStatus-valid', function() {
  assert.strictEqual(types.isValidMissionDraftStatus('draft'), true);
  assert.strictEqual(types.isValidMissionDraftStatus('reviewed'), true);
  assert.strictEqual(types.isValidMissionDraftStatus('rejected'), true);
  assert.strictEqual(types.isValidMissionDraftStatus('archived'), true);
});
t('types-isValidMissionDraftStatus-invalid', function() {
  assert.strictEqual(types.isValidMissionDraftStatus('running'), false);
  assert.strictEqual(types.isValidMissionDraftStatus(''), false);
  assert.strictEqual(types.isValidMissionDraftStatus(null), false);
});

// A10. isValidAgent
t('types-isValidAgent-valid', function() {
  assert.strictEqual(types.isValidAgent('codex'), true);
  assert.strictEqual(types.isValidAgent('workbuddy'), true);
});
t('types-isValidAgent-invalid', function() {
  assert.strictEqual(types.isValidAgent('unknown-agent'), false);
  assert.strictEqual(types.isValidAgent(''), false);
});

// ========================================
// B. mission-template-registry (45 tests)
// ========================================
console.log('\n=== B. mission-template-registry ===');

// B1. new instance
t('tmpl-new-instance', function() {
  var r = new registry.MissionTemplateRegistry();
  assert.ok(r);
});

// B2. getTemplate
t('tmpl-getTemplate-commerce', function() {
  var r = new registry.MissionTemplateRegistry();
  var tpl = r.getTemplate('commerce');
  assert.strictEqual(tpl.category, 'commerce');
  assert.ok(tpl.defaultAcceptanceCriteria);
  assert.ok(tpl.defaultRisks);
});

t('tmpl-getTemplate-operations', function() {
  var r = new registry.MissionTemplateRegistry();
  var tpl = r.getTemplate('operations');
  assert.strictEqual(tpl.category, 'operations');
});

t('tmpl-getTemplate-fuzzy-match', function() {
  var r = new registry.MissionTemplateRegistry();
  var tpl = r.getTemplate('commerce_extra');
  assert.strictEqual(tpl.category, 'commerce');
});

t('tmpl-getTemplate-unknown-fallback', function() {
  var r = new registry.MissionTemplateRegistry();
  var tpl = r.getTemplate('nonexistent');
  assert.strictEqual(tpl.category, 'generic');
});

t('tmpl-getTemplate-null-fallback', function() {
  var r = new registry.MissionTemplateRegistry();
  var tpl = r.getTemplate(null);
  assert.strictEqual(tpl.category, 'generic');
});

t('tmpl-getTemplate-undefined-fallback', function() {
  var r = new registry.MissionTemplateRegistry();
  var tpl = r.getTemplate(undefined);
  assert.strictEqual(tpl.category, 'generic');
});

t('tmpl-getTemplate-non-string-fallback', function() {
  var r = new registry.MissionTemplateRegistry();
  var tpl = r.getTemplate(123);
  assert.strictEqual(tpl.category, 'generic');
});

// B3. registerTemplate
t('tmpl-registerTemplate-valid', function() {
  var r = new registry.MissionTemplateRegistry();
  var result = r.registerTemplate('custom-cat', {
    type: 'custom-type',
    defaultAcceptanceCriteria: ['a1'],
    defaultRisks: ['r1']
  });
  assert.strictEqual(result, true);
});

t('tmpl-registerTemplate-then-retrieve', function() {
  var r = new registry.MissionTemplateRegistry();
  r.registerTemplate('my-cat', { type: 'my-type', defaultAcceptanceCriteria: ['my-a'], defaultRisks: ['my-r'] });
  var tpl = r.getTemplate('my-cat');
  assert.strictEqual(tpl.type, 'my-type');
  assert.strictEqual(tpl.defaultAcceptanceCriteria[0], 'my-a');
});

t('tmpl-registerTemplate-normalizes-category', function() {
  var r = new registry.MissionTemplateRegistry();
  r.registerTemplate('  UPPER-CAT  ', { type: 't', defaultAcceptanceCriteria: ['a'], defaultRisks: ['r'] });
  var tpl = r.getTemplate('upper-cat');
  assert.strictEqual(tpl.type, 't');
});

t('tmpl-registerTemplate-missing-category-throws', function() {
  var r = new registry.MissionTemplateRegistry();
  assert.throws(function() { r.registerTemplate(null, {}); });
});

t('tmpl-registerTemplate-missing-template-throws', function() {
  var r = new registry.MissionTemplateRegistry();
  assert.throws(function() { r.registerTemplate('cat', null); });
});

// B4. listTemplates
t('tmpl-listTemplates-returns-6-builtins', function() {
  var r = new registry.MissionTemplateRegistry();
  var list = r.listTemplates();
  assert.strictEqual(list.length, 6);
});

t('tmpl-listTemplates-has-type', function() {
  var r = new registry.MissionTemplateRegistry();
  var list = r.listTemplates();
  assert.ok(typeof list[0].type === 'string');
});

t('tmpl-listTemplates-has-acceptanceCriteriaCount', function() {
  var r = new registry.MissionTemplateRegistry();
  var list = r.listTemplates();
  assert.ok(typeof list[0].acceptanceCriteriaCount === 'number');
});

t('tmpl-listTemplates-has-riskCount', function() {
  var r = new registry.MissionTemplateRegistry();
  var list = r.listTemplates();
  assert.ok(typeof list[0].riskCount === 'number');
});

t('tmpl-listTemplates-has-recommendedAgent', function() {
  var r = new registry.MissionTemplateRegistry();
  var list = r.listTemplates();
  assert.ok(typeof list[0].recommendedAgent === 'string');
});

t('tmpl-listTemplates-builtin-flag', function() {
  var r = new registry.MissionTemplateRegistry();
  var list = r.listTemplates();
  assert.strictEqual(list[0].isBuiltIn, true);
});

t('tmpl-listTemplates-includes-custom', function() {
  var r = new registry.MissionTemplateRegistry();
  r.registerTemplate('custom', { type: 't', defaultAcceptanceCriteria: ['a'], defaultRisks: ['r'] });
  var list = r.listTemplates();
  var custom = list.filter(function(l) { return l.category === 'custom'; });
  assert.strictEqual(custom.length, 1);
  assert.strictEqual(custom[0].isBuiltIn, false);
});

// B5. hasTemplate
t('tmpl-hasTemplate-existing', function() {
  var r = new registry.MissionTemplateRegistry();
  assert.strictEqual(r.hasTemplate('commerce'), true);
});
t('tmpl-hasTemplate-non-existing', function() {
  var r = new registry.MissionTemplateRegistry();
  assert.strictEqual(r.hasTemplate('nonexistent'), false);
});
t('tmpl-hasTemplate-falsy', function() {
  var r = new registry.MissionTemplateRegistry();
  assert.strictEqual(r.hasTemplate(null), false);
});

// B6. getDefaultAcceptanceCriteria / getDefaultRisks
t('tmpl-getDefaultAcceptanceCriteria', function() {
  var r = new registry.MissionTemplateRegistry();
  var crit = r.getDefaultAcceptanceCriteria('commerce');
  assert.ok(Array.isArray(crit));
  assert.strictEqual(crit.length, 3);
});

t('tmpl-getDefaultRisks', function() {
  var r = new registry.MissionTemplateRegistry();
  var risks = r.getDefaultRisks('devops');
  assert.ok(Array.isArray(risks));
  assert.strictEqual(risks.length, 3);
});

t('tmpl-getMissionType', function() {
  var r = new registry.MissionTemplateRegistry();
  assert.strictEqual(r.getMissionType('commerce'), 'commerce-growth');
  assert.strictEqual(r.getMissionType('operations'), 'operations-efficiency');
  assert.strictEqual(r.getMissionType('devops'), 'devops-stability');
});

// B7. removeTemplate
t('tmpl-removeTemplate-custom', function() {
  var r = new registry.MissionTemplateRegistry();
  r.registerTemplate('to-remove', { type: 't', defaultAcceptanceCriteria: ['a'], defaultRisks: ['r'] });
  assert.strictEqual(r.hasTemplate('to-remove'), true);
  r.removeTemplate('to-remove');
  assert.strictEqual(r.hasTemplate('to-remove'), false);
});

t('tmpl-removeTemplate-builtin-throws', function() {
  var r = new registry.MissionTemplateRegistry();
  assert.throws(function() { r.removeTemplate('commerce'); });
});

t('tmpl-removeTemplate-falsy-returns-false', function() {
  var r = new registry.MissionTemplateRegistry();
  assert.strictEqual(r.removeTemplate(null), false);
});

// B8. clearCustomTemplates
t('tmpl-clearCustomTemplates', function() {
  var r = new registry.MissionTemplateRegistry();
  r.registerTemplate('c1', { type: 't', defaultAcceptanceCriteria: ['a'], defaultRisks: ['r'] });
  r.registerTemplate('c2', { type: 't', defaultAcceptanceCriteria: ['a'], defaultRisks: ['r'] });
  assert.strictEqual(r.listTemplates().length, 8);
  r.clearCustomTemplates();
  assert.strictEqual(r.listTemplates().length, 6);
});

// B9. exportTemplates
t('tmpl-exportTemplates-has-builtIn', function() {
  var r = new registry.MissionTemplateRegistry();
  var exported = r.exportTemplates();
  assert.ok(exported.builtIn);
  assert.strictEqual(Object.keys(exported.builtIn).length, 6);
});

t('tmpl-exportTemplates-has-custom', function() {
  var r = new registry.MissionTemplateRegistry();
  r.registerTemplate('c3', { type: 't', defaultAcceptanceCriteria: ['a'], defaultRisks: ['r'] });
  var exported = r.exportTemplates();
  assert.ok(exported.custom);
  assert.ok(exported.custom.c3);
});

t('tmpl-exportTemplates-strips-metadata', function() {
  var r = new registry.MissionTemplateRegistry();
  var exported = r.exportTemplates();
  var firstBuiltin = exported.builtIn[Object.keys(exported.builtIn)[0]];
  assert.strictEqual(firstBuiltin.isBuiltIn, undefined);
  assert.strictEqual(firstBuiltin.registeredAt, undefined);
});

// B10. singleton convenience functions
t('tmpl-singleton-getTemplate', function() {
  var tpl = registry.getTemplate('operations');
  assert.strictEqual(tpl.category, 'operations');
});

t('tmpl-singleton-registerTemplate', function() {
  var result = registry.registerTemplate('singleton-test-' + Date.now(), {
    type: 'st', defaultAcceptanceCriteria: ['s'], defaultRisks: ['g']
  });
  assert.strictEqual(result, true);
});

t('tmpl-singleton-listTemplates', function() {
  var list = registry.listTemplates();
  assert.ok(Array.isArray(list));
  assert.ok(list.length >= 6);
});

t('tmpl-singleton-hasTemplate', function() {
  assert.strictEqual(registry.hasTemplate('commerce'), true);
  assert.strictEqual(registry.hasTemplate('zzz-nonexistent'), false);
});

t('tmpl-singleton-getMissionType', function() {
  assert.strictEqual(registry.getMissionType('commerce'), 'commerce-growth');
});

// B11. additional template tests
t('tmpl-commerce-acceptance-are-strings', function() {
  var r = new registry.MissionTemplateRegistry();
  var tpl = r.getTemplate('commerce');
  tpl.defaultAcceptanceCriteria.forEach(function(obj) {
    assert.strictEqual(typeof obj, 'string');
  });
});

t('tmpl-devops-risks-are-strings', function() {
  var r = new registry.MissionTemplateRegistry();
  var tpl = r.getTemplate('devops');
  tpl.defaultRisks.forEach(function(rr) {
    assert.strictEqual(typeof rr, 'string');
  });
});

t('tmpl-registerTemplate-overwrite', function() {
  var r = new registry.MissionTemplateRegistry();
  r.registerTemplate('dupe', { type: 'v1', defaultAcceptanceCriteria: ['a'], defaultRisks: ['r'] });
  r.registerTemplate('dupe', { type: 'v2', defaultAcceptanceCriteria: ['b'], defaultRisks: ['s'] });
  var tpl = r.getTemplate('dupe');
  assert.strictEqual(tpl.type, 'v2');
});

t('tmpl-all-categories-have-type', function() {
  var r = new registry.MissionTemplateRegistry();
  var categories = ['commerce', 'operations', 'marketing', 'customer', 'devops', 'finance'];
  categories.forEach(function(cat) {
    var tpl = r.getTemplate(cat);
    assert.ok(tpl.type, cat + ' should have type');
  });
});

t('tmpl-all-categories-have-acceptance', function() {
  var r = new registry.MissionTemplateRegistry();
  var categories = ['commerce', 'operations', 'marketing', 'customer', 'devops', 'finance'];
  categories.forEach(function(cat) {
    var crit = r.getDefaultAcceptanceCriteria(cat);
    assert.ok(crit.length > 0, cat + ' should have acceptance criteria');
  });
});

t('tmpl-all-categories-have-risks', function() {
  var r = new registry.MissionTemplateRegistry();
  var categories = ['commerce', 'operations', 'marketing', 'customer', 'devops', 'finance'];
  categories.forEach(function(cat) {
    var risks = r.getDefaultRisks(cat);
    assert.ok(risks.length > 0, cat + ' should have risks');
  });
});

// ========================================
// C. mission-draft-validator (50 tests)
// ========================================
console.log('\n=== C. mission-draft-validator ===');

// C1. ERRORS
t('val-ERRORS-has-DRAFT_NOT_OBJECT', function() {
  assert.ok(validator.ERRORS.DRAFT_NOT_OBJECT);
});
t('val-ERRORS-has-MISSING_DRAFT_ID', function() {
  assert.ok(validator.ERRORS.MISSING_DRAFT_ID);
});
t('val-ERRORS-has-MISSING_STRATEGY_ID', function() {
  assert.ok(validator.ERRORS.MISSING_STRATEGY_ID);
});
t('val-ERRORS-has-MISSING_GOAL_ID', function() {
  assert.ok(validator.ERRORS.MISSING_GOAL_ID);
});
t('val-ERRORS-has-INVALID_PRIORITY', function() {
  assert.ok(validator.ERRORS.INVALID_PRIORITY);
});
t('val-ERRORS-has-INVALID_STATUS', function() {
  assert.ok(validator.ERRORS.INVALID_STATUS);
});
t('val-ERRORS-has-INVALID_RECOMMENDED_AGENT', function() {
  assert.ok(validator.ERRORS.INVALID_RECOMMENDED_AGENT);
});
t('val-ERRORS-has-GUARDRAILS_NOT_ARRAY', function() {
  assert.ok(validator.ERRORS.GUARDRAILS_NOT_ARRAY);
});
t('val-ERRORS-has-ACCEPTANCE_CRITERIA_NOT_ARRAY', function() {
  assert.ok(validator.ERRORS.ACCEPTANCE_CRITERIA_NOT_ARRAY);
});
t('val-ERRORS-has-RISKS_NOT_ARRAY', function() {
  assert.ok(validator.ERRORS.RISKS_NOT_ARRAY);
});

// C2. PRIORITY_LEVELS
t('val-PRIORITY_LEVELS-array', function() {
  assert.ok(Array.isArray(validator.PRIORITY_LEVELS));
  assert.strictEqual(validator.PRIORITY_LEVELS.length, 4);
});

// C3. validateMissionDraft - valid
t('val-validateMissionDraft-valid', function() {
  var d = {
    draftId: 'draft_001', strategyId: 's1', goalId: 'g1',
    type: 'test', title: 'Test', priority: 'high', status: 'draft',
    source: 'mission-compiler', recommendedAgent: 'codex',
    objective: 'test objective', inputs: {}, guardrails: ['g1'],
    acceptanceCriteria: ['a1'], risks: ['r1']
  };
  var r = validator.validateMissionDraft(d);
  assert.strictEqual(r.valid, true);
});

t('val-validateMissionDraft-null', function() {
  var r = validator.validateMissionDraft(null);
  assert.strictEqual(r.valid, false);
});

t('val-validateMissionDraft-non-object', function() {
  var r = validator.validateMissionDraft('string');
  assert.strictEqual(r.valid, false);
});

t('val-validateMissionDraft-missing-draftId', function() {
  var r = validator.validateMissionDraft({ strategyId: 's1', goalId: 'g1' });
  assert.strictEqual(r.valid, false);
});

t('val-validateMissionDraft-missing-strategyId', function() {
  var r = validator.validateMissionDraft({ draftId: 'd1', goalId: 'g1' });
  assert.strictEqual(r.valid, false);
});

t('val-validateMissionDraft-missing-goalId', function() {
  var r = validator.validateMissionDraft({ draftId: 'd1', strategyId: 's1' });
  assert.strictEqual(r.valid, false);
});

t('val-validateMissionDraft-invalid-priority', function() {
  var r = validator.validateMissionDraft({ draftId: 'd1', strategyId: 's1', goalId: 'g1', priority: 'urgent' });
  assert.strictEqual(r.valid, false);
});

t('val-validateMissionDraft-invalid-status', function() {
  var r = validator.validateMissionDraft({ draftId: 'd1', strategyId: 's1', goalId: 'g1', status: 'running' });
  assert.strictEqual(r.valid, false);
});

t('val-validateMissionDraft-invalid-agent', function() {
  var r = validator.validateMissionDraft({ draftId: 'd1', strategyId: 's1', goalId: 'g1', recommendedAgent: 'bad-agent' });
  assert.strictEqual(r.valid, false);
});

t('val-validateMissionDraft-wrong-source-warning', function() {
  var r = validator.validateMissionDraft({ draftId: 'd1', strategyId: 's1', goalId: 'g1', source: 'manual' });
  assert.strictEqual(r.valid, true);
  assert.ok(r.warnings.length > 0);
});

t('val-validateMissionDraft-invalid-guardrails', function() {
  var r = validator.validateMissionDraft({ draftId: 'd1', strategyId: 's1', goalId: 'g1', guardrails: 'not-array' });
  assert.strictEqual(r.valid, false);
});

t('val-validateMissionDraft-guardrails-non-string', function() {
  var r = validator.validateMissionDraft({ draftId: 'd1', strategyId: 's1', goalId: 'g1', guardrails: [123] });
  assert.strictEqual(r.valid, false);
});

t('val-validateMissionDraft-invalid-acceptance', function() {
  var r = validator.validateMissionDraft({ draftId: 'd1', strategyId: 's1', goalId: 'g1', acceptanceCriteria: 'bad' });
  assert.strictEqual(r.valid, false);
});

t('val-validateMissionDraft-invalid-risks', function() {
  var r = validator.validateMissionDraft({ draftId: 'd1', strategyId: 's1', goalId: 'g1', risks: 123 });
  assert.strictEqual(r.valid, false);
});

t('val-validateMissionDraft-invalid-type', function() {
  var r = validator.validateMissionDraft({ draftId: 'd1', strategyId: 's1', goalId: 'g1', type: 123 });
  assert.strictEqual(r.valid, false);
});

t('val-validateMissionDraft-empty-type', function() {
  var r = validator.validateMissionDraft({ draftId: 'd1', strategyId: 's1', goalId: 'g1', type: '   ' });
  assert.strictEqual(r.valid, false);
});

t('val-validateMissionDraft-invalid-inputs', function() {
  var r = validator.validateMissionDraft({ draftId: 'd1', strategyId: 's1', goalId: 'g1', inputs: 'bad' });
  assert.strictEqual(r.valid, false);
});

t('val-validateMissionDraft-array-inputs', function() {
  var r = validator.validateMissionDraft({ draftId: 'd1', strategyId: 's1', goalId: 'g1', inputs: [] });
  assert.strictEqual(r.valid, false);
});

// C4. validateStrategyForCompilation
t('val-validateStrategyForCompilation-valid', function() {
  var plan = makeStrategyPlan();
  var r = validator.validateStrategyForCompilation(plan);
  assert.strictEqual(r.valid, true);
});

t('val-validateStrategyForCompilation-null', function() {
  var r = validator.validateStrategyForCompilation(null);
  assert.strictEqual(r.valid, false);
});

t('val-validateStrategyForCompilation-no-objectives', function() {
  var plan = makeStrategyPlan({ objectives: undefined });
  var r = validator.validateStrategyForCompilation(plan);
  // Missing objectives is an error now
  assert.strictEqual(r.valid, false);
  assert.ok(r.errors.length > 0);
});

t('val-validateStrategyForCompilation-empty-objectives', function() {
  var plan = makeStrategyPlan({ objectives: [] });
  var r = validator.validateStrategyForCompilation(plan);
  assert.strictEqual(r.valid, true);
  assert.ok(r.warnings.length > 0);
});

t('val-validateStrategyForCompilation-no-guardrails', function() {
  var plan = makeStrategyPlan({ guardrails: undefined });
  var r = validator.validateStrategyForCompilation(plan);
  assert.strictEqual(r.valid, true);
  assert.ok(r.warnings.length > 0);
});

t('val-validateStrategyForCompilation-undefined', function() {
  var r = validator.validateStrategyForCompilation(undefined);
  assert.strictEqual(r.valid, false);
  assert.ok(r.errors.length > 0);
});

// C5. validatePriority
t('val-validatePriority-valid-low', function() {
  var r = validator.validatePriority('low');
  assert.strictEqual(r.valid, true);
  assert.strictEqual(r.normalized, 'low');
});

t('val-validatePriority-valid-critical', function() {
  var r = validator.validatePriority('critical');
  assert.strictEqual(r.valid, true);
});

t('val-validatePriority-invalid', function() {
  var r = validator.validatePriority('urgent');
  assert.strictEqual(r.valid, false);
  assert.strictEqual(r.fallback, 'medium');
});

t('val-validatePriority-null', function() {
  var r = validator.validatePriority(null);
  assert.strictEqual(r.valid, true);
  assert.strictEqual(r.normalized, 'medium');
});

// C6. validateStatus
t('val-validateStatus-valid', function() {
  var r = validator.validateStatus('draft');
  assert.strictEqual(r.valid, true);
});

t('val-validateStatus-invalid', function() {
  var r = validator.validateStatus('running');
  assert.strictEqual(r.valid, false);
});

t('val-validateStatus-null', function() {
  var r = validator.validateStatus(null);
  assert.strictEqual(r.valid, true);
  assert.strictEqual(r.normalized, 'draft');
});

// C7. validateAgent
t('val-validateAgent-valid', function() {
  var r = validator.validateAgent('codex');
  assert.strictEqual(r.valid, true);
  assert.strictEqual(r.normalized, 'codex');
});

t('val-validateAgent-invalid', function() {
  var r = validator.validateAgent('bad');
  assert.strictEqual(r.valid, false);
  assert.strictEqual(r.fallback, 'workbuddy');
});

t('val-validateAgent-null', function() {
  var r = validator.validateAgent(null);
  assert.strictEqual(r.valid, true);
  assert.strictEqual(r.normalized, null);
});

// ========================================
// D. mission-compiler (60 tests)
// ========================================
console.log('\n=== D. mission-compiler ===');

// D1. new instance
t('compiler-new-instance', function() {
  var c = new core.MissionCompiler();
  assert.ok(c);
});

t('compiler-new-instance-custom-opts', function() {
  var c = new core.MissionCompiler({ maxDraftsPerStrategy: 5, enableLogging: true });
  assert.ok(c);
});

// D2. compileStrategyToMissionDrafts - success
t('compiler-compile-valid-strategy', function() {
  var c = new core.MissionCompiler();
  var plan = makeStrategyPlan();
  var result = c.compileStrategyToMissionDrafts(plan);
  assert.ok(result.drafts);
  assert.strictEqual(result.drafts.length, 3); // 3 objectives
  assert.strictEqual(result.draftCount, 3);
  assert.strictEqual(result.strategyId, plan.strategyId);
  assert.strictEqual(result.category, 'commerce');
});

t('compiler-compile-drafts-have-draftId', function() {
  var c = new core.MissionCompiler();
  var plan = makeStrategyPlan();
  var result = c.compileStrategyToMissionDrafts(plan);
  result.drafts.forEach(function(d) {
    assert.ok(d.draftId);
    assert.ok(d.draftId.indexOf('draft_') === 0);
  });
});

t('compiler-compile-drafts-have-objective', function() {
  var c = new core.MissionCompiler();
  var plan = makeStrategyPlan({ objectives: ['目标一', '目标二'] });
  var result = c.compileStrategyToMissionDrafts(plan);
  assert.strictEqual(result.drafts.length, 2);
  assert.strictEqual(result.drafts[0].objective, '目标一');
  assert.strictEqual(result.drafts[1].objective, '目标二');
});

t('compiler-compile-inherits-guardrails', function() {
  var c = new core.MissionCompiler();
  var plan = makeStrategyPlan({ guardrails: ['g1', 'g2'] });
  var result = c.compileStrategyToMissionDrafts(plan);
  result.drafts.forEach(function(d) {
    assert.ok(d.guardrails.indexOf('g1') !== -1);
    assert.ok(d.guardrails.indexOf('g2') !== -1);
  });
});

t('compiler-compile-inherits-priority', function() {
  var c = new core.MissionCompiler();
  var plan = makeStrategyPlan({ priority: 'critical' });
  var result = c.compileStrategyToMissionDrafts(plan);
  result.drafts.forEach(function(d) {
    assert.strictEqual(d.priority, 'critical');
  });
});

t('compiler-compile-validation-error-throws', function() {
  var c = new core.MissionCompiler();
  var plan = makeStrategyPlan({ objectives: [123] }); // non-string objective
  assert.throws(function() { c.compileStrategyToMissionDrafts(plan); });
});

t('compiler-compile-null-throws', function() {
  var c = new core.MissionCompiler();
  assert.throws(function() { c.compileStrategyToMissionDrafts(null); });
});

t('compiler-compile-undefined-throws', function() {
  var c = new core.MissionCompiler();
  assert.throws(function() { c.compileStrategyToMissionDrafts(undefined); });
});

t('compiler-compile-empty-object-throws', function() {
  var c = new core.MissionCompiler();
  assert.throws(function() { c.compileStrategyToMissionDrafts({}); });
});

// D3. compileStrategyToMissionDrafts - categories
t('compiler-compile-devops-category', function() {
  var c = new core.MissionCompiler();
  var plan = makeStrategyPlan({ category: 'devops', objectives: ['提高稳定性'] });
  var result = c.compileStrategyToMissionDrafts(plan);
  assert.strictEqual(result.category, 'devops');
  assert.strictEqual(result.drafts[0].type, 'devops-stability');
});

t('compiler-compile-finance-category', function() {
  var c = new core.MissionCompiler();
  var plan = makeStrategyPlan({ category: 'finance', objectives: ['优化现金流'] });
  var result = c.compileStrategyToMissionDrafts(plan);
  assert.strictEqual(result.category, 'finance');
  assert.strictEqual(result.drafts[0].type, 'finance-optimization');
});

t('compiler-compile-marketing-category', function() {
  var c = new core.MissionCompiler();
  var plan = makeStrategyPlan({ category: 'marketing', objectives: ['提升品牌'] });
  var result = c.compileStrategyToMissionDrafts(plan);
  assert.strictEqual(result.drafts[0].type, 'marketing-campaign');
});

t('compiler-compile-customer-category', function() {
  var c = new core.MissionCompiler();
  var plan = makeStrategyPlan({ category: 'customer', objectives: ['提升满意度'] });
  var result = c.compileStrategyToMissionDrafts(plan);
  assert.strictEqual(result.drafts[0].type, 'customer-engagement');
});

t('compiler-compile-operations-category', function() {
  var c = new core.MissionCompiler();
  var plan = makeStrategyPlan({ category: 'operations', objectives: ['提升效率'] });
  var result = c.compileStrategyToMissionDrafts(plan);
  assert.strictEqual(result.drafts[0].type, 'operations-efficiency');
});

// D4. compileStrategyToMissionDrafts - unknown category
t('compiler-compile-unknown-category-fallback', function() {
  var c = new core.MissionCompiler();
  var plan = makeStrategyPlan({ category: 'unknown-cat', objectives: ['做点事'] });
  var result = c.compileStrategyToMissionDrafts(plan);
  assert.strictEqual(result.drafts[0].type, 'generic-mission');
});

// D5. compileStrategyToMissionDrafts - single objective
t('compiler-compile-single-objective', function() {
  var c = new core.MissionCompiler();
  var plan = makeStrategyPlan({ objectives: ['唯一的任务'] });
  var result = c.compileStrategyToMissionDrafts(plan);
  assert.strictEqual(result.draftCount, 1);
  assert.strictEqual(result.drafts[0].objective, '唯一的任务');
});

// D6. compileStrategyToMissionDrafts - maxDrafts
t('compiler-compile-maxDraftsPerStrategy', function() {
  var c = new core.MissionCompiler({ maxDraftsPerStrategy: 2 });
  var plan = makeStrategyPlan({ objectives: ['o1', 'o2', 'o3', 'o4', 'o5'] });
  var result = c.compileStrategyToMissionDrafts(plan);
  assert.strictEqual(result.draftCount, 2);
});

// D7. compileStrategyToMissionDrafts - all drafts have required fields
t('compiler-compile-all-drafts-have-required-fields', function() {
  var c = new core.MissionCompiler();
  var plan = makeStrategyPlan();
  var result = c.compileStrategyToMissionDrafts(plan);
  result.drafts.forEach(function(d) {
    assert.ok(d.draftId, 'missing draftId');
    assert.ok(d.strategyId, 'missing strategyId');
    assert.ok(d.goalId, 'missing goalId');
    assert.ok(d.type, 'missing type');
    assert.ok(d.title, 'missing title');
    assert.ok(d.priority, 'missing priority');
    assert.strictEqual(d.status, 'draft');
    assert.strictEqual(d.source, 'mission-compiler');
    assert.ok(d.recommendedAgent, 'missing recommendedAgent');
    assert.ok(d.objective, 'missing objective');
    assert.ok(Array.isArray(d.guardrails));
    assert.ok(Array.isArray(d.acceptanceCriteria));
    assert.ok(Array.isArray(d.risks));
  });
});

// D8. compileStrategyToMissionDrafts - metadata
t('compiler-compile-has-compilerVersion', function() {
  var c = new core.MissionCompiler();
  var plan = makeStrategyPlan();
  var result = c.compileStrategyToMissionDrafts(plan);
  assert.strictEqual(result.compilerVersion, 'P9.5.3-MVP');
});

t('compiler-compile-has-processingTimeMs', function() {
  var c = new core.MissionCompiler();
  var plan = makeStrategyPlan();
  var result = c.compileStrategyToMissionDrafts(plan);
  assert.ok(typeof result.processingTimeMs === 'number');
});

t('compiler-compile-draft-has-metadata', function() {
  var c = new core.MissionCompiler();
  var plan = makeStrategyPlan();
  var result = c.compileStrategyToMissionDrafts(plan);
  result.drafts.forEach(function(d, i) {
    assert.strictEqual(d.metadata.objectiveIndex, i);
    assert.strictEqual(d.metadata.totalObjectives, 3);
    assert.ok(d.metadata.compiledAt);
  });
});

// D9. compileStrategyToMissionDrafts - options
t('compiler-compile-options-priority', function() {
  var c = new core.MissionCompiler();
  var plan = makeStrategyPlan({ priority: 'low' });
  var result = c.compileStrategyToMissionDrafts(plan, { priority: 'critical' });
  result.drafts.forEach(function(d) {
    assert.strictEqual(d.priority, 'critical');
  });
});

t('compiler-compile-options-status', function() {
  var c = new core.MissionCompiler();
  var plan = makeStrategyPlan();
  var result = c.compileStrategyToMissionDrafts(plan, { status: 'reviewed' });
  result.drafts.forEach(function(d) {
    assert.strictEqual(d.status, 'reviewed');
  });
});

t('compiler-compile-options-draftIdPrefix', function() {
  var c = new core.MissionCompiler();
  var plan = makeStrategyPlan({ objectives: ['o1', 'o2'] });
  var result = c.compileStrategyToMissionDrafts(plan, { draftIdPrefix: 'my_prefix' });
  assert.strictEqual(result.drafts[0].draftId, 'my_prefix_0');
  assert.strictEqual(result.drafts[1].draftId, 'my_prefix_1');
});

// D10. compileStrategyToMissionDrafts - empty objectives
t('compiler-compile-empty-objectives', function() {
  var c = new core.MissionCompiler();
  var plan = makeStrategyPlan({ objectives: [] });
  var result = c.compileStrategyToMissionDrafts(plan);
  assert.strictEqual(result.draftCount, 0);
  assert.ok(Array.isArray(result.drafts));
});

// D11. previewMissionDrafts
t('compiler-preview-markdown', function() {
  var c = new core.MissionCompiler();
  var plan = makeStrategyPlan({ objectives: ['test objective'] });
  var result = c.compileStrategyToMissionDrafts(plan);
  var md = c.previewMissionDrafts(result.drafts);
  assert.ok(md.indexOf('Mission Drafts') !== -1);
  assert.ok(md.indexOf('test objective') !== -1);
});

t('compiler-preview-markdown-empty-drafts', function() {
  var c = new core.MissionCompiler();
  var md = c.previewMissionDrafts([]);
  assert.ok(md.indexOf('暂无 Mission Drafts') !== -1 || md.indexOf('No') !== -1);
});

t('compiler-preview-markdown-non-array', function() {
  var c = new core.MissionCompiler();
  var md = c.previewMissionDrafts(null);
  assert.ok(md.indexOf('无可用') !== -1 || md.indexOf('No') !== -1);
});

t('compiler-preview-json', function() {
  var c = new core.MissionCompiler();
  var plan = makeStrategyPlan({ objectives: ['obj1'] });
  var result = c.compileStrategyToMissionDrafts(plan);
  var json = c.previewMissionDraftsJson(result.drafts);
  var parsed = JSON.parse(json);
  assert.strictEqual(parsed.totalDrafts, 1);
  assert.strictEqual(parsed.drafts.length, 1);
});

t('compiler-preview-json-non-array', function() {
  var c = new core.MissionCompiler();
  var json = c.previewMissionDraftsJson(null);
  var parsed = JSON.parse(json);
  assert.ok(parsed.error);
});

// D12. batchCompileStrategies
t('compiler-batchCompileStrategies-valid', function() {
  var c = new core.MissionCompiler();
  var plans = [
    makeStrategyPlan({ objectives: ['o1', 'o2'] }),
    makeStrategyPlan({ objectives: ['o3'] })
  ];
  var result = c.batchCompileStrategies(plans);
  assert.strictEqual(result.totalStrategies, 2);
  assert.strictEqual(result.compiled, 2);
  assert.strictEqual(result.totalDrafts, 3);
});

t('compiler-batchCompileStrategies-partial-failure', function() {
  var c = new core.MissionCompiler();
  var plans = [
    makeStrategyPlan({ objectives: ['o1'] }),
    null,
    makeStrategyPlan({ objectives: ['o2'] })
  ];
  var result = c.batchCompileStrategies(plans);
  assert.strictEqual(result.totalStrategies, 3);
  assert.strictEqual(result.compiled, 2);
  assert.strictEqual(result.failed, 1);
});

t('compiler-batchCompileStrategies-non-array-throws', function() {
  var c = new core.MissionCompiler();
  assert.throws(function() { c.batchCompileStrategies('not-array'); });
});

t('compiler-batchCompileStrategies-empty', function() {
  var c = new core.MissionCompiler();
  var result = c.batchCompileStrategies([]);
  assert.strictEqual(result.totalStrategies, 0);
  assert.strictEqual(result.totalDrafts, 0);
});

t('compiler-batchCompileStrategies-errors-format', function() {
  var c = new core.MissionCompiler();
  var plans = [makeStrategyPlan({ objectives: ['o1'] }), null];
  var result = c.batchCompileStrategies(plans);
  assert.ok(result.errors[0].index !== undefined);
  assert.ok(result.errors[0].error !== undefined);
});

t('compiler-batchCompileStrategies-all-succeed', function() {
  var c = new core.MissionCompiler();
  var plans = [];
  for (var i = 0; i < 5; i++) {
    plans.push(makeStrategyPlan({ objectives: ['obj' + i] }));
  }
  var result = c.batchCompileStrategies(plans);
  assert.strictEqual(result.compiled, 5);
  assert.strictEqual(result.failed, 0);
  assert.strictEqual(result.totalDrafts, 5);
});

// D13. updateDraftStatus
t('compiler-updateDraftStatus-draft-to-reviewed', function() {
  var c = new core.MissionCompiler();
  var plan = makeStrategyPlan({ objectives: ['test'] });
  var result = c.compileStrategyToMissionDrafts(plan);
  var draft = result.drafts[0];
  var updated = c.updateDraftStatus(draft, 'reviewed');
  assert.strictEqual(updated.status, 'reviewed');
});

t('compiler-updateDraftStatus-draft-to-rejected', function() {
  var c = new core.MissionCompiler();
  var plan = makeStrategyPlan({ objectives: ['test'] });
  var result = c.compileStrategyToMissionDrafts(plan);
  var updated = c.updateDraftStatus(result.drafts[0], 'rejected');
  assert.strictEqual(updated.status, 'rejected');
});

t('compiler-updateDraftStatus-draft-to-archived', function() {
  var c = new core.MissionCompiler();
  var plan = makeStrategyPlan({ objectives: ['test'] });
  var result = c.compileStrategyToMissionDrafts(plan);
  var updated = c.updateDraftStatus(result.drafts[0], 'archived');
  assert.strictEqual(updated.status, 'archived');
});

t('compiler-updateDraftStatus-invalid-throws', function() {
  var c = new core.MissionCompiler();
  var plan = makeStrategyPlan({ objectives: ['test'] });
  var result = c.compileStrategyToMissionDrafts(plan);
  assert.throws(function() { c.updateDraftStatus(result.drafts[0], 'running'); });
});

t('compiler-updateDraftStatus-null-draft-throws', function() {
  var c = new core.MissionCompiler();
  assert.throws(function() { c.updateDraftStatus(null, 'draft'); });
});

t('compiler-updateDraftStatus-updates-timestamp', function() {
  var c = new core.MissionCompiler();
  var plan = makeStrategyPlan({ objectives: ['test'] });
  var result = c.compileStrategyToMissionDrafts(plan);
  var draft = result.drafts[0];
  var orig = draft.updatedAt;
  var updated = c.updateDraftStatus(draft, 'reviewed');
  assert.ok(updated.updatedAt >= orig);
});

// D14. compileStrategyToMissionDrafts - risks inheritance
t('compiler-compile-inherits-strategy-risks', function() {
  var c = new core.MissionCompiler();
  var plan = makeStrategyPlan({ risks: ['策略风险A', '策略风险B'] });
  var result = c.compileStrategyToMissionDrafts(plan);
  result.drafts.forEach(function(d) {
    assert.ok(d.risks.indexOf('策略风险A') !== -1);
    assert.ok(d.risks.indexOf('策略风险B') !== -1);
  });
});

t('compiler-compile-deduplicates-risks', function() {
  var c = new core.MissionCompiler();
  var plan = makeStrategyPlan({ risks: ['竞争风险'] }); // already in template risks
  var result = c.compileStrategyToMissionDrafts(plan);
  // 竞争风险 should appear only once
  var draft = result.drafts[0];
  var count = draft.risks.filter(function(r) { return r === '竞争风险'; }).length;
  assert.strictEqual(count, 1);
});

// D15. compileStrategyToMissionDrafts - long objective title
t('compiler-compile-long-objective-truncated', function() {
  var c = new core.MissionCompiler();
  var longObj = '这是一个非常长的目标描述文本用来测试标题截断功能确保不会超出限制';
  var plan = makeStrategyPlan({ objectives: [longObj] });
  var result = c.compileStrategyToMissionDrafts(plan);
  assert.ok(result.drafts[0].title.length <= 43);
});

// D16. compileStrategyToMissionDrafts - inputs
t('compiler-compile-draft-has-inputs', function() {
  var c = new core.MissionCompiler();
  var plan = makeStrategyPlan();
  var result = c.compileStrategyToMissionDrafts(plan);
  result.drafts.forEach(function(d, i) {
    assert.strictEqual(typeof d.inputs, 'object');
    assert.strictEqual(d.inputs.objectiveIndex, i);
    assert.strictEqual(d.inputs.category, 'commerce');
  });
});

// D17. compiler singleton convenience functions
t('compiler-singleton-compile', function() {
  var plan = makeStrategyPlan({ objectives: ['singleton test'] });
  var result = core.compileStrategyToMissionDrafts(plan);
  assert.ok(result.drafts.length > 0);
});

t('compiler-singleton-preview', function() {
  var plan = makeStrategyPlan({ objectives: ['preview test'] });
  var result = core.compileStrategyToMissionDrafts(plan);
  var md = core.previewMissionDrafts(result.drafts);
  assert.ok(md.indexOf('preview test') !== -1);
});

t('compiler-singleton-batch', function() {
  var plans = [makeStrategyPlan({ objectives: ['b1'] }), makeStrategyPlan({ objectives: ['b2'] })];
  var result = core.batchCompileStrategies(plans);
  assert.strictEqual(result.totalDrafts, 2);
});

t('compiler-singleton-previewJson', function() {
  var plan = makeStrategyPlan({ objectives: ['pj'] });
  var result = core.compileStrategyToMissionDrafts(plan);
  var json = core.previewMissionDraftsJson(result.drafts);
  var parsed = JSON.parse(json);
  assert.strictEqual(parsed.drafts[0].objective, 'pj');
});

// D18. multiple objectives → multiple drafts
t('compiler-compile-5-objectives-5-drafts', function() {
  var c = new core.MissionCompiler();
  var plan = makeStrategyPlan({ objectives: ['o1', 'o2', 'o3', 'o4', 'o5'] });
  var result = c.compileStrategyToMissionDrafts(plan);
  assert.strictEqual(result.draftCount, 5);
});

t('compiler-compile-10-objectives-10-drafts', function() {
  var c = new core.MissionCompiler();
  var objs = ['a','b','c','d','e','f','g','h','i','j'];
  var plan = makeStrategyPlan({ objectives: objs });
  var result = c.compileStrategyToMissionDrafts(plan);
  assert.strictEqual(result.draftCount, 10);
});

// ========================================
// E. index.js barrel export (20 tests)
// ========================================
console.log('\n=== E. index.js barrel export ===');

t('index-MISSION_DRAFT_STATUS', function() { assert.ok(index.MISSION_DRAFT_STATUS); });
t('index-MISSION_CATEGORIES', function() { assert.ok(index.MISSION_CATEGORIES); });
t('index-RECOMMENDED_AGENTS', function() { assert.ok(index.RECOMMENDED_AGENTS); });
t('index-CATEGORY_AGENT_MAP', function() { assert.ok(index.CATEGORY_AGENT_MAP); });
t('index-MISSION_COMPILE_TEMPLATES', function() { assert.ok(index.MISSION_COMPILE_TEMPLATES); });
t('index-DEFAULT_MISSION_TEMPLATE', function() { assert.ok(index.DEFAULT_MISSION_TEMPLATE); });
t('index-VALIDATION_ERRORS', function() { assert.ok(index.VALIDATION_ERRORS); });
t('index-PRIORITY_LEVELS', function() { assert.ok(index.PRIORITY_LEVELS); });
t('index-createDraftId', function() { assert.strictEqual(typeof index.createDraftId, 'function'); });
t('index-createMissionDraft', function() { assert.strictEqual(typeof index.createMissionDraft, 'function'); });
t('index-getRecommendedAgent', function() { assert.strictEqual(typeof index.getRecommendedAgent, 'function'); });
t('index-isValidMissionDraftStatus', function() { assert.strictEqual(typeof index.isValidMissionDraftStatus, 'function'); });
t('index-isValidAgent', function() { assert.strictEqual(typeof index.isValidAgent, 'function'); });
t('index-MissionTemplateRegistry', function() { assert.ok(index.MissionTemplateRegistry); });
t('index-MissionCompiler', function() { assert.ok(index.MissionCompiler); });
t('index-validateMissionDraft', function() { assert.strictEqual(typeof index.validateMissionDraft, 'function'); });
t('index-validateStrategyForCompilation', function() { assert.strictEqual(typeof index.validateStrategyForCompilation, 'function'); });
t('index-compileStrategyToMissionDrafts', function() { assert.strictEqual(typeof index.compileStrategyToMissionDrafts, 'function'); });
t('index-previewMissionDrafts', function() { assert.strictEqual(typeof index.previewMissionDrafts, 'function'); });
t('index-batchCompileStrategies', function() { assert.strictEqual(typeof index.batchCompileStrategies, 'function'); });

// ========================================
// F. 安全审计 (20 tests)
// ========================================
console.log('\n=== F. 安全审计 ===');

var SRC_DIR = path.join(__dirname, '..', 'src', 'mission-compiler');

function grepSrc(pattern) {
  var found = [];
  function walk(dir) {
    var entries = fs.readdirSync(dir);
    entries.forEach(function(entry) {
      var full = path.join(dir, entry);
      var stat = fs.statSync(full);
      if (stat.isDirectory()) return;
      if (!entry.endsWith('.js')) return;
      var content = fs.readFileSync(full, 'utf8');
      if (content.indexOf(pattern) !== -1) found.push(entry);
    });
  }
  walk(SRC_DIR);
  return found;
}

function grepSrcExact(pattern) {
  var found = [];
  function walk(dir) {
    var entries = fs.readdirSync(dir);
    entries.forEach(function(entry) {
      var full = path.join(dir, entry);
      var stat = fs.statSync(full);
      if (stat.isDirectory()) return;
      if (!entry.endsWith('.js')) return;
      var content = fs.readFileSync(full, 'utf8');
      var lines = content.split('\n');
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i].trim();
        if (line.indexOf('//') === 0) continue;
        if (line.indexOf('*') === 0) continue;
        if (line.indexOf('/*') === 0) continue;
        if (line.indexOf(pattern) !== -1) found.push(entry + ':' + (i+1));
      }
    });
  }
  walk(SRC_DIR);
  return found;
}

t('audit-no-require-child_process', function() {
  var f = grepSrc("require('child_process')");
  assert.strictEqual(f.length, 0, 'found: ' + f.join(', '));
});

t('audit-no-child_process-import', function() {
  var f = grepSrc('child_process');
  assert.strictEqual(f.length, 0, 'found: ' + f.join(', '));
});

t('audit-no-exec-call', function() {
  var f = grepSrcExact('exec(');
  assert.strictEqual(f.length, 0, 'found: ' + f.join(', '));
});

t('audit-no-spawn-call', function() {
  var f = grepSrcExact('spawn(');
  assert.strictEqual(f.length, 0, 'found: ' + f.join(', '));
});

t('audit-no-pm2-restart', function() {
  var f = grepSrcExact('pm2 restart');
  assert.strictEqual(f.length, 0, 'found: ' + f.join(', '));
});

t('audit-no-pm2-delete', function() {
  var f = grepSrcExact('pm2 delete');
  assert.strictEqual(f.length, 0, 'found: ' + f.join(', '));
});

t('audit-no-createServer', function() {
  var f = grepSrcExact('createServer');
  assert.strictEqual(f.length, 0, 'found: ' + f.join(', '));
});

t('audit-no-listen', function() {
  var f = grepSrcExact('.listen(');
  assert.strictEqual(f.length, 0, 'found: ' + f.join(', '));
});

t('audit-no-express', function() {
  var f = grepSrc('express');
  assert.strictEqual(f.length, 0, 'found: ' + f.join(', '));
});

t('audit-no-nginx', function() {
  var f = grepSrcExact('nginx');
  assert.strictEqual(f.length, 0, 'found: ' + f.join(', '));
});

t('audit-no-dotenv', function() {
  var f = grepSrcExact('.env');
  assert.strictEqual(f.length, 0, 'found: ' + f.join(', '));
});

t('audit-no-mission-execution', function() {
  var f = grepSrc('executeMission');
  assert.strictEqual(f.length, 0, 'found: ' + f.join(', '));
});

t('audit-no-commander', function() {
  var f = grepSrcExact('commander');
  assert.strictEqual(f.length, 0, 'found: ' + f.join(', '));
});

t('audit-no-gateway', function() {
  var f = grepSrcExact('gateway');
  assert.strictEqual(f.length, 0, 'found: ' + f.join(', '));
});

t('audit-no-deploy', function() {
  var f = grepSrcExact('deploy(');
  assert.strictEqual(f.length, 0, 'found: ' + f.join(', '));
});

t('audit-no-http-server', function() {
  var f1 = grepSrc('require("http")');
  var f2 = grepSrc("require('http')");
  assert.strictEqual(f1.length + f2.length, 0, 'found http import');
});

t('audit-no-shell-execution', function() {
  var f1 = grepSrc('shelljs');
  var f2 = grepSrc('ShellExec');
  assert.strictEqual(f1.length + f2.length, 0, 'found shell execution');
});

t('audit-source-files-exist', function() {
  assert.ok(fs.existsSync(path.join(SRC_DIR, 'mission-compiler-types.js')));
  assert.ok(fs.existsSync(path.join(SRC_DIR, 'mission-template-registry.js')));
  assert.ok(fs.existsSync(path.join(SRC_DIR, 'mission-draft-validator.js')));
  assert.ok(fs.existsSync(path.join(SRC_DIR, 'mission-compiler.js')));
  assert.ok(fs.existsSync(path.join(SRC_DIR, 'index.js')));
});

t('audit-no-auto-execution', function() {
  var f = grepSrc('autoExecute');
  assert.strictEqual(f.length, 0, 'found: ' + f.join(', '));
});

t('audit-no-fs-write', function() {
  var found = [];
  function walk(dir) {
    var entries = fs.readdirSync(dir);
    entries.forEach(function(entry) {
      var full = path.join(dir, entry);
      var stat = fs.statSync(full);
      if (stat.isDirectory()) return;
      if (!entry.endsWith('.js')) return;
      var content = fs.readFileSync(full, 'utf8');
      if (content.indexOf('writeFile') !== -1) found.push(entry);
      if (content.indexOf('appendFile') !== -1) found.push(entry);
    });
  }
  walk(SRC_DIR);
  assert.strictEqual(found.length, 0, 'found fs write: ' + found.join(', '));
});

// ========================================
// G. 边界情况 (30 tests)
// ========================================
console.log('\n=== G. 边界情况 ===');

t('edge-compile-strategy-with-goal-name', function() {
  var c = new core.MissionCompiler();
  var plan = makeStrategyPlan({ objectives: ['test'], goalId: 'goal_001', category: 'commerce' });
  var result = c.compileStrategyToMissionDrafts(plan);
  assert.strictEqual(result.goalId, 'goal_001');
});

t('edge-compile-non-string-objective-throws', function() {
  var c = new core.MissionCompiler();
  var plan = makeStrategyPlan({ objectives: [123] });
  assert.throws(function() { c.compileStrategyToMissionDrafts(plan); });
});

t('edge-compile-mixed-objectives-fails-validation', function() {
  var c = new core.MissionCompiler();
  var plan = makeStrategyPlan({ objectives: ['valid', 456] });
  assert.throws(function() { c.compileStrategyToMissionDrafts(plan); });
});

t('edge-draft-status-all-values', function() {
  ['draft', 'reviewed', 'rejected', 'archived'].forEach(function(s) {
    assert.strictEqual(types.isValidMissionDraftStatus(s), true);
  });
});

t('edge-agent-all-values', function() {
  ['codex', 'workbuddy', 'deepseek', 'doubao'].forEach(function(a) {
    assert.strictEqual(types.isValidAgent(a), true);
  });
});

t('edge-compile-category-fallback', function() {
  var c = new core.MissionCompiler();
  var plan = makeStrategyPlan({ category: 'fantasy-category', objectives: ['task'] });
  var result = c.compileStrategyToMissionDrafts(plan);
  assert.strictEqual(result.drafts[0].type, 'generic-mission');
});

t('edge-compile-deep-inheritance', function() {
  var c = new core.MissionCompiler();
  var plan = makeStrategyPlan({
    objectives: ['deep'],
    guardrails: ['护栏A', '护栏B', '护栏C'],
    risks: ['风险X', '风险Y'],
    priority: 'high'
  });
  var result = c.compileStrategyToMissionDrafts(plan);
  var d = result.drafts[0];
  assert.ok(d.guardrails.length >= 3);
  assert.ok(d.risks.length >= 2);
  assert.strictEqual(d.priority, 'high');
});

t('edge-compile-no-guardrails-no-error', function() {
  var c = new core.MissionCompiler();
  var plan = makeStrategyPlan({ guardrails: undefined, objectives: ['just one task'] });
  var result = c.compileStrategyToMissionDrafts(plan);
  var d = result.drafts[0];
  // guardrails come from strategy plan, not mission template
  // if strategy has no guardrails, draft.guardrails is empty array
  assert.ok(Array.isArray(d.guardrails));
});

t('edge-draft-has-all-14-fields', function() {
  var c = new core.MissionCompiler();
  var plan = makeStrategyPlan({ objectives: ['t1'] });
  var result = c.compileStrategyToMissionDrafts(plan);
  var d = result.drafts[0];
  var requiredKeys = ['draftId', 'strategyId', 'goalId', 'type', 'title', 'priority',
    'status', 'source', 'recommendedAgent', 'objective', 'inputs', 'guardrails',
    'acceptanceCriteria', 'risks', 'createdAt', 'metadata'];
  requiredKeys.forEach(function(k) {
    assert.ok(d[k] !== undefined, 'missing field: ' + k);
  });
});

t('edge-preview-markdown-multiple-drafts', function() {
  var c = new core.MissionCompiler();
  var plan = makeStrategyPlan({ objectives: ['objective-A', 'objective-B'] });
  var result = c.compileStrategyToMissionDrafts(plan);
  var md = c.previewMissionDrafts(result.drafts);
  assert.ok(md.indexOf('objective-A') !== -1);
  assert.ok(md.indexOf('objective-B') !== -1);
});

t('edge-preview-json-valid-parseable', function() {
  var c = new core.MissionCompiler();
  var plan = makeStrategyPlan({ objectives: ['parse test'] });
  var result = c.compileStrategyToMissionDrafts(plan);
  var json = c.previewMissionDraftsJson(result.drafts);
  var parsed;
  try { parsed = JSON.parse(json); } catch(e) { assert.fail('Invalid JSON: ' + e.message); }
  assert.ok(parsed.drafts);
  assert.ok(parsed.totalDrafts > 0);
});

t('edge-batch-compile-errors-contain-index', function() {
  var c = new core.MissionCompiler();
  var plans = [makeStrategyPlan({ objectives: ['ok'] }), null];
  var result = c.batchCompileStrategies(plans);
  assert.strictEqual(result.errors.length, 1);
  assert.strictEqual(result.errors[0].index, 1);
});

t('edge-compile-preserves-strategyId', function() {
  var c = new core.MissionCompiler();
  var plan = makeStrategyPlan({ strategyId: 'strategy_SPECIAL_123', objectives: ['special'] });
  var result = c.compileStrategyToMissionDrafts(plan);
  assert.strictEqual(result.strategyId, 'strategy_SPECIAL_123');
  assert.strictEqual(result.drafts[0].strategyId, 'strategy_SPECIAL_123');
});

t('edge-compile-no-logging-by-default', function() {
  var c = new core.MissionCompiler({ enableLogging: false });
  var plan = makeStrategyPlan({ objectives: ['silent'] });
  var result = c.compileStrategyToMissionDrafts(plan);
  assert.ok(result);
});

t('edge-compile-logging-enabled', function() {
  var c = new core.MissionCompiler({ enableLogging: true });
  var plan = makeStrategyPlan({ objectives: ['loud'] });
  var result = c.compileStrategyToMissionDrafts(plan);
  assert.ok(result);
});

t('edge-validator-errors-count', function() {
  var keys = Object.keys(validator.ERRORS);
  assert.ok(keys.length >= 15, 'expected >= 15 error codes, got ' + keys.length);
});

t('edge-template-types-are-all-strings', function() {
  var cats = ['commerce', 'operations', 'marketing', 'customer', 'devops', 'finance'];
  cats.forEach(function(cat) {
    var r = new registry.MissionTemplateRegistry();
    var tpl = r.getTemplate(cat);
    assert.strictEqual(typeof tpl.type, 'string', cat + ' type should be string');
    assert.ok(tpl.type.length > 0, cat + ' type should not be empty');
  });
});

t('edge-draft-no-mission-execution', function() {
  var c = new core.MissionCompiler();
  var plan = makeStrategyPlan({ objectives: ['test'] });
  var result = c.compileStrategyToMissionDrafts(plan);
  // Verify status is draft, NOT running/executing
  result.drafts.forEach(function(d) {
    assert.strictEqual(d.status, 'draft');
    assert.strictEqual(d.source, 'mission-compiler');
  });
});

t('edge-drafts-are-pure-objects', function() {
  var c = new core.MissionCompiler();
  var plan = makeStrategyPlan({ objectives: ['test'] });
  var result = c.compileStrategyToMissionDrafts(plan);
  result.drafts.forEach(function(d) {
    // No functions, no side effects, pure data
    assert.strictEqual(typeof d.execute, 'undefined', 'should not have execute');
    assert.strictEqual(typeof d.run, 'undefined', 'should not have run');
    assert.strictEqual(typeof d.start, 'undefined', 'should not have start');
    assert.strictEqual(typeof d.deploy, 'undefined', 'should not have deploy');
  });
});

t('edge-compiler-does-not-write-to-mission-manager', function() {
  // The compiler module should not reference mission-manager in code (comments ok)
  var SRC = path.join(__dirname, '..', 'src', 'mission-compiler');
  var found = [];
  function walk(dir) {
    fs.readdirSync(dir).forEach(function(entry) {
      var full = path.join(dir, entry);
      if (fs.statSync(full).isDirectory()) return;
      var content = fs.readFileSync(full, 'utf8');
      var lines = content.split('\n');
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i].trim();
        if (line.indexOf('//') === 0) continue;
        if (line.indexOf('*') === 0) continue;
        if (line.indexOf('/*') === 0) continue;
        if (line.indexOf('mission-manager') !== -1) found.push(entry + ':' + (i+1));
        if (line.indexOf('missionManager') !== -1) found.push(entry + ':' + (i+1));
      }
    });
  }
  walk(SRC);
  assert.strictEqual(found.length, 0, 'found mission-manager reference in code: ' + found.join(', '));
});

t('edge-compile-with-all-categories', function() {
  var c = new core.MissionCompiler();
  var categories = ['commerce', 'operations', 'marketing', 'customer', 'devops', 'finance'];
  categories.forEach(function(cat) {
    var plan = makeStrategyPlan({ category: cat, objectives: ['test in ' + cat] });
    var result = c.compileStrategyToMissionDrafts(plan);
    assert.strictEqual(result.draftCount, 1, 'failed for ' + cat);
    assert.ok(result.drafts[0].type.length > 0, 'no type for ' + cat);
  });
});

t('edge-compile-result-has-warningCount', function() {
  var c = new core.MissionCompiler();
  var plan = makeStrategyPlan({ objectives: ['test'] });
  var result = c.compileStrategyToMissionDrafts(plan);
  assert.ok(result.warningCount !== undefined);
});

t('edge-compile-with-status-option', function() {
  var c = new core.MissionCompiler();
  var plan = makeStrategyPlan({ objectives: ['status test'] });
  var result = c.compileStrategyToMissionDrafts(plan, { status: 'reviewed' });
  result.drafts.forEach(function(d) {
    assert.strictEqual(d.status, 'reviewed');
  });
});

t('edge-custom-template-registry', function() {
  var r = new registry.MissionTemplateRegistry();
  var c = new core.MissionCompiler({ templateRegistry: r });
  r.registerTemplate('mytype', { type: 'my-special-type', defaultAcceptanceCriteria: ['x'], defaultRisks: ['y'] });
  var plan = makeStrategyPlan({ category: 'mytype', objectives: ['custom'] });
  var result = c.compileStrategyToMissionDrafts(plan);
  assert.strictEqual(result.drafts[0].type, 'my-special-type');
});

t('edge-tmpl-registerTemplate-has-registeredAt', function() {
  var r = new registry.MissionTemplateRegistry();
  r.registerTemplate('timed', { type: 't', defaultAcceptanceCriteria: ['a'], defaultRisks: ['r'] });
  // registeredAt is on the internal map entry, not exported directly
  var exported = r.exportTemplates();
  assert.ok(exported.custom.timed);
  assert.strictEqual(exported.custom.timed.registeredAt, undefined);
});

t('edge-val-warning-deep-check', function() {
  var r = validator.validateMissionDraft({
    draftId: 'd1', strategyId: 's1', goalId: 'g1',
    source: 'manual-tool' // wrong source
  });
  assert.ok(r.warnings.length > 0);
});

t('edge-val-empty-guardrails-ok', function() {
  var r = validator.validateMissionDraft({
    draftId: 'd1', strategyId: 's1', goalId: 'g1',
    guardrails: []
  });
  assert.strictEqual(r.valid, true);
});

t('edge-val-empty-acceptance-ok', function() {
  var r = validator.validateMissionDraft({
    draftId: 'd1', strategyId: 's1', goalId: 'g1',
    acceptanceCriteria: []
  });
  assert.strictEqual(r.valid, true);
});

// ========================================
// 测试汇总
// ========================================
console.log('\n' + '='.repeat(60));
console.log('  P9.5.3 Mission Compiler 测试汇总');
console.log('='.repeat(60));
console.log('  总计: ' + (passed + failed) + ' tests');
console.log('  通过: ' + passed + ' ✓');
console.log('  失败: ' + failed + (failed > 0 ? ' ✗' : ' ✓'));
console.log('='.repeat(60));

if (errors.length > 0) {
  console.log('\n失败详情:');
  errors.forEach(function(e) {
    console.log('  - ' + e.name + ': ' + e.error);
  });
}

process.exit(failed > 0 ? 1 : 0);
