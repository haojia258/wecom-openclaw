/**
 * P9.5.3 Mission Compiler MVP — mission-template-registry.js
 * Template registry for mission draft generation
 */

const {
  MISSION_COMPILE_TEMPLATES,
  DEFAULT_MISSION_TEMPLATE,
  MISSION_CATEGORIES,
  CATEGORY_AGENT_MAP,
  RECOMMENDED_AGENTS
} = require('./mission-compiler-types');

class MissionTemplateRegistry {
  constructor() {
    this.templates = new Map();
    this._initializeTemplates();
  }

  _initializeTemplates() {
    for (const [category, template] of Object.entries(MISSION_COMPILE_TEMPLATES)) {
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
      return DEFAULT_MISSION_TEMPLATE;
    }

    const normalizedCategory = category.toLowerCase().trim();

    // Exact match
    if (this.templates.has(normalizedCategory)) {
      return this.templates.get(normalizedCategory);
    }

    // Fuzzy match
    for (const [key, template] of this.templates.entries()) {
      if (key.includes(normalizedCategory) || normalizedCategory.includes(key)) {
        return template;
      }
    }

    // Fallback to default
    return DEFAULT_MISSION_TEMPLATE;
  }

  /**
   * Register custom template
   * @param {string} category - Category name
   * @param {Object} template - Template definition
   * @returns {boolean}
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
        type: template.type || 'generic-mission',
        acceptanceCriteriaCount: (template.defaultAcceptanceCriteria || []).length,
        riskCount: (template.defaultRisks || []).length,
        recommendedAgent: CATEGORY_AGENT_MAP[category] || RECOMMENDED_AGENTS.WORKBUDDY,
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
   * Get default acceptance criteria for a category
   * @param {string} category
   * @returns {Array}
   */
  getDefaultAcceptanceCriteria(category) {
    const template = this.getTemplate(category);
    return template.defaultAcceptanceCriteria || [];
  }

  /**
   * Get default risks for a category
   * @param {string} category
   * @returns {Array}
   */
  getDefaultRisks(category) {
    const template = this.getTemplate(category);
    return template.defaultRisks || [];
  }

  /**
   * Get mission type for a category
   * @param {string} category
   * @returns {string}
   */
  getMissionType(category) {
    const template = this.getTemplate(category);
    return template.type || 'generic-mission';
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
const registry = new MissionTemplateRegistry();

module.exports = {
  MissionTemplateRegistry,
  registry,
  getTemplate: (category) => registry.getTemplate(category),
  registerTemplate: (category, template) => registry.registerTemplate(category, template),
  listTemplates: () => registry.listTemplates(),
  hasTemplate: (category) => registry.hasTemplate(category),
  getMissionType: (category) => registry.getMissionType(category)
};
