/**
 * agent-capability-matrix.js
 * P9.6.4 Agent Assignment Matrix — Agent capabilities and matching logic.
 *
 * Defines the capability profile for each agent and implements the matching
 * algorithm that selects the best agent for a given session.
 *
 * Safety constraints:
 *   - No agent invocation — capability lookup only
 *   - No connection to agent-host, commander, or gateway
 *   - No shell, no exec, no spawn
 */

'use strict';

var types = require('./agent-assignment-types');

// ============================================================================
// Agent Capability Matrix
// ============================================================================

/**
 * Each agent has a set of capabilities.
 * Capability names are normalized to lowercase and sorted.
 */
var AGENT_CAPABILITY_MATRIX = {
  codex: ['coding', 'testing', 'git', 'pr', 'refactor', 'code-review'].sort(),
  workbuddy: ['ops', 'server', 'shell-dry-run', 'audit', 'staging', 'deployment-plan'].sort(),
  deepseek: ['analysis', 'reasoning', 'finance', 'strategy', 'report', 'risk'].sort(),
  doubao: ['marketing', 'content', 'customer', 'social', 'copywriting', 'campaign'].sort()
};

/**
 * Category → Default Agent mapping (used when session has no agent preference).
 */
var CATEGORY_DEFAULT_AGENT = {
  devops: types.AGENT.WORKBUDDY,
  commerce: types.AGENT.CODEX,
  marketing: types.AGENT.DOUBAO,
  customer: types.AGENT.DOUBAO,
  finance: types.AGENT.DEEPSEEK,
  operations: types.AGENT.WORKBUDDY
};

// ============================================================================
// Core API
// ============================================================================

/**
 * Get the capability list for a specific agent.
 * Returns null if the agent is unknown.
 */
function getAgentCapabilities(agent) {
  if (!types.isValidAgent(agent)) {
    return null;
  }
  return AGENT_CAPABILITY_MATRIX[agent].slice();
}

/**
 * List all registered agents with their capabilities.
 * Returns: [{ agent: 'codex', capabilities: [...] }, ...]
 */
function listAgents() {
  return types.AGENT_VALUES.map(function (agent) {
    return {
      agent: agent,
      capabilities: AGENT_CAPABILITY_MATRIX[agent].slice()
    };
  });
}

/**
 * Get all registered agent names.
 */
function listAgentNames() {
  return types.AGENT_VALUES.slice();
}

// ============================================================================
// Capability Matching
// ============================================================================

/**
 * Match a session to the best agent.
 *
 * Algorithm:
 * 1. If session has selectedAgent and it's valid, check capability match
 * 2. If selectedAgent matches all required capabilities → use it
 * 3. If selectedAgent doesn't match → fall through to scoring
 * 4. Score each agent by capability overlap with required capabilities
 * 5. Return the agent with the highest score
 * 6. In case of tie, use AGENT_PRIORITY
 *
 * @param {Object} session — Controlled dispatch session
 * @param {Object} options — { category, requiredCapabilities }
 * @returns {Object} { selectedAgent, fallbackAgents, requiredCapabilities, matchedCapabilities, missingCapabilities, confidence, reason }
 */
function matchAgentForSession(session, options) {
  var opts = options || {};
  var safe = session || {};

  // Determine required capabilities
  var requiredCapabilities = [];
  if (opts.hasOwnProperty('requiredCapabilities') && Array.isArray(opts.requiredCapabilities)) {
    requiredCapabilities = opts.requiredCapabilities.slice();
  } else if (opts.requiredCapabilities && opts.requiredCapabilities.length > 0) {
    requiredCapabilities = opts.requiredCapabilities.slice();
  } else {
    var category = opts.category || (safe.ticketSnapshot ? safe.ticketSnapshot.category : null) || 'operations';
    requiredCapabilities = types.deriveRequiredCapabilities(category);
  }

  if (requiredCapabilities.length === 0) {
    return _noCapabilitiesResult(requiredCapabilities);
  }

  // Try session's selectedAgent first
  var preferredAgent = safe.selectedAgent || (safe.ticketSnapshot ? safe.ticketSnapshot.selectedAgent : null) || null;

  if (preferredAgent && types.isValidAgent(preferredAgent)) {
    var preferredMatch = _scoreAgent(preferredAgent, requiredCapabilities);
    if (preferredMatch.missingCapabilities.length === 0) {
      // Perfect match with preferred agent
      return {
        selectedAgent: preferredAgent,
        fallbackAgents: _buildFallbackAgents(preferredAgent, requiredCapabilities),
        requiredCapabilities: requiredCapabilities.slice(),
        matchedCapabilities: preferredMatch.matchedCapabilities.slice(),
        missingCapabilities: [],
        confidence: 1.0,
        reason: 'Preferred agent ' + preferredAgent + ' matches all required capabilities (' + preferredMatch.matchedCapabilities.length + '/' + requiredCapabilities.length + ')'
      };
    }
    // Preferred agent doesn't match all → fall through to scoring
  }

  // Score all agents
  return _scoreAllAgents(requiredCapabilities, preferredAgent);
}

/**
 * Score all agents and return the best match.
 */
function _scoreAllAgents(requiredCapabilities, excludeAgent) {
  var bestAgent = null;
  var bestScore = -1;
  var bestMatch = null;

  types.AGENT_VALUES.forEach(function (agent) {
    var score = _scoreAgent(agent, requiredCapabilities);
    var agentScore = score.matchedCapabilities.length;

    if (agentScore > bestScore) {
      bestScore = agentScore;
      bestAgent = agent;
      bestMatch = score;
    } else if (agentScore === bestScore && bestAgent) {
      // Tie-break by priority (lower number = higher priority)
      if (types.AGENT_PRIORITY[agent] < types.AGENT_PRIORITY[bestAgent]) {
        bestAgent = agent;
        bestMatch = score;
      }
    }
  });

  if (!bestAgent || bestScore === 0) {
    return _noCapabilitiesResult(requiredCapabilities);
  }

  var confidence = bestScore / requiredCapabilities.length;
  var fallbackAgents = _buildFallbackAgents(bestAgent, requiredCapabilities, excludeAgent);

  return {
    selectedAgent: bestAgent,
    fallbackAgents: fallbackAgents,
    requiredCapabilities: requiredCapabilities.slice(),
    matchedCapabilities: bestMatch.matchedCapabilities.slice(),
    missingCapabilities: bestMatch.missingCapabilities.slice(),
    confidence: Math.round(confidence * 100) / 100,
    reason: 'Agent ' + bestAgent + ' matches ' + bestScore + '/' + requiredCapabilities.length + ' required capabilities (confidence: ' + Math.round(confidence * 100) + '%)'
  };
}

/**
 * Score a single agent against required capabilities.
 */
function _scoreAgent(agent, requiredCapabilities) {
  var capabilities = AGENT_CAPABILITY_MATRIX[agent] || [];
  var matched = [];
  var missing = [];

  requiredCapabilities.forEach(function (cap) {
    if (capabilities.indexOf(cap) !== -1) {
      matched.push(cap);
    } else {
      missing.push(cap);
    }
  });

  return {
    agent: agent,
    matchedCapabilities: matched,
    missingCapabilities: missing
  };
}

/**
 * Build fallback agent list (all other agents excluding selected, sorted by score).
 */
function _buildFallbackAgents(selectedAgent, requiredCapabilities, alsoExclude) {
  var exclude = [selectedAgent];
  if (alsoExclude) {
    exclude.push(alsoExclude);
  }

  return types.AGENT_VALUES
    .filter(function (agent) { return exclude.indexOf(agent) === -1; })
    .map(function (agent) {
      var score = _scoreAgent(agent, requiredCapabilities);
      return {
        agent: agent,
        matchedCount: score.matchedCapabilities.length,
        totalRequired: requiredCapabilities.length
      };
    })
    .sort(function (a, b) { return b.matchedCount - a.matchedCount; })
    .map(function (item) { return item.agent; });
}

/**
 * Build a result when no capabilities match.
 */
function _noCapabilitiesResult(requiredCapabilities) {
  return {
    selectedAgent: null,
    fallbackAgents: [],
    requiredCapabilities: (requiredCapabilities || []).slice(),
    matchedCapabilities: [],
    missingCapabilities: (requiredCapabilities || []).slice(),
    confidence: 0,
    reason: 'No agent found with matching capabilities'
  };
}

// ============================================================================
// Additional Helpers
// ============================================================================

/**
 * Check if a specific agent has a capability.
 */
function agentHasCapability(agent, capability) {
  if (!types.isValidAgent(agent)) return false;
  return AGENT_CAPABILITY_MATRIX[agent].indexOf(capability) !== -1;
}

/**
 * Get the default agent for a category.
 */
function getDefaultAgentForCategory(category) {
  return CATEGORY_DEFAULT_AGENT[category] || null;
}

// ============================================================================
// Exports
// ============================================================================
module.exports = {
  AGENT_CAPABILITY_MATRIX: AGENT_CAPABILITY_MATRIX,
  CATEGORY_DEFAULT_AGENT: CATEGORY_DEFAULT_AGENT,

  getAgentCapabilities: getAgentCapabilities,
  listAgents: listAgents,
  listAgentNames: listAgentNames,
  matchAgentForSession: matchAgentForSession,
  agentHasCapability: agentHasCapability,
  getDefaultAgentForCategory: getDefaultAgentForCategory
};
