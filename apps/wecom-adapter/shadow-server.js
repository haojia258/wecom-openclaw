/**
 * shadow-server.js - Production Deployment Server (port 3001)
 * 绕过 Vault/gateway 依赖的轻量级生产服务器
 * 版本: v1.1 (P11.0 + P11.1 commander gateway + wecom mission center)
 */
'use strict';

const express = require('express');
const path = require('path');
const missionRoutes = require('./src/mission/mission-routes');
const commanderGateway = require('./src/commander/commander-gateway');
const wecomMissionCenter = require('./src/wecom/wecom-mission-center');
const workbuddyAdapter = require('./src/execution/workbuddy-adapter');
const agentBusRoutes = require('./src/agent-bus/agent-bus-routes');

const app = express();
// NOTE: Do NOT add express.json() here - mission-routes has its own
// parseMissionBody middleware that reads the raw body stream.
// Adding express.json() would consume the stream and cause hangs.
// Commander + WeCom routes use express.json() internally.
app.use(express.text({ type: '*/xml' }));
app.disable('x-powered-by');
app.disable('etag');

// Health check (production endpoint)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: '1.0.0', uptime: process.uptime() });
});

// Static files - Mission Control Dashboard
app.use(express.static(path.join(__dirname, 'public')));

// Register mission routes (P10.0-P10.5)
missionRoutes.registerMissionRoutes(app);

// Register Commander Gateway routes (P11.0)
commanderGateway.registerCommanderRoutes(app);

// Register WeCom Mission Center routes (P11.1)
wecomMissionCenter.registerWecomMissionRoutes(app);

// Register WorkBuddy Execution routes (P11.2)
app.use('/execution', express.json({ limit: '16kb' }));
workbuddyAdapter.registerWorkBuddyRoutes(app);

// Register Agent Bus routes (P11.3)
app.use('/agent-bus', express.json({ limit: '16kb' }));
agentBusRoutes.registerAgentBusRoutes(app);

const PORT = process.env.WECOM_ADAPTER_PORT || 3001;
const server = app.listen(PORT, () => {
  console.log('[shadow-server] Production server running on port', PORT);
  console.log('[shadow-server] Endpoints: /health /mission/* /commander/* /wecom/* /execution/* /agent-bus/*');
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('[shadow-server] Shutting down...');
  server.close(() => process.exit(0));
});
