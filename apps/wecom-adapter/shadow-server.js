/**
 * shadow-server.js - Production Deployment Server (port 3001)
 * 绕过 Vault/gateway 依赖的轻量级生产服务器
 * 版本: v1.1 (P10.5 production deploy)
 */
'use strict';

const express = require('express');
const missionRoutes = require('./src/mission/mission-routes');

const app = express();
// NOTE: Do NOT add express.json() here - mission-routes has its own
// parseMissionBody middleware that reads the raw body stream.
// Adding express.json() would consume the stream and cause hangs.
app.use(express.text({ type: '*/xml' }));
app.disable('x-powered-by');
app.disable('etag');

// Health check (production endpoint)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: '1.0.0', uptime: process.uptime() });
});

// Register mission routes (P10.0-P10.5)
missionRoutes.registerMissionRoutes(app);

const PORT = process.env.WECOM_ADAPTER_PORT || 3001;
const server = app.listen(PORT, () => {
  console.log('[shadow-server] Production server running on port', PORT);
  console.log('[shadow-server] Endpoints: /health /mission/* (P10.0-P10.5)');
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('[shadow-server] Shutting down...');
  server.close(() => process.exit(0));
});
