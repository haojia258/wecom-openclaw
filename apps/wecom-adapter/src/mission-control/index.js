'use strict';

/**
 * Mission Control — MVP barrel export
 * Observe → Detect → Trigger → Mission
 */

module.exports = {
  stateMachine:   require('./mission-state-machine'),
  missionManager: require('./mission-manager'),
  triggerEngine:  require('./trigger-engine')
};
