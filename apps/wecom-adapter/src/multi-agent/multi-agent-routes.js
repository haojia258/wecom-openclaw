'use strict';

/**
 * multi-agent-routes.js - P11.4 Multi-Agent Express Routes
 */

var runtime = require('./multi-agent-runtime');

var MAX_BODY = 16 * 1024;

function registerMultiAgentRoutes(app) {
  app.post('/multi-agent/missions', function(req, res) {
    var body = req.body || {};
    var bodySize = 0;
    try { bodySize = Buffer.byteLength(JSON.stringify(body), 'utf-8'); } catch (_) {}
    if (bodySize > MAX_BODY) return res.status(413).json({ success: false, error: 'body too large' });

    var result = runtime.createMission({
      mission_type: body.mission_type || 'general',
      requirements: body.requirements || {}
    });
    if (!result.success) return res.status(400).json(result);
    res.status(201).json(result);
  });

  app.get('/multi-agent/missions', function(req, res) {
    res.json(runtime.listMissions());
  });

  app.get('/multi-agent/missions/:id', function(req, res) {
    var result = runtime.getMission(req.params.id);
    if (!result.success) return res.status(404).json(result);
    res.json(result);
  });

  app.post('/multi-agent/missions/:id/run', function(req, res) {
    var result = runtime.runMission(req.params.id);
    if (!result.success) return res.status(400).json(result);
    res.json(result);
  });

  app.get('/multi-agent/missions/:id/report', function(req, res) {
    var result = runtime.getMission(req.params.id);
    if (!result.success) return res.status(404).json(result);
    res.json(result.report || {});
  });

  app.post('/multi-agent/callback', function(req, res) {
    var body = req.body || {};
    if (!body.mission_id || !body.job_id) return res.status(400).json({ success: false, error: 'mission_id and job_id required' });

    var result = runtime.handleCallback(body.mission_id, body);
    if (!result.success) return res.status(400).json(result);
    res.json(result);
  });
}

module.exports = { registerMultiAgentRoutes: registerMultiAgentRoutes };
