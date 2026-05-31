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
const multiAgentRoutes = require('./src/multi-agent/multi-agent-routes');
const domainRoutes = require('./src/domain/domain-routes');
const eventBusRoutes = require('./src/event-bus/event-routes');
const missionGenerator = require('./src/mission-generator/mission-generator');
const autonomousPlanner = require('./src/autonomous-planner/autonomous-planner');

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

// Register Multi-Agent Runtime (P11.4)
app.use('/multi-agent', express.json({ limit: '16kb' }));
multiAgentRoutes.registerMultiAgentRoutes(app);

// Register Domain Runtime (P12.0)
app.use('/domain', express.json({ limit: '16kb' }));
domainRoutes.registerDomainRoutes(app);

// Register Event Bus (P13.0)
app.use('/event-bus', express.json({ limit: '16kb' }));
eventBusRoutes.registerEventBusRoutes(app);

// Register Mission Generator (P14.0) and Autonomous Planner (P15.0)
app.use('/mission-generator', express.json({ limit: '16kb' }));
app.post('/mission-generator/generate', function(req,res){res.json(missionGenerator.generate(req.body||{}));});
app.get('/mission-generator/rules', function(req,res){res.json(missionGenerator.listRules());});
app.post('/mission-generator/dry-run', function(req,res){res.json(missionGenerator.dryRun(req.body||{}));});

app.use('/planner', express.json({ limit: '16kb' }));
app.post('/planner/plan', function(req,res){res.json(autonomousPlanner.createPlan(req.body||{}));});
app.post('/planner/plan-and-dispatch', function(req,res){res.json(autonomousPlanner.planAndDispatch(req.body||{}));});
app.get('/planner/plans/:id', function(req,res){res.json(autonomousPlanner.getPlan(req.params.id));});
app.post('/planner/plans/:id/approve', function(req,res){res.json(autonomousPlanner.approvePlan(req.params.id));});

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
