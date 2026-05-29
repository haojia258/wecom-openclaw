'use strict';

/**
 * autonomous-loop.js - P10.8 Autonomous Execution Loop API Routes
 *
 * API 端点:
 *   POST /mission/graphs/:graph_id/run-loop  → 执行完整 graph loop
 *   POST /mission/graphs/:graph_id/nodes/:node_id/run → 执行单个节点
 *   GET  /mission/graphs/:graph_id/status    → 获取 graph 执行状态
 *   GET  /mission/graphs/:graph_id/events    → 获取 graph 所有事件
 */

var orchestrationEngine = require('./orchestration-engine');
var graphStore = require('./task-graph-store');

// ─── Route Handlers ─────────────────────────────────────

/**
 * POST /mission/graphs/:graph_id/run-loop
 * Body: { maxSteps?: number, verifyHealth?: boolean }
 */
async function handleRunLoop(req, res) {
  var graphId = req.params.graph_id;

  try {
    var graph = graphStore.getGraph(graphId);
    if (!graph) {
      return res.status(404).json({ success: false, error: 'Graph not found: ' + graphId });
    }

    var opts = req._missionBody || {};
    var result = await orchestrationEngine.executeGraphLoop(graphId, {
      maxSteps: opts.maxSteps || 50,
      verifyHealth: opts.verifyHealth !== false
    });

    res.json(result);
  } catch (e) {
    res.status(500).json({ success: false, error: 'Graph loop execution failed: ' + e.message });
  }
}

/**
 * POST /mission/graphs/:graph_id/nodes/:node_id/run
 * Body: { verifyHealth?: boolean }
 */
async function handleRunNode(req, res) {
  var graphId = req.params.graph_id;
  var nodeId = req.params.node_id;

  try {
    var graph = graphStore.getGraph(graphId);
    if (!graph) {
      return res.status(404).json({ success: false, error: 'Graph not found: ' + graphId });
    }

    var node = graph.nodes.find(function(n) { return n.id === nodeId; });
    if (!node) {
      return res.status(404).json({ success: false, error: 'Node not found: ' + nodeId });
    }

    var opts = req._missionBody || {};
    var result = await orchestrationEngine.executeSingleNode(graphId, nodeId, {
      verifyHealth: opts.verifyHealth !== false
    });

    res.json(result);
  } catch (e) {
    res.status(500).json({ success: false, error: 'Node execution failed: ' + e.message });
  }
}

/**
 * GET /mission/graphs/:graph_id/status
 */
function handleGraphStatus(req, res) {
  var graphId = req.params.graph_id;

  try {
    var result = orchestrationEngine.getGraphExecutionStatus(graphId);
    if (!result) {
      return res.status(404).json({ success: false, error: 'Graph not found: ' + graphId });
    }

    res.json(result);
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to get graph status: ' + e.message });
  }
}

/**
 * GET /mission/graphs/:graph_id/events
 */
function handleGraphEvents(req, res) {
  var graphId = req.params.graph_id;

  try {
    var events = orchestrationEngine.getAllGraphEvents(graphId);
    if (!events) {
      return res.status(404).json({ success: false, error: 'Graph not found: ' + graphId });
    }

    res.json({ graph_id: graphId, events: events, count: events.length });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to get graph events: ' + e.message });
  }
}

// ─── Route Registration ─────────────────────────────────

/**
 * Register P10.8 autonomous loop routes on Express app
 *
 * IMPORTANT: These routes MUST be registered BEFORE the generic
 * GET /mission/graphs/:graph_id route in mission-routes.js to avoid
 * Express matching :graph_id before /run-loop, /status, or /events.
 *
 * @param {object} app - Express app 实例
 */
function registerAutonomousLoopRoutes(app) {
  // Body parser for POST endpoints (inline, 16KB limit)
  function parseBody(req, res, next) {
    var chunks = [];
    var maxSize = 16 * 1024;
    var totalSize = 0;

    req.on('data', function(chunk) {
      totalSize += chunk.length;
      if (totalSize > maxSize) {
        res.status(413).json({ success: false, error: 'Body too large' });
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', function() {
      var raw = Buffer.concat(chunks).toString('utf-8');
      try {
        req._missionBody = raw ? JSON.parse(raw) : {};
      } catch (e) {
        req._missionBody = {};
      }
      next();
    });

    req.on('error', function() {
      req._missionBody = {};
      next();
    });
  }

  // POST /mission/graphs/:graph_id/run-loop
  app.post('/mission/graphs/:graph_id/run-loop', parseBody, handleRunLoop);

  // POST /mission/graphs/:graph_id/nodes/:node_id/run
  app.post('/mission/graphs/:graph_id/nodes/:node_id/run', parseBody, handleRunNode);

  // GET /mission/graphs/:graph_id/status
  app.get('/mission/graphs/:graph_id/status', handleGraphStatus);

  // GET /mission/graphs/:graph_id/events
  app.get('/mission/graphs/:graph_id/events', handleGraphEvents);
}

module.exports = {
  registerAutonomousLoopRoutes: registerAutonomousLoopRoutes,
  _handleRunLoop: handleRunLoop,
  _handleRunNode: handleRunNode,
  _handleGraphStatus: handleGraphStatus,
  _handleGraphEvents: handleGraphEvents
};
