/**
 * agent-selector.js
 * P9.5.5 Mission Dispatch Planner — Agent selection logic.
 *
 * Selects the best agent for a reviewed draft based on:
 *   1. draft.recommendedAgent (if valid)
 *   2. category → default agent mapping
 *
 * Also computes fallback agents (all other valid agents except selected).
 * No I/O, no side effects.
 */

const {
  AGENT,
  AGENT_VALUES,
  CATEGORY_AGENT_MAP
} = require('./dispatch-types');

// ---------------------------------------------------------------------------
// Select the best agent for a review item's draft
// ---------------------------------------------------------------------------

function selectAgent(reviewItem) {
  if (!reviewItem || typeof reviewItem !== 'object') {
    return { selectedAgent: null, fallbackAgents: [], reason: 'Invalid review item' };
  }

  const draft = reviewItem.draft;
  if (!draft || typeof draft !== 'object') {
    return { selectedAgent: null, fallbackAgents: [], reason: 'No draft found in review item' };
  }

  var selectedAgent = null;
  var reason = '';

  // Rule 1: use draft.recommendedAgent if present and valid
  if (draft.recommendedAgent && AGENT_VALUES.includes(draft.recommendedAgent)) {
    selectedAgent = draft.recommendedAgent;
    reason = 'Used draft.recommendedAgent: ' + selectedAgent;
  }

  // Rule 2: fall back to category-based default
  if (!selectedAgent) {
    var category = draft.category || '';
    if (CATEGORY_AGENT_MAP[category]) {
      selectedAgent = CATEGORY_AGENT_MAP[category];
      reason = 'Category "' + category + '" default agent: ' + selectedAgent;
    }
  }

  // Rule 3: ultimate fallback — use workbuddy
  if (!selectedAgent) {
    selectedAgent = AGENT.WORKBUDDY;
    reason = 'No recommendation or category match, defaulting to: ' + selectedAgent;
  }

  // Compute fallback agents (all agents except selected)
  var fallbackAgents = AGENT_VALUES.filter(function (a) {
    return a !== selectedAgent;
  });

  return {
    selectedAgent: selectedAgent,
    fallbackAgents: fallbackAgents,
    reason: reason
  };
}

// ---------------------------------------------------------------------------
// Select agent with explicit override (used by planDispatchForItem)
// ---------------------------------------------------------------------------

function selectAgentWithOverride(reviewItem, overrideAgent) {
  if (overrideAgent && AGENT_VALUES.includes(overrideAgent)) {
    var fallbackAgents = AGENT_VALUES.filter(function (a) {
      return a !== overrideAgent;
    });
    return {
      selectedAgent: overrideAgent,
      fallbackAgents: fallbackAgents,
      reason: 'Explicit agent override: ' + overrideAgent
    };
  }
  return selectAgent(reviewItem);
}

// ---------------------------------------------------------------------------
// Get default agent for a category
// ---------------------------------------------------------------------------

function getDefaultAgentForCategory(category) {
  if (CATEGORY_AGENT_MAP[category]) {
    return CATEGORY_AGENT_MAP[category];
  }
  return AGENT.WORKBUDDY; // ultimate fallback
}

// ---------------------------------------------------------------------------
// Validate that an agent is legal
// ---------------------------------------------------------------------------

function isValidAgent(agent) {
  return AGENT_VALUES.includes(agent);
}

// ---------------------------------------------------------------------------
// Get all valid agents
// ---------------------------------------------------------------------------

function getAllAgents() {
  return [].concat(AGENT_VALUES);
}

// ---------------------------------------------------------------------------
// Build fallback list excluding selected
// ---------------------------------------------------------------------------

function buildFallbackAgents(selectedAgent) {
  return AGENT_VALUES.filter(function (a) {
    return a !== selectedAgent;
  });
}

module.exports = {
  selectAgent,
  selectAgentWithOverride,
  getDefaultAgentForCategory,
  isValidAgent,
  getAllAgents,
  buildFallbackAgents
};
