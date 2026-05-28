/**
 * P9.5.3 Mission Compiler MVP — mission-compiler.js
 * Core compiler: converts strategy plans to mission drafts
 *
 * This module ONLY creates draft objects — it NEVER:
 * - Creates formal missions
 * - Executes missions
 * - Calls mission commander or API gateway
 * - Writes to mission store
 * - Performs DAG execution
 * - Makes shell/exec/spawn calls
 * - Modifies environment config or reverse-proxy
 */

const types = require('./mission-compiler-types');
const MISSION_DRAFT_STATUS = types.MISSION_DRAFT_STATUS;
const createMissionDraft = types.createMissionDraft;
const createDraftId = types.createDraftId;
const isValidMissionDraftStatus = types.isValidMissionDraftStatus;
const getRecommendedAgent = types.getRecommendedAgent;

const templateRegistryModule = require('./mission-template-registry');
const templateRegistry = templateRegistryModule.registry;
const getTemplate = templateRegistryModule.getTemplate;
const getMissionType = templateRegistryModule.getMissionType;

const validator = require('./mission-draft-validator');
const validateMissionDraft = validator.validateMissionDraft;
const validateStrategyForCompilation = validator.validateStrategyForCompilation;
const ERRORS = validator.ERRORS;

class MissionCompiler {
  constructor(options = {}) {
    this.templateRegistry = options.templateRegistry || templateRegistry;
    this.enableLogging = options.enableLogging || false;
    this.maxDraftsPerStrategy = options.maxDraftsPerStrategy || 20;
  }

  /**
   * Compile a strategy plan to mission drafts
   * Each objective in the strategy plan becomes one mission draft
   * @param {Object} strategyPlan - Strategy plan from P9.5.2
   * @param {Object} options - Compilation options
   * @returns {Object} Compilation result
   */
  compileStrategyToMissionDrafts(strategyPlan, options = {}) {
    const startTime = Date.now();

    // Validate strategy plan
    const strategyValidation = validateStrategyForCompilation(strategyPlan);
    if (!strategyValidation.valid) {
      const err = new Error(`Invalid strategy plan: ${strategyValidation.errors.join(', ')}`);
      err.validationResult = strategyValidation;
      throw err;
    }

    // Get template based on category
    const category = strategyPlan.category || 'generic';
    const template = this.templateRegistry.getTemplate(category);

    // Each objective becomes one draft
    const objectives = strategyPlan.objectives || [];
    const maxDrafts = options.maxDraftsPerStrategy || this.maxDraftsPerStrategy;
    const cappedObjectives = objectives.slice(0, maxDrafts);

    const drafts = [];
    const warnings = [];

    for (let i = 0; i < cappedObjectives.length; i++) {
      const objective = cappedObjectives[i];

      try {
        const draft = this._compileSingleDraft(strategyPlan, objective, template, i, options);
        drafts.push(draft);
      } catch (compileErr) {
        warnings.push({
          index: i,
          objective: objective,
          error: compileErr.message
        });
      }
    }

    if (drafts.length === 0 && cappedObjectives.length > 0) {
      const err = new Error('All objectives failed to compile');
      err.warnings = warnings;
      throw err;
    }

    // Add strategy-wide guardrails warnings if needed
    if (strategyValidation.warnings.length > 0) {
      warnings.push(...strategyValidation.warnings.map(w => ({ type: 'strategy_warning', message: w })));
    }

    // If strategy had no objectives but we still want a result
    if (cappedObjectives.length === 0 && strategyValidation.warnings.some(w => w === ERRORS.EMPTY_STRATEGY_OBJECTIVES)) {
      // Still return empty drafts array — callers should handle this
    }

    this._log('Strategy compiled to mission drafts', {
      strategyId: strategyPlan.strategyId,
      goalId: strategyPlan.goalId,
      category: category,
      draftCount: drafts.length,
      warningCount: warnings.length
    });

    return {
      drafts,
      strategyId: strategyPlan.strategyId,
      goalId: strategyPlan.goalId,
      category: category,
      draftCount: drafts.length,
      warningCount: warnings.length,
      warnings: warnings.length > 0 ? warnings : null,
      processingTimeMs: Date.now() - startTime,
      compilerVersion: 'P9.5.3-MVP'
    };
  }

  /**
   * Compile a single mission draft for one objective
   * @private
   */
  _compileSingleDraft(strategyPlan, objective, template, index, options) {
    const draftId = options.draftIdPrefix
      ? `${options.draftIdPrefix}_${index}`
      : createDraftId();

    const title = options.titleTemplate
      ? options.titleTemplate.replace('{index}', index + 1).replace('{objective}', objective)
      : this._generateDraftTitle(objective, strategyPlan.category, index);

    const draft = createMissionDraft(strategyPlan, template, {
      draftId,
      type: options.type || template.type || 'generic-mission',
      title: title,
      priority: options.priority || strategyPlan.priority || 'medium',
      status: options.status || MISSION_DRAFT_STATUS.DRAFT,
      objective: objective,
      inputs: this._generateInputs(strategyPlan, index),
      guardrails: this._generateGuardrails(strategyPlan, template),
      acceptanceCriteria: this._generateAcceptanceCriteria(strategyPlan, template),
      risks: this._generateRisks(strategyPlan, template),
      metadata: {
        ...(strategyPlan.metadata || {}),
        objectiveIndex: index,
        totalObjectives: (strategyPlan.objectives || []).length,
        compiledAt: new Date().toISOString()
      }
    });

    // Validate the generated draft
    const validation = validateMissionDraft(draft);
    if (!validation.valid) {
      throw new Error(`Draft validation failed: ${validation.errors.join(', ')}`);
    }

    return draft;
  }

  /**
   * Generate draft title
   * @private
   */
  _generateDraftTitle(objective, category, index) {
    if (objective.length <= 40) {
      return objective;
    }
    return objective.substring(0, 37) + '...';
  }

  /**
   * Generate inputs from strategy plan
   * @private
   */
  _generateInputs(strategyPlan, index) {
    return {
      category: strategyPlan.category || 'generic',
      strategyPriority: strategyPlan.priority || 'medium',
      objectiveIndex: index,
      guardrailCount: (strategyPlan.guardrails || []).length,
      recommendationCount: (strategyPlan.recommendedMissions || []).length
    };
  }

  /**
   * Generate guardrails: inherit from strategy + template
   * @private
   */
  _generateGuardrails(strategyPlan, template) {
    const guardrails = [];

    // Template guardrails first
    if (template.defaultGuardrails && Array.isArray(template.defaultGuardrails)) {
      guardrails.push(...template.defaultGuardrails);
    }

    // Strategy guardrails (deduplicated)
    if (strategyPlan.guardrails && Array.isArray(strategyPlan.guardrails)) {
      for (const g of strategyPlan.guardrails) {
        if (typeof g === 'string' && !guardrails.includes(g)) {
          guardrails.push(g);
        }
      }
    }

    return guardrails;
  }

  /**
   * Generate acceptance criteria: from template
   * @private
   */
  _generateAcceptanceCriteria(strategyPlan, template) {
    if (template.defaultAcceptanceCriteria && Array.isArray(template.defaultAcceptanceCriteria)) {
      return [...template.defaultAcceptanceCriteria];
    }
    return [];
  }

  /**
   * Generate risks: from template + strategy
   * @private
   */
  _generateRisks(strategyPlan, template) {
    const risks = [];

    // Template risks
    if (template.defaultRisks && Array.isArray(template.defaultRisks)) {
      risks.push(...template.defaultRisks);
    }

    // Strategy risks (deduplicated)
    if (strategyPlan.risks && Array.isArray(strategyPlan.risks)) {
      for (const r of strategyPlan.risks) {
        if (typeof r === 'string' && !risks.includes(r)) {
          risks.push(r);
        }
      }
    }

    return risks;
  }

  /**
   * Preview mission drafts in markdown format
   * @param {Array} drafts - Array of mission drafts
   * @returns {string} Markdown preview
   */
  previewMissionDrafts(drafts) {
    if (!Array.isArray(drafts) || drafts.length === 0) {
      return '## 暂无 Mission Drafts\n\n> 无可用草稿预览\n';
    }

    let md = `## Mission Drafts 预览 (${drafts.length} 个)\n\n`;

    for (let i = 0; i < drafts.length; i++) {
      const d = drafts[i];
      md += `### ${i + 1}. ${d.title || 'Untitled'}\n\n`;
      md += `| 字段 | 值 |\n`;
      md += `|------|----|\n`;
      md += `| **Draft ID** | \`${d.draftId || 'N/A'}\` |\n`;
      md += `| **Strategy ID** | \`${d.strategyId || 'N/A'}\` |\n`;
      md += `| **Goal ID** | \`${d.goalId || 'N/A'}\` |\n`;
      md += `| **Type** | ${d.type || 'N/A'} |\n`;
      md += `| **Priority** | ${d.priority || 'N/A'} |\n`;
      md += `| **Status** | ${d.status || 'N/A'} |\n`;
      md += `| **Agent** | ${d.recommendedAgent || 'N/A'} |\n`;
      md += `\n**目标**: ${d.objective || 'N/A'}\n\n`;

      if (d.guardrails && d.guardrails.length > 0) {
        md += `**护栏**:\n`;
        d.guardrails.forEach(g => { md += `- ${g}\n`; });
        md += '\n';
      }

      if (d.acceptanceCriteria && d.acceptanceCriteria.length > 0) {
        md += `**验收标准**:\n`;
        d.acceptanceCriteria.forEach(a => { md += `- ${a}\n`; });
        md += '\n';
      }

      if (d.risks && d.risks.length > 0) {
        md += `**风险**:\n`;
        d.risks.forEach(r => { md += `- ${r}\n`; });
        md += '\n';
      }

      md += '---\n\n';
    }

    return md;
  }

  /**
   * Preview mission drafts in JSON format
   * @param {Array} drafts - Array of mission drafts
   * @returns {string} JSON string
   */
  previewMissionDraftsJson(drafts) {
    if (!Array.isArray(drafts)) {
      return JSON.stringify({ error: 'drafts must be an array', drafts: [] }, null, 2);
    }

    return JSON.stringify({
      totalDrafts: drafts.length,
      generatedAt: new Date().toISOString(),
      drafts: drafts
    }, null, 2);
  }

  /**
   * Batch compile multiple strategy plans
   * @param {Array} strategyPlans - Array of strategy plans
   * @param {Object} options - Compilation options
   * @returns {Object} Batch result
   */
  batchCompileStrategies(strategyPlans, options = {}) {
    if (!Array.isArray(strategyPlans)) {
      throw new Error('Strategy plans must be an array');
    }

    const allDrafts = [];
    const results = [];
    const errors = [];

    for (let i = 0; i < strategyPlans.length; i++) {
      try {
        const result = this.compileStrategyToMissionDrafts(strategyPlans[i], options);
        results.push(result);
        allDrafts.push(...result.drafts);
      } catch (err) {
        errors.push({
          index: i,
          strategy: strategyPlans[i],
          error: err.message
        });
      }
    }

    return {
      totalStrategies: strategyPlans.length,
      compiled: results.length,
      failed: errors.length,
      totalDrafts: allDrafts.length,
      drafts: allDrafts,
      results,
      errors: errors.length > 0 ? errors : null
    };
  }

  /**
   * Update draft status
   * @param {Object} draft - Mission draft
   * @param {string} newStatus - New status
   * @returns {Object} Updated draft
   */
  updateDraftStatus(draft, newStatus) {
    if (!draft || typeof draft !== 'object') {
      throw new Error('Draft must be an object');
    }

    if (!isValidMissionDraftStatus(newStatus)) {
      throw new Error(`Invalid status: ${newStatus}`);
    }

    const updated = {
      ...draft,
      status: newStatus,
      updatedAt: new Date().toISOString()
    };

    // Validate updated draft
    const validation = validateMissionDraft(updated);
    if (!validation.valid) {
      throw new Error(`Invalid draft after status update: ${validation.errors.join(', ')}`);
    }

    return updated;
  }

  /**
   * Logging helper
   * @private
   */
  _log(message, data) {
    if (this.enableLogging) {
      console.log(`[MissionCompiler] ${message}`, data || '');
    }
  }
}

// Export singleton instance
const compiler = new MissionCompiler();

module.exports = {
  MissionCompiler,
  compiler,
  compileStrategyToMissionDrafts: (plan, opts) => compiler.compileStrategyToMissionDrafts(plan, opts),
  previewMissionDrafts: (drafts) => compiler.previewMissionDrafts(drafts),
  previewMissionDraftsJson: (drafts) => compiler.previewMissionDraftsJson(drafts),
  batchCompileStrategies: (plans, opts) => compiler.batchCompileStrategies(plans, opts),
  updateDraftStatus: (draft, status) => compiler.updateDraftStatus(draft, status)
};
