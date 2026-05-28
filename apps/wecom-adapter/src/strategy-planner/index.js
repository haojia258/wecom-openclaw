/**
 * P9.5.2 Strategy Planner MVP — index.js
 * Barrel export for strategy-planner module
 */

// Types and constants
const strategyTypes = require('./strategy-types');
const STRATEGY_STATUS = strategyTypes.STRATEGY_STATUS;
const STRATEGY_CATEGORIES = strategyTypes.STRATEGY_CATEGORIES;
const TEMPLATE_REGISTRY = strategyTypes.TEMPLATE_REGISTRY;
const DEFAULT_TEMPLATE = strategyTypes.DEFAULT_TEMPLATE;
const createStrategyId = strategyTypes.createStrategyId;
const createStrategyPlan = strategyTypes.createStrategyPlan;
const isValidStatus = strategyTypes.isValidStatus;
const isValidCategory = strategyTypes.isValidCategory;

// Template registry
const templateRegistryModule = require('./strategy-template-registry');
const StrategyTemplateRegistry = templateRegistryModule.StrategyTemplateRegistry;
const templateRegistry = templateRegistryModule.registry;
const getTemplate = templateRegistryModule.getTemplate;
const registerTemplate = templateRegistryModule.registerTemplate;
const listTemplates = templateRegistryModule.listTemplates;
const hasTemplate = templateRegistryModule.hasTemplate;

// Validator
const validator = require('./strategy-validator');
const VALIDATION_ERRORS = validator.ERRORS;
const PRIORITY_LEVELS = validator.PRIORITY_LEVELS;
const validateGoal = validator.validateGoal;
const validateTemplate = validator.validateTemplate;
const validateStrategyPlan = validator.validateStrategyPlan;
const validateCategory = validator.validateCategory;
const validatePriority = validator.validatePriority;
const validateStatus = validator.validateStatus;
const sanitizeGoal = validator.sanitizeGoal;

// Core planner
const plannerModule = require('./strategy-planner');
const StrategyPlanner = plannerModule.StrategyPlanner;
const planner = plannerModule.planner;
const plan = plannerModule.plan;
const batchPlan = plannerModule.batchPlan;
const updateStatus = plannerModule.updateStatus;
const addObjective = plannerModule.addObjective;
const addGuardrail = plannerModule.addGuardrail;

// Export all
module.exports = {
  // Types
  STRATEGY_STATUS,
  STRATEGY_CATEGORIES,
  TEMPLATE_REGISTRY,
  DEFAULT_TEMPLATE,

  // Factory functions
  createStrategyId,
  createStrategyPlan,
  sanitizeGoal,

  // Validators
  isValidStatus,
  isValidCategory,
  validateGoal,
  validateTemplate,
  validateStrategyPlan,
  validateCategory,
  validatePriority,
  validateStatus,

  // Template registry
  StrategyTemplateRegistry,
  templateRegistry,
  getTemplate,
  registerTemplate,
  listTemplates,
  hasTemplate,

  // Core planner
  StrategyPlanner,
  planner,
  plan,
  batchPlan,
  updateStatus,
  addObjective,
  addGuardrail,

  // Constants
  VALIDATION_ERRORS,
  PRIORITY_LEVELS
};
