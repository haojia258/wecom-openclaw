'use strict';

/**
 * agent-heartbeat-routes.js - P10.7 Agent Heartbeat API Routes
 *
 * API 端点:
 *   POST /mission/agents/:agent/heartbeat  → 记录 agent 心跳
 *   GET  /mission/agents                    → 列出所有 agents
 *   GET  /mission/agents/:agent/health      → 获取 agent 健康报告
 *   GET  /mission/agents/:agent             → 获取单个 agent
 */

var heartbeatStore = require('./agent-heartbeat-store');

// ─── Route Handlers ─────────────────────────────────────

/**
 * POST /mission/agents/:agent/heartbeat
 * Request body: { cpu, memory, active_tasks, current_mission, error_count }
 */
function handleHeartbeat(req, res) {
  var agentName = req.params.agent;
  var body = req._missionBody || {};

  if (!agentName || typeof agentName !== 'string' || agentName.trim() === '') {
    return res.status(400).json({
      success: false,
      error: '缺少 agent 名称',
      timestamp: new Date().toISOString()
    });
  }

  if (agentName.indexOf('/') !== -1 || agentName.indexOf('\\') !== -1 ||
      agentName.indexOf('..') !== -1 || agentName.indexOf(':') !== -1) {
    return res.status(400).json({
      success: false,
      error: 'agent 名称包含非法字符',
      timestamp: new Date().toISOString()
    });
  }

  var result = heartbeatStore.recordHeartbeat({
    agent: agentName,
    cpu: body.cpu,
    memory: body.memory,
    active_tasks: body.active_tasks,
    current_mission: body.current_mission,
    error_count: body.error_count
  });

  if (!result.success) {
    return res.status(400).json({
      success: false,
      error: result.error,
      timestamp: new Date().toISOString()
    });
  }

  res.json({
    success: true,
    agent: result.agent,
    timestamp: new Date().toISOString()
  });
}

/**
 * GET /mission/agents
 */
function handleListAgents(req, res) {
  var result = heartbeatStore.listAgents();

  res.json({
    success: true,
    agents: result.agents,
    total: result.total,
    timestamp: new Date().toISOString()
  });
}

/**
 * GET /mission/agents/:agent
 */
function handleGetAgent(req, res) {
  var agentName = req.params.agent;

  if (!agentName || typeof agentName !== 'string') {
    return res.status(400).json({
      success: false,
      error: '缺少 agent 名称',
      timestamp: new Date().toISOString()
    });
  }

  var result = heartbeatStore.getAgent(agentName);

  if (!result.success) {
    return res.status(404).json({
      success: false,
      error: result.error,
      timestamp: new Date().toISOString()
    });
  }

  res.json({
    success: true,
    agent: result.agent,
    timestamp: new Date().toISOString()
  });
}

/**
 * GET /mission/agents/:agent/health
 */
function handleGetAgentHealth(req, res) {
  var agentName = req.params.agent;

  if (!agentName || typeof agentName !== 'string') {
    return res.status(400).json({
      success: false,
      error: '缺少 agent 名称',
      timestamp: new Date().toISOString()
    });
  }

  var result = heartbeatStore.getAgentHealth(agentName);

  if (!result.success) {
    return res.status(404).json({
      success: false,
      error: result.error,
      timestamp: new Date().toISOString()
    });
  }

  res.json({
    success: true,
    health: result.health,
    timestamp: new Date().toISOString()
  });
}

// ─── Route Registration ─────────────────────────────────

/**
 * Register heartbeat routes on Express app
 *
 * IMPORTANT: /mission/agents/:agent/health 必须在 /mission/agents/:agent 之前注册，
 * 因为 Express 按顺序匹配路由。
 *
 * @param {object} app - Express app 实例
 */
function registerAgentHeartbeatRoutes(app) {
  // Body parser for POST heartbeat
  app.post('/mission/agents/:agent/heartbeat', function(req, res, next) {
    var chunks = [];
    var maxSize = 16 * 1024;
    var totalSize = 0;

    req.on('data', function(chunk) {
      totalSize += chunk.length;
      if (totalSize > maxSize) {
        res.status(413).json({
          success: false,
          error: 'Body too large',
          timestamp: new Date().toISOString()
        });
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', function() {
      try {
        req._missionBody = JSON.parse(Buffer.concat(chunks).toString());
      } catch (e) {
        req._missionBody = {};
      }
      next();
    });

    req.on('error', function() {
      // 客户端断开
    });
  }, handleHeartbeat);

  // GET /mission/agents
  app.get('/mission/agents', handleListAgents);

  // GET /mission/agents/:agent/health (MUST be before /mission/agents/:agent)
  app.get('/mission/agents/:agent/health', handleGetAgentHealth);

  // GET /mission/agents/:agent
  app.get('/mission/agents/:agent', handleGetAgent);
}

module.exports = {
  registerAgentHeartbeatRoutes: registerAgentHeartbeatRoutes,
  _handleHeartbeat: handleHeartbeat,
  _handleListAgents: handleListAgents,
  _handleGetAgent: handleGetAgent,
  _handleGetAgentHealth: handleGetAgentHealth
};
