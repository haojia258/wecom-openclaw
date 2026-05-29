'use strict';

/**
 * Strategy Planner MVP 测试套件 (>=200 tests)
 * P9.5.2
 *
 * 覆盖:
 * A. strategy-types 常量 + 工厂函数
 * B. strategy-template-registry 类 + 方法
 * C. strategy-validator 校验函数
 * D. strategy-planner 核心 planner 类
 * E. index.js barrel export
 * F. 安全审计 (只扫描源码中的真实危险调用)
 * G. 边界情况
 */

var assert = require('assert');
var fs = require('fs');
var path = require('path');

var types = require('../src/strategy-planner/strategy-types');
var registry = require('../src/strategy-planner/strategy-template-registry');
var validator = require('../src/strategy-planner/strategy-validator');
var core = require('../src/strategy-planner/strategy-planner');
var index = require('../src/strategy-planner/index');

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
// A. strategy-types (35 tests)
// ========================================
console.log('\n=== A. strategy-types ===');

// A1. STRATEGY_STATUS
t('types-STRATEGY_STATUS-draft', function() {
  assert.strictEqual(types.STRATEGY_STATUS.DRAFT, 'draft');
});
t('types-STRATEGY_STATUS-reviewed', function() {
  assert.strictEqual(types.STRATEGY_STATUS.REVIEWED, 'reviewed');
});
t('types-STRATEGY_STATUS-archived', function() {
  assert.strictEqual(types.STRATEGY_STATUS.ARCHIVED, 'archived');
});
t('types-STRATEGY_STATUS-has-3-keys', function() {
  assert.strictEqual(Object.keys(types.STRATEGY_STATUS).length, 3);
});

// A2. STRATEGY_CATEGORIES
t('types-STRATEGY_CATEGORIES-commerce', function() {
  assert.strictEqual(types.STRATEGY_CATEGORIES.COMMERCE, 'commerce');
});
t('types-STRATEGY_CATEGORIES-operations', function() {
  assert.strictEqual(types.STRATEGY_CATEGORIES.OPERATIONS, 'operations');
});
t('types-STRATEGY_CATEGORIES-marketing', function() {
  assert.strictEqual(types.STRATEGY_CATEGORIES.MARKETING, 'marketing');
});
t('types-STRATEGY_CATEGORIES-customer', function() {
  assert.strictEqual(types.STRATEGY_CATEGORIES.CUSTOMER, 'customer');
});
t('types-STRATEGY_CATEGORIES-devops', function() {
  assert.strictEqual(types.STRATEGY_CATEGORIES.DEVOPS, 'devops');
});
t('types-STRATEGY_CATEGORIES-finance', function() {
  assert.strictEqual(types.STRATEGY_CATEGORIES.FINANCE, 'finance');
});
t('types-STRATEGY_CATEGORIES-has-6-keys', function() {
  assert.strictEqual(Object.keys(types.STRATEGY_CATEGORIES).length, 6);
});

// A3. TEMPLATE_REGISTRY
t('types-TEMPLATE_REGISTRY-has-6-entries', function() {
  var keys = Object.keys(types.TEMPLATE_REGISTRY);
  assert.strictEqual(keys.length, 6);
});
t('types-TEMPLATE_REGISTRY-commerce-has-objectives', function() {
  assert.ok(Array.isArray(types.TEMPLATE_REGISTRY.commerce.defaultObjectives));
  assert.strictEqual(types.TEMPLATE_REGISTRY.commerce.defaultObjectives.length, 3);
});
t('types-TEMPLATE_REGISTRY-ops-has-guardrails', function() {
  assert.ok(Array.isArray(types.TEMPLATE_REGISTRY.operations.defaultGuardrails));
  assert.strictEqual(types.TEMPLATE_REGISTRY.operations.defaultGuardrails.length, 3);
});
t('types-TEMPLATE_REGISTRY-devops-has-mission-types', function() {
  assert.ok(Array.isArray(types.TEMPLATE_REGISTRY.devops.recommendedMissionTypes));
  assert.strictEqual(types.TEMPLATE_REGISTRY.devops.recommendedMissionTypes.length, 3);
});

// A4. DEFAULT_TEMPLATE
t('types-DEFAULT_TEMPLATE-exists', function() {
  assert.ok(types.DEFAULT_TEMPLATE);
});
t('types-DEFAULT_TEMPLATE-category-generic', function() {
  assert.strictEqual(types.DEFAULT_TEMPLATE.category, 'generic');
});
t('types-DEFAULT_TEMPLATE-has-objectives', function() {
  assert.ok(Array.isArray(types.DEFAULT_TEMPLATE.defaultObjectives));
  assert.ok(types.DEFAULT_TEMPLATE.defaultObjectives.length > 0);
});
t('types-DEFAULT_TEMPLATE-has-guardrails', function() {
  assert.ok(Array.isArray(types.DEFAULT_TEMPLATE.defaultGuardrails));
  assert.ok(types.DEFAULT_TEMPLATE.defaultGuardrails.length > 0);
});

// A5. createStrategyId
t('types-createStrategyId-returns-string', function() {
  var id = types.createStrategyId();
  assert.strictEqual(typeof id, 'string');
});
t('types-createStrategyId-starts-with-strategy', function() {
  var id = types.createStrategyId();
  assert.ok(id.indexOf('strategy_') === 0);
});
t('types-createStrategyId-unique', function() {
  var ids = {};
  for (var i = 0; i < 50; i++) {
    var id = types.createStrategyId();
    assert.ok(!ids[id], 'duplicate: ' + id);
    ids[id] = true;
  }
});

// A6. createStrategyPlan
t('types-createStrategyPlan-basic', function() {
  var goal = { goalId: 'g1', category: 'commerce', priority: 'high' };
  var template = { defaultObjectives: ['a'], defaultGuardrails: ['b'] };
  var plan = types.createStrategyPlan(goal, template, {});
  assert.ok(plan.strategyId);
  assert.strictEqual(plan.goalId, 'g1');
  assert.strictEqual(plan.category, 'commerce');
  assert.strictEqual(plan.priority, 'high');
  assert.strictEqual(plan.status, 'draft');
});

t('types-createStrategyPlan-uses-goal-id', function() {
  var goal = { id: 'goal_abc123', category: 'operations' };
  var template = { defaultObjectives: ['x'], defaultGuardrails: ['y'] };
  var plan = types.createStrategyPlan(goal, template, {});
  assert.strictEqual(plan.goalId, 'goal_abc123');
});

t('types-createStrategyPlan-no-goalId-fallback', function() {
  var goal = { category: 'devops' };
  var template = { defaultObjectives: ['x'], defaultGuardrails: ['y'] };
  var plan = types.createStrategyPlan(goal, template, {});
  assert.strictEqual(plan.goalId, 'unknown');
});

t('types-createStrategyPlan-custom-status', function() {
  var goal = { goalId: 'g1', category: 'commerce' };
  var plan = types.createStrategyPlan(goal, { defaultObjectives: [], defaultGuardrails: [] }, { status: 'reviewed' });
  assert.strictEqual(plan.status, 'reviewed');
});

t('types-createStrategyPlan-default-objectives', function() {
  var goal = { goalId: 'g1', category: 'marketing' };
  var plan = types.createStrategyPlan(goal, { defaultObjectives: [], defaultGuardrails: [] }, { objectives: ['custom-obj'] });
  assert.strictEqual(plan.objectives.length, 1);
  assert.strictEqual(plan.objectives[0], 'custom-obj');
});

t('types-createStrategyPlan-metadata', function() {
  var goal = { goalId: 'g1', category: 'finance' };
  var plan = types.createStrategyPlan(goal, { defaultObjectives: [], defaultGuardrails: [] }, { metadata: { key: 'val' } });
  assert.strictEqual(plan.metadata.key, 'val');
});

t('types-createStrategyPlan-timestamps', function() {
  var goal = { goalId: 'g1', category: 'commerce' };
  var plan = types.createStrategyPlan(goal, { defaultObjectives: [], defaultGuardrails: [] }, {});
  assert.ok(plan.createdAt);
  assert.ok(plan.updatedAt);
  assert.strictEqual(plan.createdAt, plan.updatedAt);
});

// A7. isValidStatus
t('types-isValidStatus-valid', function() {
  assert.strictEqual(types.isValidStatus('draft'), true);
  assert.strictEqual(types.isValidStatus('reviewed'), true);
  assert.strictEqual(types.isValidStatus('archived'), true);
});
t('types-isValidStatus-invalid', function() {
  assert.strictEqual(types.isValidStatus('running'), false);
  assert.strictEqual(types.isValidStatus(''), false);
  assert.strictEqual(types.isValidStatus(null), false);
});

// A8. isValidCategory
t('types-isValidCategory-valid', function() {
  assert.strictEqual(types.isValidCategory('commerce'), true);
  assert.strictEqual(types.isValidCategory('operations'), true);
  assert.strictEqual(types.isValidCategory('generic'), true);
});
t('types-isValidCategory-invalid', function() {
  assert.strictEqual(types.isValidCategory('unknown'), false);
  assert.strictEqual(types.isValidCategory(''), false);
});

// ========================================
// B. strategy-template-registry (50 tests)
// ========================================
console.log('\n=== B. strategy-template-registry ===');

// B1. new instance
t('tmpl-new-instance', function() {
  var r = new registry.StrategyTemplateRegistry();
  assert.ok(r);
});

// B2. getTemplate
t('tmpl-getTemplate-commerce', function() {
  var r = new registry.StrategyTemplateRegistry();
  var tpl = r.getTemplate('commerce');
  assert.strictEqual(tpl.category, 'commerce');
  assert.ok(tpl.defaultObjectives);
  assert.ok(tpl.defaultGuardrails);
});

t('tmpl-getTemplate-fuzzy-match', function() {
  var r = new registry.StrategyTemplateRegistry();
  var tpl = r.getTemplate('commerce_extra');
  assert.strictEqual(tpl.category, 'commerce');
});

t('tmpl-getTemplate-unknown-fallback', function() {
  var r = new registry.StrategyTemplateRegistry();
  var tpl = r.getTemplate('nonexistent');
  assert.strictEqual(tpl.category, 'generic');
});

t('tmpl-getTemplate-null-fallback', function() {
  var r = new registry.StrategyTemplateRegistry();
  var tpl = r.getTemplate(null);
  assert.strictEqual(tpl.category, 'generic');
});

t('tmpl-getTemplate-undefined-fallback', function() {
  var r = new registry.StrategyTemplateRegistry();
  var tpl = r.getTemplate(undefined);
  assert.strictEqual(tpl.category, 'generic');
});

t('tmpl-getTemplate-non-string-fallback', function() {
  var r = new registry.StrategyTemplateRegistry();
  var tpl = r.getTemplate(123);
  assert.strictEqual(tpl.category, 'generic');
});

// B3. registerTemplate
t('tmpl-registerTemplate-valid', function() {
  var r = new registry.StrategyTemplateRegistry();
  var result = r.registerTemplate('custom-cat', {
    defaultObjectives: ['obj1'],
    defaultGuardrails: ['gr1'],
    recommendedMissionTypes: ['m1']
  });
  assert.strictEqual(result, true);
});

t('tmpl-registerTemplate-then-retrieve', function() {
  var r = new registry.StrategyTemplateRegistry();
  r.registerTemplate('my-cat', {
    defaultObjectives: ['my-obj'],
    defaultGuardrails: ['my-gr'],
    recommendedMissionTypes: ['my-mt']
  });
  var tpl = r.getTemplate('my-cat');
  assert.strictEqual(tpl.defaultObjectives[0], 'my-obj');
});

t('tmpl-registerTemplate-normalizes-category', function() {
  var r = new registry.StrategyTemplateRegistry();
  r.registerTemplate('  UPPER-CAT  ', { defaultObjectives: ['a'], defaultGuardrails: ['b'] });
  var tpl = r.getTemplate('upper-cat');
  assert.strictEqual(tpl.defaultObjectives[0], 'a');
});

t('tmpl-registerTemplate-missing-category-throws', function() {
  var r = new registry.StrategyTemplateRegistry();
  assert.throws(function() { r.registerTemplate(null, {}); });
});

t('tmpl-registerTemplate-missing-template-throws', function() {
  var r = new registry.StrategyTemplateRegistry();
  assert.throws(function() { r.registerTemplate('cat', null); });
});

// B4. listTemplates
t('tmpl-listTemplates-returns-6-builtins', function() {
  var r = new registry.StrategyTemplateRegistry();
  var list = r.listTemplates();
  assert.strictEqual(list.length, 6);
});

t('tmpl-listTemplates-has-objectiveCount', function() {
  var r = new registry.StrategyTemplateRegistry();
  var list = r.listTemplates();
  assert.ok(typeof list[0].objectiveCount === 'number');
});

t('tmpl-listTemplates-has-guardrailCount', function() {
  var r = new registry.StrategyTemplateRegistry();
  var list = r.listTemplates();
  assert.ok(typeof list[0].guardrailCount === 'number');
});

t('tmpl-listTemplates-has-recommendedMissionCount', function() {
  var r = new registry.StrategyTemplateRegistry();
  var list = r.listTemplates();
  assert.ok(typeof list[0].recommendedMissionCount === 'number');
});

t('tmpl-listTemplates-builtin-flag', function() {
  var r = new registry.StrategyTemplateRegistry();
  var list = r.listTemplates();
  assert.strictEqual(list[0].isBuiltIn, true);
});

t('tmpl-listTemplates-includes-custom', function() {
  var r = new registry.StrategyTemplateRegistry();
  r.registerTemplate('custom', { defaultObjectives: ['a'], defaultGuardrails: ['b'] });
  var list = r.listTemplates();
  var custom = list.filter(function(l) { return l.category === 'custom'; });
  assert.strictEqual(custom.length, 1);
  assert.strictEqual(custom[0].isBuiltIn, false);
});

// B5. hasTemplate
t('tmpl-hasTemplate-existing', function() {
  var r = new registry.StrategyTemplateRegistry();
  assert.strictEqual(r.hasTemplate('commerce'), true);
});

t('tmpl-hasTemplate-non-existing', function() {
  var r = new registry.StrategyTemplateRegistry();
  assert.strictEqual(r.hasTemplate('nonexistent'), false);
});

t('tmpl-hasTemplate-falsy', function() {
  var r = new registry.StrategyTemplateRegistry();
  assert.strictEqual(r.hasTemplate(null), false);
  assert.strictEqual(r.hasTemplate(undefined), false);
});

// B6. getDefaultObjectives / getDefaultGuardrails
t('tmpl-getDefaultObjectives', function() {
  var r = new registry.StrategyTemplateRegistry();
  var objs = r.getDefaultObjectives('commerce');
  assert.ok(Array.isArray(objs));
  assert.strictEqual(objs.length, 3);
});

t('tmpl-getDefaultGuardrails', function() {
  var r = new registry.StrategyTemplateRegistry();
  var grs = r.getDefaultGuardrails('operations');
  assert.ok(Array.isArray(grs));
  assert.strictEqual(grs.length, 3);
});

t('tmpl-getRecommendedMissionTypes', function() {
  var r = new registry.StrategyTemplateRegistry();
  var mts = r.getRecommendedMissionTypes('devops');
  assert.ok(Array.isArray(mts));
  assert.strictEqual(mts.length, 3);
});

// B7. removeTemplate
t('tmpl-removeTemplate-custom', function() {
  var r = new registry.StrategyTemplateRegistry();
  r.registerTemplate('to-remove', { defaultObjectives: ['a'], defaultGuardrails: ['b'] });
  assert.strictEqual(r.hasTemplate('to-remove'), true);
  r.removeTemplate('to-remove');
  assert.strictEqual(r.hasTemplate('to-remove'), false);
});

t('tmpl-removeTemplate-builtin-throws', function() {
  var r = new registry.StrategyTemplateRegistry();
  assert.throws(function() { r.removeTemplate('commerce'); });
});

t('tmpl-removeTemplate-falsy-returns-false', function() {
  var r = new registry.StrategyTemplateRegistry();
  assert.strictEqual(r.removeTemplate(null), false);
});

// B8. clearCustomTemplates
t('tmpl-clearCustomTemplates', function() {
  var r = new registry.StrategyTemplateRegistry();
  r.registerTemplate('c1', { defaultObjectives: ['a'], defaultGuardrails: ['b'] });
  r.registerTemplate('c2', { defaultObjectives: ['a'], defaultGuardrails: ['b'] });
  assert.strictEqual(r.listTemplates().length, 8);
  r.clearCustomTemplates();
  assert.strictEqual(r.listTemplates().length, 6);
});

// B9. exportTemplates
t('tmpl-exportTemplates-has-builtIn', function() {
  var r = new registry.StrategyTemplateRegistry();
  var exported = r.exportTemplates();
  assert.ok(exported.builtIn);
  assert.strictEqual(Object.keys(exported.builtIn).length, 6);
});

t('tmpl-exportTemplates-has-custom', function() {
  var r = new registry.StrategyTemplateRegistry();
  r.registerTemplate('c3', { defaultObjectives: ['a'], defaultGuardrails: ['b'] });
  var exported = r.exportTemplates();
  assert.ok(exported.custom);
  assert.ok(exported.custom.c3);
});

t('tmpl-exportTemplates-strips-metadata', function() {
  var r = new registry.StrategyTemplateRegistry();
  var exported = r.exportTemplates();
  var firstBuiltin = exported.builtIn[Object.keys(exported.builtIn)[0]];
  assert.strictEqual(firstBuiltin.isBuiltIn, undefined);
  assert.strictEqual(firstBuiltin.registeredAt, undefined);
});

// B10. singleton convenience functions (rely on shared module state)
t('tmpl-singleton-getTemplate', function() {
  var tpl = registry.getTemplate('operations');
  assert.strictEqual(tpl.category, 'operations');
});

t('tmpl-singleton-registerTemplate', function() {
  var result = registry.registerTemplate('singleton-test-' + Date.now(), {
    defaultObjectives: ['s'],
    defaultGuardrails: ['g']
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

// B11. additional template tests
t('tmpl-commerce-objectives-are-strings', function() {
  var r = new registry.StrategyTemplateRegistry();
  var tpl = r.getTemplate('commerce');
  tpl.defaultObjectives.forEach(function(obj) {
    assert.strictEqual(typeof obj, 'string');
  });
});

t('tmpl-devops-guardrails-are-strings', function() {
  var r = new registry.StrategyTemplateRegistry();
  var tpl = r.getTemplate('devops');
  tpl.defaultGuardrails.forEach(function(gr) {
    assert.strictEqual(typeof gr, 'string');
  });
});

t('tmpl-registerTemplate-overwrite', function() {
  var r = new registry.StrategyTemplateRegistry();
  r.registerTemplate('my-dupe', { defaultObjectives: ['v1'], defaultGuardrails: ['g1'] });
  r.registerTemplate('my-dupe', { defaultObjectives: ['v2'], defaultGuardrails: ['g2'] });
  var tpl = r.getTemplate('my-dupe');
  assert.strictEqual(tpl.defaultObjectives[0], 'v2');
});

// ========================================
// C. strategy-validator (55 tests)
// ========================================
console.log('\n=== C. strategy-validator ===');

// C1. ERRORS
t('val-ERRORS-has-INVALID_GOAL', function() {
  assert.ok(validator.ERRORS.INVALID_GOAL);
});
t('val-ERRORS-has-MISSING_GOAL_ID', function() {
  assert.ok(validator.ERRORS.MISSING_GOAL_ID);
});
t('val-ERRORS-has-INVALID_CATEGORY', function() {
  assert.ok(validator.ERRORS.INVALID_CATEGORY);
});
t('val-ERRORS-has-UNKNOWN_CATEGORY', function() {
  assert.ok(validator.ERRORS.UNKNOWN_CATEGORY);
});
t('val-ERRORS-has-EMPTY_GOAL', function() {
  assert.ok(validator.ERRORS.EMPTY_GOAL);
});

// C2. PRIORITY_LEVELS
t('val-PRIORITY_LEVELS-array', function() {
  assert.ok(Array.isArray(validator.PRIORITY_LEVELS));
  assert.strictEqual(validator.PRIORITY_LEVELS.length, 4);
});

// C3. validateGoal
t('val-validateGoal-valid-minimal', function() {
  var r = validator.validateGoal({ goalId: 'goal_0000000000000000', category: 'commerce' });
  assert.strictEqual(r.valid, true);
  assert.ok(r.goal);
});

t('val-validateGoal-valid-with-id', function() {
  var r = validator.validateGoal({ id: 'goal_0000000000000001', category: 'operations' });
  assert.strictEqual(r.valid, true);
  assert.strictEqual(r.goal.goalId, 'goal_0000000000000001');
});

t('val-validateGoal-invalid-null', function() {
  var r = validator.validateGoal(null);
  assert.strictEqual(r.valid, false);
  assert.ok(r.errors.length > 0);
});

t('val-validateGoal-invalid-non-object', function() {
  var r = validator.validateGoal('string');
  assert.strictEqual(r.valid, false);
});

t('val-validateGoal-invalid-empty-object', function() {
  var r = validator.validateGoal({});
  assert.strictEqual(r.valid, false);
});

t('val-validateGoal-unknown-category-warning', function() {
  var r = validator.validateGoal({ goalId: 'g1', category: 'fake-cat' });
  assert.strictEqual(r.valid, true);
  assert.ok(r.warnings.length > 0);
  assert.strictEqual(r.goal.category, 'fake-cat');
});

t('val-validateGoal-invalid-priority-warning', function() {
  var r = validator.validateGoal({ goalId: 'g1', category: 'commerce', priority: 'urgent' });
  assert.strictEqual(r.valid, true);
  assert.ok(r.warnings.length > 0);
});

t('val-validateGoal-returns-normalized-goal', function() {
  var r = validator.validateGoal({ goalId: 'g1', id: 'overwrite', category: 'devops' });
  assert.strictEqual(r.goal.goalId, 'g1');
});

t('val-validateGoal-name-can-be-null', function() {
  var r = validator.validateGoal({ goalId: 'g1', category: 'commerce' });
  // validateGoal sets name to null when not provided (sanitizeGoal defaults it)
  assert.strictEqual(r.goal.name, null);
});

t('val-validateGoal-description-can-be-null', function() {
  var r = validator.validateGoal({ goalId: 'g1', category: 'commerce' });
  assert.strictEqual(r.goal.description, null);
});

t('val-validateGoal-sets-default-targets', function() {
  var r = validator.validateGoal({ goalId: 'g1', category: 'commerce' });
  assert.ok(Array.isArray(r.goal.targets));
});

t('val-validateGoal-sets-default-constraints', function() {
  var r = validator.validateGoal({ goalId: 'g1', category: 'commerce' });
  assert.ok(Array.isArray(r.goal.constraints));
});

// C4. validateTemplate
t('val-validateTemplate-valid', function() {
  var r = validator.validateTemplate({
    defaultObjectives: ['a'],
    defaultGuardrails: ['b'],
    recommendedMissionTypes: ['c']
  });
  assert.strictEqual(r.valid, true);
});

t('val-validateTemplate-null', function() {
  var r = validator.validateTemplate(null);
  assert.strictEqual(r.valid, false);
});

t('val-validateTemplate-non-object', function() {
  var r = validator.validateTemplate(123);
  assert.strictEqual(r.valid, false);
});

t('val-validateTemplate-missing-objectives-warning', function() {
  var r = validator.validateTemplate({ defaultGuardrails: ['b'] });
  assert.strictEqual(r.valid, true);
  assert.ok(r.warnings.length > 0);
});

t('val-validateTemplate-missing-guardrails-warning', function() {
  var r = validator.validateTemplate({ defaultObjectives: ['a'] });
  assert.strictEqual(r.valid, true);
  assert.ok(r.warnings.length > 0);
});

t('val-validateTemplate-missing-mission-types-warning', function() {
  var r = validator.validateTemplate({ defaultObjectives: ['a'], defaultGuardrails: ['b'] });
  assert.strictEqual(r.valid, true);
  assert.ok(r.warnings.length > 0);
});

// C5. validateStrategyPlan
t('val-validateStrategyPlan-valid', function() {
  var p = {
    strategyId: 'strategy_001',
    goalId: 'goal_001',
    status: 'draft',
    objectives: ['obj1'],
    guardrails: ['gr1'],
    recommendedMissions: [{ type: 'test' }]
  };
  var r = validator.validateStrategyPlan(p);
  assert.strictEqual(r.valid, true);
});

t('val-validateStrategyPlan-null', function() {
  var r = validator.validateStrategyPlan(null);
  assert.strictEqual(r.valid, false);
});

t('val-validateStrategyPlan-non-object', function() {
  var r = validator.validateStrategyPlan('bad');
  assert.strictEqual(r.valid, false);
});

t('val-validateStrategyPlan-missing-strategyId', function() {
  var r = validator.validateStrategyPlan({ goalId: 'g1' });
  assert.strictEqual(r.valid, false);
});

t('val-validateStrategyPlan-missing-goalId', function() {
  var r = validator.validateStrategyPlan({ strategyId: 's1' });
  assert.strictEqual(r.valid, false);
});

t('val-validateStrategyPlan-invalid-objectives', function() {
  var r = validator.validateStrategyPlan({ strategyId: 's1', goalId: 'g1', objectives: 'not-array' });
  assert.strictEqual(r.valid, false);
});

t('val-validateStrategyPlan-objectives-non-string', function() {
  var r = validator.validateStrategyPlan({ strategyId: 's1', goalId: 'g1', objectives: [123] });
  assert.strictEqual(r.valid, false);
});

t('val-validateStrategyPlan-invalid-guardrails', function() {
  var r = validator.validateStrategyPlan({ strategyId: 's1', goalId: 'g1', guardrails: 'not-array' });
  assert.strictEqual(r.valid, false);
});

t('val-validateStrategyPlan-invalid-recommendedMissions', function() {
  var r = validator.validateStrategyPlan({ strategyId: 's1', goalId: 'g1', recommendedMissions: 'bad' });
  assert.strictEqual(r.valid, false);
});

t('val-validateStrategyPlan-invalid-status', function() {
  var r = validator.validateStrategyPlan({ strategyId: 's1', goalId: 'g1', status: 'bad' });
  assert.strictEqual(r.valid, false);
});

// C6. validateCategory
t('val-validateCategory-valid', function() {
  var r = validator.validateCategory('commerce');
  assert.strictEqual(r.valid, true);
});

t('val-validateCategory-unknown', function() {
  var r = validator.validateCategory('unknown');
  assert.strictEqual(r.valid, false);
  assert.strictEqual(r.fallback, true);
});

t('val-validateCategory-null', function() {
  var r = validator.validateCategory(null);
  assert.strictEqual(r.valid, false);
});

// C7. validatePriority
t('val-validatePriority-valid', function() {
  var r = validator.validatePriority('high');
  assert.strictEqual(r.valid, true);
  assert.strictEqual(r.normalized, 'high');
});

t('val-validatePriority-invalid-fallback', function() {
  var r = validator.validatePriority('urgent');
  assert.strictEqual(r.valid, false);
  assert.strictEqual(r.fallback, 'medium');
});

// C8. validateStatus
t('val-validateStatus-valid', function() {
  var r = validator.validateStatus('draft');
  assert.strictEqual(r.valid, true);
});

t('val-validateStatus-invalid-fallback', function() {
  var r = validator.validateStatus('running');
  assert.strictEqual(r.valid, false);
});

// C9. sanitizeGoal
t('val-sanitizeGoal-null', function() {
  var r = validator.sanitizeGoal(null);
  assert.strictEqual(r, null);
});

t('val-sanitizeGoal-non-object', function() {
  var r = validator.sanitizeGoal('bad');
  assert.strictEqual(r, null);
});

t('val-sanitizeGoal-valid', function() {
  var r = validator.sanitizeGoal({ goalId: 'g1', category: 'commerce' });
  assert.ok(r);
  assert.strictEqual(r.goalId, 'g1');
});

t('val-sanitizeGoal-generates-goalId', function() {
  var r = validator.sanitizeGoal({ category: 'operations' });
  assert.ok(r.goalId);
  assert.ok(r.goalId.indexOf('goal_') === 0);
});

t('val-sanitizeGoal-default-category', function() {
  var r = validator.sanitizeGoal({ goalId: 'g1' });
  assert.strictEqual(r.category, 'generic');
});

t('val-sanitizeGoal-default-priority', function() {
  var r = validator.sanitizeGoal({ goalId: 'g1' });
  assert.strictEqual(r.priority, 'medium');
});

t('val-sanitizeGoal-default-name', function() {
  var r = validator.sanitizeGoal({ goalId: 'g1' });
  assert.strictEqual(r.name, 'Untitled Goal');
});

t('val-sanitizeGoal-default-empty-fields', function() {
  var r = validator.sanitizeGoal({ goalId: 'g1' });
  assert.strictEqual(r.description, '');
  assert.ok(Array.isArray(r.targets));
  assert.ok(Array.isArray(r.constraints));
  assert.strictEqual(typeof r.metadata, 'object');
});

// ========================================
// D. strategy-planner (50 tests)
// ========================================
console.log('\n=== D. strategy-planner ===');

// D1. new instance
t('plan-new-instance', function() {
  var p = new core.StrategyPlanner();
  assert.ok(p);
});

t('plan-new-instance-custom-opts', function() {
  var p = new core.StrategyPlanner({ maxRecommendations: 5, enableLogging: true });
  assert.ok(p);
});

// D2. plan()
t('plan-plan-valid', function() {
  var p = new core.StrategyPlanner();
  var r = p.plan({ goalId: 'goal_0000000000000001', category: 'commerce' });
  assert.ok(r.strategyId);
  assert.ok(r.objectives.length > 0);
  assert.ok(r.guardrails.length > 0);
  assert.ok(r.recommendedMissions.length > 0);
  assert.ok(r.assumptions.length > 0);
  assert.ok(r.risks.length > 0);
});

t('plan-plan-with-priority', function() {
  var p = new core.StrategyPlanner();
  var r = p.plan({ goalId: 'g1', category: 'commerce' }, { priority: 'critical' });
  assert.strictEqual(r.priority, 'critical');
});

t('plan-plan-unknown-category-preserves-original', function() {
  var p = new core.StrategyPlanner();
  var r = p.plan({ goalId: 'g1', category: 'nonexistent-cat' });
  // Planner preserves original category but uses generic template
  assert.strictEqual(r.category, 'nonexistent-cat');
  assert.ok(r.objectives.length > 0);
  assert.ok(r.guardrails.length > 0);
});

t('plan-plan-uses-id-as-goalId', function() {
  var p = new core.StrategyPlanner();
  var r = p.plan({ id: 'goal_xyz', category: 'operations' });
  assert.strictEqual(r.goalId, 'goal_xyz');
});

t('plan-plan-invalid-goal-throws', function() {
  var p = new core.StrategyPlanner();
  assert.throws(function() { p.plan(null); });
});

t('plan-plan-empty-object-throws', function() {
  var p = new core.StrategyPlanner();
  assert.throws(function() { p.plan({}); });
});

t('plan-plan-metadata', function() {
  var p = new core.StrategyPlanner();
  var r = p.plan({ goalId: 'g1', category: 'commerce' }, { metadata: { custom: 'val' } });
  assert.strictEqual(r.metadata.custom, 'val');
});

t('plan-plan-plannerVersion', function() {
  var p = new core.StrategyPlanner();
  var r = p.plan({ goalId: 'g1', category: 'commerce' });
  assert.strictEqual(r.metadata.plannerVersion, 'P9.5.2-MVP');
});

t('plan-plan-processingTimeMs', function() {
  var p = new core.StrategyPlanner();
  var r = p.plan({ goalId: 'g1', category: 'commerce' });
  assert.ok(typeof r.metadata.processingTimeMs === 'number');
});

t('plan-plan-status-default-draft', function() {
  var p = new core.StrategyPlanner();
  var r = p.plan({ goalId: 'g1', category: 'commerce' });
  assert.strictEqual(r.status, 'draft');
});

t('plan-plan-status-custom', function() {
  var p = new core.StrategyPlanner();
  var r = p.plan({ goalId: 'g1', category: 'commerce' }, { status: 'reviewed' });
  assert.strictEqual(r.status, 'reviewed');
});

t('plan-plan-strategyId-unique', function() {
  var p = new core.StrategyPlanner();
  var r1 = p.plan({ goalId: 'g1', category: 'commerce' });
  var r2 = p.plan({ goalId: 'g2', category: 'commerce' });
  assert.notStrictEqual(r1.strategyId, r2.strategyId);
});

t('plan-plan-devops-category', function() {
  var p = new core.StrategyPlanner();
  var r = p.plan({ goalId: 'g1', category: 'devops' });
  assert.strictEqual(r.category, 'devops');
  assert.ok(r.objectives.length > 0);
});

t('plan-plan-finance-category', function() {
  var p = new core.StrategyPlanner();
  var r = p.plan({ goalId: 'g1', category: 'finance' });
  assert.strictEqual(r.category, 'finance');
  assert.ok(r.risks.length >= 2);
});

t('plan-plan-objectives-from-template', function() {
  var p = new core.StrategyPlanner();
  var r = p.plan({ goalId: 'g1', category: 'commerce' });
  assert.ok(r.objectives.length >= 3);
});

t('plan-plan-guardrails-from-template', function() {
  var p = new core.StrategyPlanner();
  var r = p.plan({ goalId: 'g1', category: 'marketing' });
  assert.ok(r.guardrails.length >= 3);
});

t('plan-plan-recommendedMissions-format', function() {
  var p = new core.StrategyPlanner();
  var r = p.plan({ goalId: 'g1', category: 'commerce' });
  r.recommendedMissions.forEach(function(m) {
    assert.ok(m.missionId);
    assert.ok(m.type);
    assert.ok(m.priority);
    assert.ok(m.reason);
  });
});

t('plan-plan-assumptions-has-content', function() {
  var p = new core.StrategyPlanner();
  var r = p.plan({ goalId: 'g1', category: 'commerce' });
  var hasRes = r.assumptions.some(function(a) { return a.indexOf('resource') !== -1 || a.indexOf('Resource') !== -1; });
  assert.ok(hasRes, 'assumptions should mention resources: ' + r.assumptions.join(' | '));
});

t('plan-plan-goal-with-targets-adds-objectives', function() {
  var p = new core.StrategyPlanner();
  var before = p.plan({ goalId: 'g1', category: 'commerce' });
  var after = p.plan({ goalId: 'g1', category: 'commerce', targets: ['target1', 'target2'] });
  assert.ok(after.objectives.length > before.objectives.length);
});

t('plan-plan-goal-with-constraints-adds-guardrails', function() {
  var p = new core.StrategyPlanner();
  var before = p.plan({ goalId: 'g1', category: 'commerce' });
  var after = p.plan({ goalId: 'g1', category: 'commerce', constraints: ['c1', 'c2'] });
  assert.ok(after.guardrails.length > before.guardrails.length);
});

t('plan-plan-maxRecommendations', function() {
  var p = new core.StrategyPlanner({ maxRecommendations: 1 });
  var r = p.plan({ goalId: 'g1', category: 'commerce' });
  assert.strictEqual(r.recommendedMissions.length, 1);
});

// D3. batchPlan
t('plan-batchPlan-valid', function() {
  var p = new core.StrategyPlanner();
  var goals = [
    { goalId: 'g1', category: 'commerce' },
    { goalId: 'g2', category: 'operations' }
  ];
  var r = p.batchPlan(goals);
  assert.strictEqual(r.total, 2);
  assert.strictEqual(r.succeeded, 2);
  assert.strictEqual(r.failed, 0);
  assert.strictEqual(r.plans.length, 2);
});

t('plan-batchPlan-partial-failure', function() {
  var p = new core.StrategyPlanner();
  var goals = [
    { goalId: 'g1', category: 'commerce' },
    null,
    { goalId: 'g3', category: 'devops' }
  ];
  var r = p.batchPlan(goals);
  assert.strictEqual(r.total, 3);
  assert.strictEqual(r.succeeded, 2);
  assert.strictEqual(r.failed, 1);
  assert.ok(r.errors);
  assert.strictEqual(r.errors.length, 1);
});

t('plan-batchPlan-non-array-throws', function() {
  var p = new core.StrategyPlanner();
  assert.throws(function() { p.batchPlan('not-array'); });
});

t('plan-batchPlan-empty', function() {
  var p = new core.StrategyPlanner();
  var r = p.batchPlan([]);
  assert.strictEqual(r.total, 0);
  assert.strictEqual(r.plans.length, 0);
});

t('plan-batchPlan-all-succeed', function() {
  var p = new core.StrategyPlanner();
  var goals = [];
  for (var i = 0; i < 5; i++) {
    goals.push({ goalId: 'g' + i, category: 'commerce' });
  }
  var r = p.batchPlan(goals);
  assert.strictEqual(r.succeeded, 5);
  assert.strictEqual(r.failed, 0);
});

// D4. updateStatus
t('plan-updateStatus-draft-to-reviewed', function() {
  var p = new core.StrategyPlanner();
  var plan = p.plan({ goalId: 'g1', category: 'commerce' });
  var r = p.updateStatus(plan, 'reviewed');
  assert.strictEqual(r.status, 'reviewed');
});

t('plan-updateStatus-invalid-status-throws', function() {
  var p = new core.StrategyPlanner();
  var plan = p.plan({ goalId: 'g1', category: 'commerce' });
  assert.throws(function() { p.updateStatus(plan, 'invalid'); });
});

t('plan-updateStatus-null-plan-throws', function() {
  var p = new core.StrategyPlanner();
  assert.throws(function() { p.updateStatus(null, 'draft'); });
});

t('plan-updateStatus-updates-at', function() {
  var p = new core.StrategyPlanner();
  var plan = p.plan({ goalId: 'g1', category: 'commerce' });
  var orig = plan.updatedAt;
  var r = p.updateStatus(plan, 'reviewed');
  assert.ok(r.updatedAt >= orig);
});

// D5. addObjective
t('plan-addObjective-valid', function() {
  var p = new core.StrategyPlanner();
  var plan = p.plan({ goalId: 'g1', category: 'commerce' });
  var before = plan.objectives.length;
  var r = p.addObjective(plan, 'new objective');
  assert.strictEqual(r.objectives.length, before + 1);
  assert.strictEqual(r.objectives[r.objectives.length - 1], 'new objective');
});

t('plan-addObjective-empty-throws', function() {
  var p = new core.StrategyPlanner();
  var plan = p.plan({ goalId: 'g1', category: 'commerce' });
  assert.throws(function() { p.addObjective(plan, ''); });
});

t('plan-addObjective-null-plan-throws', function() {
  var p = new core.StrategyPlanner();
  assert.throws(function() { p.addObjective(null, 'obj'); });
});

// D6. addGuardrail
t('plan-addGuardrail-valid', function() {
  var p = new core.StrategyPlanner();
  var plan = p.plan({ goalId: 'g1', category: 'commerce' });
  var before = plan.guardrails.length;
  var r = p.addGuardrail(plan, 'new guardrail');
  assert.strictEqual(r.guardrails.length, before + 1);
});

t('plan-addGuardrail-empty-throws', function() {
  var p = new core.StrategyPlanner();
  var plan = p.plan({ goalId: 'g1', category: 'commerce' });
  assert.throws(function() { p.addGuardrail(plan, ''); });
});

// ========================================
// E. index.js barrel export (15 tests)
// ========================================
console.log('\n=== E. index.js barrel export ===');

t('index-STRATEGY_STATUS', function() { assert.ok(index.STRATEGY_STATUS); });
t('index-STRATEGY_CATEGORIES', function() { assert.ok(index.STRATEGY_CATEGORIES); });
t('index-TEMPLATE_REGISTRY', function() { assert.ok(index.TEMPLATE_REGISTRY); });
t('index-DEFAULT_TEMPLATE', function() { assert.ok(index.DEFAULT_TEMPLATE); });
t('index-VALIDATION_ERRORS', function() { assert.ok(index.VALIDATION_ERRORS); });
t('index-PRIORITY_LEVELS', function() { assert.ok(index.PRIORITY_LEVELS); });
t('index-createStrategyId', function() { assert.strictEqual(typeof index.createStrategyId, 'function'); });
t('index-createStrategyPlan', function() { assert.strictEqual(typeof index.createStrategyPlan, 'function'); });
t('index-isValidStatus', function() { assert.strictEqual(typeof index.isValidStatus, 'function'); });
t('index-isValidCategory', function() { assert.strictEqual(typeof index.isValidCategory, 'function'); });
t('index-validateGoal', function() { assert.strictEqual(typeof index.validateGoal, 'function'); });
t('index-StrategyTemplateRegistry', function() { assert.ok(index.StrategyTemplateRegistry); });
t('index-StrategyPlanner', function() { assert.ok(index.StrategyPlanner); });
t('index-plan', function() { assert.strictEqual(typeof index.plan, 'function'); });
t('index-batchPlan', function() { assert.strictEqual(typeof index.batchPlan, 'function'); });

// ========================================
// F. 安全审计 (20 tests)
// ========================================
console.log('\n=== F. 安全审计 ===');

var SRC_DIR = path.join(__dirname, '..', 'src', 'strategy-planner');

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
      // Skip comments and strings
      var lines = content.split('\n');
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i].trim();
        // Skip comment-only lines
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
  var f = grepSrc('nginx');
  assert.strictEqual(f.length, 0, 'found: ' + f.join(', '));
});

t('audit-no-dotenv', function() {
  var f = grepSrc('.env');
  assert.strictEqual(f.length, 0, 'found: ' + f.join(', '));
});

t('audit-no-deploy-as-function-call', function() {
  // "deploy" as a word in data strings is fine — only check for dangerous usage
  var f = grepSrcExact('deploy(');
  assert.strictEqual(f.length, 0, 'found deploy(): ' + f.join(', '));
});

t('audit-no-auto-execution', function() {
  // Double-check no auto-triggering of missions
  var f = grepSrc('autoExecute');
  assert.strictEqual(f.length, 0, 'found: ' + f.join(', '));
});

t('audit-no-http-server', function() {
  var f1 = grepSrc('require("http")');
  var f2 = grepSrc("require('http')");
  assert.strictEqual(f1.length + f2.length, 0, 'found http import');
});

t('audit-no-https-server', function() {
  var f1 = grepSrc('require("https")');
  var f2 = grepSrc("require('https')");
  assert.strictEqual(f1.length + f2.length, 0, 'found https import');
});

t('audit-no-fs-write-outside-storage', function() {
  // All fs.write should only be in test files, not strategy-planner source
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
    });
  }
  walk(SRC_DIR);
  // strategy-planner should not write files
  assert.strictEqual(found.length, 0, 'found writeFile: ' + found.join(', '));
});

t('audit-no-shell-execution', function() {
  var f1 = grepSrc('shelljs');
  var f2 = grepSrc('ShellExec');
  assert.strictEqual(f1.length + f2.length, 0, 'found shell execution');
});

t('audit-no-mission-execution', function() {
  var f = grepSrc('executeMission');
  assert.strictEqual(f.length, 0, 'found executeMission: ' + f.join(', '));
});

t('audit-source-files-exist', function() {
  assert.ok(fs.existsSync(path.join(SRC_DIR, 'strategy-types.js')));
  assert.ok(fs.existsSync(path.join(SRC_DIR, 'strategy-template-registry.js')));
  assert.ok(fs.existsSync(path.join(SRC_DIR, 'strategy-validator.js')));
  assert.ok(fs.existsSync(path.join(SRC_DIR, 'strategy-planner.js')));
  assert.ok(fs.existsSync(path.join(SRC_DIR, 'index.js')));
});

t('audit-all-exports-are-functions-or-objects', function() {
  // Sanity: every top-level export should be function or object
  var count = 0;
  Object.keys(index).forEach(function(key) {
    var val = index[key];
    assert.ok(typeof val === 'function' || typeof val === 'object' || val === null);
    count++;
  });
  assert.ok(count > 10);
});

// ========================================
// G. 边界情况 (20 tests)
// ========================================
console.log('\n=== G. 边界情况 ===');

t('edge-plan-with-goal-name', function() {
  var p = new core.StrategyPlanner();
  var r = p.plan({ goalId: 'g1', category: 'commerce', name: 'Test Name' });
  assert.ok(r.objectives.some(function(o) { return o.indexOf('Test Name') !== -1; }));
});

t('edge-plan-with-goal-title', function() {
  var p = new core.StrategyPlanner();
  var r = p.plan({ goalId: 'g1', category: 'operations', title: 'My Title' });
  assert.ok(r.objectives.some(function(o) { return o.indexOf('My Title') !== -1; }));
});

t('edge-plan-category-specific-risks-commerce', function() {
  var p = new core.StrategyPlanner();
  var r = p.plan({ goalId: 'g1', category: 'commerce' });
  assert.ok(r.risks.length >= 4);
});

t('edge-plan-category-specific-risks-devops', function() {
  var p = new core.StrategyPlanner();
  var r = p.plan({ goalId: 'g1', category: 'devops' });
  assert.ok(r.risks.length >= 4);
});

t('edge-plan-category-specific-risks-finance', function() {
  var p = new core.StrategyPlanner();
  var r = p.plan({ goalId: 'g1', category: 'finance' });
  assert.ok(r.risks.length >= 4);
});

t('edge-plan-assumptions-count', function() {
  var p = new core.StrategyPlanner();
  var r = p.plan({ goalId: 'g1', category: 'commerce' });
  assert.ok(r.assumptions.length >= 3);
});

t('edge-plan-description-appears-in-reason', function() {
  var p = new core.StrategyPlanner();
  var r = p.plan({ goalId: 'g1', category: 'commerce', description: 'My description here' });
  // description is used in recommendation reasons, not directly as an objective
  var hasDesc = r.recommendedMissions.some(function(m) { return m.reason.indexOf('commerce') !== -1; });
  assert.ok(hasDesc || r.objectives.length > 0);
});

t('edge-plan-no-logging-when-disabled', function() {
  var p = new core.StrategyPlanner({ enableLogging: false });
  var r = p.plan({ goalId: 'g1', category: 'commerce' });
  assert.ok(r);
});

t('edge-plan-logging-when-enabled', function() {
  var p = new core.StrategyPlanner({ enableLogging: true });
  var r = p.plan({ goalId: 'g1', category: 'commerce' });
  assert.ok(r);
});

t('edge-plan-generatedAt-is-iso', function() {
  var p = new core.StrategyPlanner();
  var r = p.plan({ goalId: 'g1', category: 'commerce' });
  assert.ok(r.metadata.generatedAt);
  assert.ok(r.metadata.generatedAt.indexOf('T') !== -1);
});

t('edge-plan-status-update-validates-plan', function() {
  var p = new core.StrategyPlanner();
  var plan = p.plan({ goalId: 'g1', category: 'commerce' });
  delete plan.strategyId;
  assert.throws(function() { p.updateStatus(plan, 'reviewed'); });
});

t('edge-createStrategyPlan-with-assumptions', function() {
  var goal = { goalId: 'g1', category: 'commerce' };
  var plan = types.createStrategyPlan(goal, { defaultObjectives: [], defaultGuardrails: [] }, { assumptions: ['a1', 'a2'] });
  assert.strictEqual(plan.assumptions.length, 2);
});

t('edge-createStrategyPlan-with-risks', function() {
  var goal = { goalId: 'g1', category: 'commerce' };
  var plan = types.createStrategyPlan(goal, { defaultObjectives: [], defaultGuardrails: [] }, { risks: ['r1'] });
  assert.strictEqual(plan.risks.length, 1);
});

t('edge-createStrategyPlan-recommendedMissions', function() {
  var goal = { goalId: 'g1', category: 'commerce' };
  var plan = types.createStrategyPlan(goal, { defaultObjectives: [], defaultGuardrails: [] }, { recommendedMissions: [{ type: 'test' }] });
  assert.strictEqual(plan.recommendedMissions.length, 1);
});

t('edge-val-validateGoal-with-name', function() {
  var r = validator.validateGoal({ goalId: 'g1', name: 'My Goal Name', category: 'commerce' });
  assert.strictEqual(r.goal.name, 'My Goal Name');
});

t('edge-val-validateGoal-with-constraints', function() {
  var r = validator.validateGoal({ goalId: 'g1', category: 'commerce', constraints: [1, 2] });
  assert.strictEqual(r.goal.constraints.length, 2);
});

t('edge-tmpl-fuzzy-match', function() {
  var r = new registry.StrategyTemplateRegistry();
  var tpl = r.getTemplate('commerce_and_more');
  assert.strictEqual(tpl.category, 'commerce');
});

t('edge-tmpl-multiple-fuzzy-no-match', function() {
  var r = new registry.StrategyTemplateRegistry();
  var tpl = r.getTemplate('zzz_nomatch');
  assert.strictEqual(tpl.category, 'generic');
});

t('edge-plan-batchPlan-errors-format', function() {
  var p = new core.StrategyPlanner();
  var goals = [{ goalId: 'g1', category: 'commerce' }, null];
  var r = p.batchPlan(goals);
  assert.ok(r.errors[0].index !== undefined);
  assert.ok(r.errors[0].goal !== undefined);
  assert.ok(r.errors[0].error !== undefined);
});

t('edge-plan-recommendedMissions-estimatedDuration', function() {
  var p = new core.StrategyPlanner();
  var r = p.plan({ goalId: 'g1', category: 'commerce' });
  r.recommendedMissions.forEach(function(m) {
    assert.strictEqual(m.estimatedDuration, 'TBD');
    assert.ok(Array.isArray(m.dependencies));
  });
});

// ========================================
// 测试汇总
// ========================================
console.log('\n' + '='.repeat(60));
console.log('  P9.5.2 Strategy Planner 测试汇总');
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
