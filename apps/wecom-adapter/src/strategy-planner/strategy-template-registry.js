/**
 * P9.5.2 Strategy Planner MVP — strategy-template-registry.js
 * Template registry for strategy plan generation
 */

const { TEMPLATE_REGISTRY, DEFAULT_TEMPLATE, STRATEGY_CATEGORIES } = require('./strategy-types');

class StrategyTemplateRegistry {
  constructor() {
    this.templates = new Map();
    this._initializeTemplates();
  }

  _initializeTemplates() {
    // Load all predefined templates
    for (const [category, template] of Object.entries(TEMPLATE_REGISTRY)) {
      this.templates.set(category, {
        ...template,
        category,
        isBuiltIn: true
      });
    }
  }

  /**
   * Get template by category
   * @param {string} category - Goal category
   * @returns {Object} Template object
   */
  getTemplate(category) {
    if (!category || typeof category !== 'string') {
      return DEFAULT_TEMPLATE;
    }

    const normalizedCategory = category.toLowerCase().trim();
    
    // Exact match
    if (this.templates.has(normalizedCategory)) {
      return this.templates.get(normalizedCategory);
    }

    // Fuzzy match (partial)
    for (const [key, template] of this.templates.entries()) {
      if (key.includes(normalizedCategory) || normalizedCategory.includes(key)) {
        return template;
      }
    }

    // Fallback to default
    return DEFAULT_TEMPLATE;
  }

  /**
   * Register custom template
   * @param {string} category - Category name
   * @param {Object} template - Template definition
   */
  registerTemplate(category, template) {
    if (!category || !template) {
      throw new Error('Category and template are required');
    }

    this.templates.set(category.toLowerCase().trim(), {
      ...template,
      category: category.toLowerCase().trim(),
      isBuiltIn: false,
      registeredAt: new Date().toISOString()
    });

    return true;
  }

  /**
   * List all available templates
   * @returns {Array} List of template summaries
   */
  listTemplates() {
    const result = [];
    for (const [category, template] of this.templates.entries()) {
      result.push({
        category,
        objectiveCount: (template.defaultObjectives || []).length,
        guardrailCount: (template.defaultGuardrails || []).length,
        recommendedMissionCount: (template.recommendedMissionTypes || []).length,
        isBuiltIn: template.isBuiltIn
      });
    }
    return result;
  }

  /**
   * Check if category has a template
   * @param {string} category 
   * @returns {boolean}
   */
  hasTemplate(category) {
    if (!category) return false;
    return this.templates.has(category.toLowerCase().trim());
  }

  /**
   * Get default objectives for a category
   * @param {string} category 
   * @returns {Array}
   */
  getDefaultObjectives(category) {
    const template = this.getTemplate(category);
    return template.defaultObjectives || [];
  }

  /**
   * Get default guardrails for a category
   * @param {string} category 
   * @returns {Array}
   */
  getDefaultGuardrails(category) {
    const template = this.getTemplate(category);
    return template.defaultGuardrails || [];
  }

  /**
   * Get recommended mission types for a category
   * @param {string} category 
   * @returns {Array}
   */
  getRecommendedMissionTypes(category) {
    const template = this.getTemplate(category);
    return template.recommendedMissionTypes || [];
  }

  /**
   * Remove custom template
   * @param {string} category 
   * @returns {boolean}
   */
  removeTemplate(category) {
    if (!category) return false;
    
    const normalized = category.toLowerCase().trim();
    const template = this.templates.get(normalized);
    
    // Don't allow removing built-in templates
    if (template && template.isBuiltIn) {
      throw new Error(`Cannot remove built-in template: ${category}`);
    }

    return this.templates.delete(normalized);
  }

  /**
   * Clear all custom templates (keep built-in)
   */
  clearCustomTemplates() {
    for (const [category, template] of this.templates.entries()) {
      if (!template.isBuiltIn) {
        this.templates.delete(category);
      }
    }
  }

  /**
   * Export all templates (for persistence)
   * @returns {Object}
   */
  exportTemplates() {
    const builtIn = {};
    const custom = {};

    for (const [category, template] of this.templates.entries()) {
      if (template.isBuiltIn) {
        builtIn[category] = { ...template };
        delete builtIn[category].isBuiltIn;
      } else {
        custom[category] = { ...template };
        delete custom[category].isBuiltIn;
        delete custom[category].registeredAt;
      }
    }

    return { builtIn, custom };
  }
}

// Export singleton instance
const registry = new StrategyTemplateRegistry();

module.exports = {
  StrategyTemplateRegistry,
  registry,
  getTemplate: (category) => registry.getTemplate(category),
  registerTemplate: (category, template) => registry.registerTemplate(category, template),
  listTemplates: () => registry.listTemplates(),
  hasTemplate: (category) => registry.hasTemplate(category)
};
