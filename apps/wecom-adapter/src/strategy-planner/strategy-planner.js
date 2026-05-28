/**
 * P9.5.2 Strategy Planner MVP — strategy-planner.js
 * Core strategy planner: converts goals to strategy plans
 */

const strategyTypes = require('./strategy-types');
const STRATEGY_STATUS = strategyTypes.STRATEGY_STATUS;
const createStrategyPlan = strategyTypes.createStrategyPlan;
const isValidStatus = strategyTypes.isValidStatus;

const templateRegistryModule = require('./strategy-template-registry');
const templateRegistry = templateRegistryModule.registry;
const getTemplate = templateRegistryModule.getTemplate;

const validator = require('./strategy-validator');
const validateGoal = validator.validateGoal;
const validateStrategyPlan = validator.validateStrategyPlan;
const sanitizeGoal = validator.sanitizeGoal;
const ERRORS = validator.ERRORS;

class StrategyPlanner {
  constructor(options = {}) {
    this.templateRegistry = options.templateRegistry || templateRegistry;
    this.defaultMaxRecommendations = options.maxRecommendations || 10;
    this.enableLogging = options.enableLogging || false;
  }

  /**
   * Convert a goal to a strategy plan
   * @param {Object} goal - Goal object from Goal Registry
   * @param {Object} options - Planning options
   * @returns {Object} Strategy plan
   */
  plan(goal, options = {}) {
    const startTime = Date.now();

    // Validate input
    const validation = validateGoal(goal);
    if (!validation.valid) {
      throw new Error(`Invalid goal: ${validation.errors.join(', ')}`);
    }

    const sanitizedGoal = validation.goal || sanitizeGoal(goal);

    // Get template based on category
    const category = sanitizedGoal.category || 'generic';
    const template = getTemplate(category);

    // Generate strategy plan
    const strategyPlan = createStrategyPlan(sanitizedGoal, template, {
      objectives: this._generateObjectives(sanitizedGoal, template),
      guardrails: this._generateGuardrails(sanitizedGoal, template),
      recommendedMissions: this._generateRecommendations(sanitizedGoal, template, options),
      assumptions: this._generateAssumptions(sanitizedGoal),
      risks: this._generateRisks(sanitizedGoal, template),
      metadata: {
        ...options.metadata,
        plannerVersion: 'P9.5.2-MVP',
        generatedAt: new Date().toISOString(),
        processingTimeMs: Date.now() - startTime
      }
    });

    // Override priority if specified in options or use goal's priority
    const validPriorities = ['low', 'medium', 'high', 'critical'];
    if (options.priority && validPriorities.includes(options.priority)) {
      strategyPlan.priority = options.priority;
    } else if (sanitizedGoal.priority && validPriorities.includes(sanitizedGoal.priority)) {
      strategyPlan.priority = sanitizedGoal.priority;
    } else {
      strategyPlan.priority = 'medium'; // Default fallback
    }

    // Set initial status (use options.status if provided, otherwise default to DRAFT)
    strategyPlan.status = options.status && isValidStatus(options.status) ? options.status : STRATEGY_STATUS.DRAFT;

    this._log('Strategy plan generated', {
      strategyId: strategyPlan.strategyId,
      goalId: strategyPlan.goalId,
      category: strategyPlan.category
    });

    return strategyPlan;
  }

  /**
   * Batch plan multiple goals
   * @param {Array} goals - Array of goal objects
   * @param {Object} options - Planning options
   * @returns {Array} Array of strategy plans
   */
  batchPlan(goals, options = {}) {
    if (!Array.isArray(goals)) {
      throw new Error('Goals must be an array');
    }

    const results = [];
    const errors = [];

    for (let i = 0; i < goals.length; i++) {
      try {
        const plan = this.plan(goals[i], options);
        results.push(plan);
      } catch (err) {
        errors.push({
          index: i,
          goal: goals[i],
          error: err.message
        });
      }
    }

    return {
      plans: results,
      total: goals.length,
      succeeded: results.length,
      failed: errors.length,
      errors: errors.length > 0 ? errors : null
    };
  }

  /**
   * Update strategy plan status
   * @param {Object} plan - Strategy plan
   * @param {string} newStatus - New status
   * @returns {Object} Updated plan
   */
  updateStatus(plan, newStatus) {
    if (!plan || typeof plan !== 'object') {
      throw new Error('Plan must be an object');
    }

    if (!isValidStatus(newStatus)) {
      throw new Error(`Invalid status: ${newStatus}`);
    }

    const updated = {
      ...plan,
      status: newStatus,
      updatedAt: new Date().toISOString()
    };

    // Validate updated plan
    const validation = validateStrategyPlan(updated);
    if (!validation.valid) {
      throw new Error(`Invalid plan after status update: ${validation.errors.join(', ')}`);
    }

    return updated;
  }

  /**
   * Add objective to plan
   * @param {Object} plan - Strategy plan
   * @param {string} objective - New objective
   * @returns {Object} Updated plan
   */
  addObjective(plan, objective) {
    if (!plan || typeof plan !== 'object') {
      throw new Error('Plan must be an object');
    }

    if (!objective || typeof objective !== 'string') {
      throw new Error('Objective must be a non-empty string');
    }

    const updated = {
      ...plan,
      objectives: [...(plan.objectives || []), objective],
      updatedAt: new Date().toISOString()
    };

    return updated;
  }

  /**
   * Add guardrail to plan
   * @param {Object} plan - Strategy plan
   * @param {string} guardrail - New guardrail
   * @returns {Object} Updated plan
   */
  addGuardrail(plan, guardrail) {
    if (!plan || typeof plan !== 'object') {
      throw new Error('Plan must be an object');
    }

    if (!guardrail || typeof guardrail !== 'string') {
      throw new Error('Guardrail must be a non-empty string');
    }

    const updated = {
      ...plan,
      guardrails: [...(plan.guardrails || []), guardrail],
      updatedAt: new Date().toISOString()
    };

    return updated;
  }

  /**
   * Generate objectives from goal and template
   * @private
   */
  _generateObjectives(goal, template) {
    const objectives = [...(template.defaultObjectives || [])];

    // Add target-based objectives
    if (goal.targets && Array.isArray(goal.targets)) {
      for (const target of goal.targets) {
        if (typeof target === 'string') {
          objectives.push(`实现目标: ${target}`);
        } else if (target && typeof target === 'object' && target.description) {
          objectives.push(`实现目标: ${target.description}`);
        }
      }
    }

    // Add goal name/title as objective
    if (goal.name || goal.title) {
      objectives.push(`完成: ${goal.name || goal.title}`);
    }

    return objectives;
  }

  /**
   * Generate guardrails from goal and template
   * @private
   */
  _generateGuardrails(goal, template) {
    const guardrails = [...(template.defaultGuardrails || [])];

    // Add constraint-based guardrails
    if (goal.constraints && Array.isArray(goal.constraints)) {
      for (const constraint of goal.constraints) {
        if (typeof constraint === 'string') {
          guardrails.push(`遵守约束: ${constraint}`);
        }
      }
    }

    return guardrails;
  }

  /**
   * Generate mission recommendations
   * @private
   */
  _generateRecommendations(goal, template, options = {}) {
    const maxRecs = options.maxRecommendations || this.defaultMaxRecommendations;
    const missionTypes = template.recommendedMissionTypes || [];

    const recommendations = missionTypes.slice(0, maxRecs).map((type, index) => ({
      missionId: `rec_${Date.now()}_${index}`,
      type,
      priority: goal.priority || 'medium',
      reason: `Recommended for ${goal.category || 'generic'} category`,
      estimatedDuration: 'TBD',
      dependencies: []
    }));

    return recommendations;
  }

  /**
   * Generate assumptions
   * @private
   */
  _generateAssumptions(goal) {
    const assumptions = [];

    if (goal.category) {
      assumptions.push(`Category "${goal.category}" is correctly classified`);
    }

    if (goal.priority) {
      assumptions.push(`Priority "${goal.priority}" reflects business importance`);
    }

    assumptions.push('All required resources will be available');
    assumptions.push('External dependencies will be met');

    return assumptions;
  }

  /**
   * Generate risks
   * @private
   */
  _generateRisks(goal, template) {
    const risks = [];

    // Category-specific risks
    if (goal.category === 'commerce') {
      risks.push('Market competition may affect results');
      risks.push('Regulatory changes may impact strategy');
    } else if (goal.category === 'devops') {
      risks.push('Production deployment may cause downtime');
      risks.push('Technical debt may slow progress');
    } else if (goal.category === 'finance') {
      risks.push('Market volatility may affect outcomes');
      risks.push('Budget constraints may limit execution');
    }

    // General risks
    risks.push('Key personnel may become unavailable');
    risks.push('Requirements may change during execution');

    return risks;
  }

  /**
   * Logging helper
   * @private
   */
  _log(message, data) {
    if (this.enableLogging) {
      console.log(`[StrategyPlanner] ${message}`, data || '');
    }
  }
}

// Export singleton instance
const planner = new StrategyPlanner();

module.exports = {
  StrategyPlanner,
  planner,
  plan: (goal, options) => planner.plan(goal, options),
  batchPlan: (goals, options) => planner.batchPlan(goals, options),
  updateStatus: (plan, status) => planner.updateStatus(plan, status),
  addObjective: (plan, objective) => planner.addObjective(plan, objective),
  addGuardrail: (plan, guardrail) => planner.addGuardrail(plan, guardrail)
};
