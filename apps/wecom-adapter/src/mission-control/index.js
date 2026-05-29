'use strict';

/**
 * Mission Control — Barrel export
 * Observe → Detect → Trigger → Mission
 * + Passive Monitoring + Audit Log + Safety Guard
 */

module.exports = {
  stateMachine:        require('./mission-state-machine'),
  missionManager:      require('./mission-manager'),
  triggerEngine:       require('./trigger-engine'),
  passiveMonitorLoop:  require('./passive-monitor-loop'),
  missionAuditLog:     require('./mission-audit-log'),
  monitoringStatus:    require('./monitoring-status'),
  autonomousSafetyGuard: require('./autonomous-safety-guard')
};
