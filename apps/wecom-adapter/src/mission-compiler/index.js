/**
 * P9.5.3 Mission Compiler MVP — index.js
 * Barrel export for mission-compiler module
 */

// Types and constants
const types = require('./mission-compiler-types');
const MISSION_DRAFT_STATUS = types.MISSION_DRAFT_STATUS;
const MISSION_CATEGORIES = types.MISSION_CATEGORIES;
const RECOMMENDED_AGENTS = types.RECOMMENDED_AGENTS;
const CATEGORY_AGENT_MAP = types.CATEGORY_AGENT_MAP;
const MISSION_COMPILE_TEMPLATES = types.MISSION_COMPILE_TEMPLATES;
const DEFAULT_MISSION_TEMPLATE = types.DEFAULT_MISSION_TEMPLATE;
const createDraftId = types.createDraftId;
const createMissionDraft = types.createMissionDraft;
const getRecommendedAgent = types.getRecommendedAgent;
const isValidMissionDraftStatus = types.isValidMissionDraftStatus;
const isValidAgent = types.isValidAgent;

// Template registry
const templateRegistryModule = require('./mission-template-registry');
const MissionTemplateRegistry = templateRegistryModule.MissionTemplateRegistry;
const templateRegistry = templateRegistryModule.registry;
const getTemplate = templateRegistryModule.getTemplate;
const registerTemplate = templateRegistryModule.registerTemplate;
const listTemplates = templateRegistryModule.listTemplates;
const hasTemplate = templateRegistryModule.hasTemplate;
const getMissionType = templateRegistryModule.getMissionType;

// Validator
const validator = require('./mission-draft-validator');
const VALIDATION_ERRORS = validator.ERRORS;
const PRIORITY_LEVELS = validator.PRIORITY_LEVELS;
const validateMissionDraft = validator.validateMissionDraft;
const validateStrategyForCompilation = validator.validateStrategyForCompilation;
const validatePriority = validator.validatePriority;
const validateStatus = validator.validateStatus;
const validateAgent = validator.validateAgent;

// Core compiler
const compilerModule = require('./mission-compiler');
const MissionCompiler = compilerModule.MissionCompiler;
const compiler = compilerModule.compiler;
const compileStrategyToMissionDrafts = compilerModule.compileStrategyToMissionDrafts;
const previewMissionDrafts = compilerModule.previewMissionDrafts;
const previewMissionDraftsJson = compilerModule.previewMissionDraftsJson;
const batchCompileStrategies = compilerModule.batchCompileStrategies;
const updateDraftStatus = compilerModule.updateDraftStatus;

// Export all
module.exports = {
  // Types
  MISSION_DRAFT_STATUS,
  MISSION_CATEGORIES,
  RECOMMENDED_AGENTS,
  CATEGORY_AGENT_MAP,
  MISSION_COMPILE_TEMPLATES,
  DEFAULT_MISSION_TEMPLATE,

  // Factory functions
  createDraftId,
  createMissionDraft,
  getRecommendedAgent,

  // Status helpers
  isValidMissionDraftStatus,
  isValidAgent,

  // Template registry
  MissionTemplateRegistry,
  templateRegistry,
  getTemplate,
  registerTemplate,
  listTemplates,
  hasTemplate,
  getMissionType,

  // Validators
  VALIDATION_ERRORS,
  PRIORITY_LEVELS,
  validateMissionDraft,
  validateStrategyForCompilation,
  validatePriority,
  validateStatus,
  validateAgent,

  // Core compiler
  MissionCompiler,
  compiler,
  compileStrategyToMissionDrafts,
  previewMissionDrafts,
  previewMissionDraftsJson,
  batchCompileStrategies,
  updateDraftStatus
};
