'use strict';
var runtime = require('./domain-runtime');
var registry = require('./domain-registry');

var MAX_BODY = 16*1024;

function registerDomainRoutes(app) {
  app.post('/domain/:domain/missions', function(req,res) {
    var body = req.body || {};
    var r = runtime.createDomainMission({ domain: req.params.domain, text: body.text, params: body.params });
    if(!r.success) return res.status(400).json(r);
    res.status(201).json(r);
  });
  app.get('/domain/:domain/missions', function(req,res) {
    res.json(runtime.listMissions({ domain: req.params.domain }));
  });
  app.get('/domain/:domain/missions/:id', function(req,res) {
    var r = runtime.getMission(req.params.id);
    if(!r.success) return res.status(404).json(r);
    res.json(r);
  });
  app.post('/domain/:domain/missions/:id/run', function(req,res) {
    var r = runtime.runMission(req.params.id);
    if(!r.success) return res.status(400).json(r);
    res.json(r);
  });
  app.get('/domain/:domain/missions/:id/report', function(req,res) {
    var r = runtime.getMission(req.params.id);
    if(!r.success) return res.status(404).json(r);
    res.json({ success:true, report: r.mission.report || { status: r.mission.status, progress: r.mission.progress } });
  });
  app.get('/domain/list', function(req,res) {
    res.json({ success:true, domains: registry.listDomains() });
  });
}

module.exports = { registerDomainRoutes: registerDomainRoutes };
