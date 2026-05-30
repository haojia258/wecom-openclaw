'use strict';
var store=require('./memory-store');
function registerMemoryRoutes(app){
  app.post('/memory/records',function(req,res){var r=store.recordMemory(req.body||{});res.status(r.success?201:400).json(r);});
  app.get('/memory/records',function(req,res){res.json(store.listMemories(req.query));});
  app.get('/memory/records/:id',function(req,res){var r=store.getMemory(req.params.id);if(!r.success)return res.status(404).json(r);res.json(r);});
  app.post('/memory/search',function(req,res){res.json(store.searchMemories((req.body||{}).q));});
  app.post('/memory/records/:id/link',function(req,res){res.json(store.linkMemory(req.params.id,(req.body||{}).target,(req.body||{}).relation));});
  app.post('/memory/summarize',function(req,res){res.json(store.summarizeMemory(req.body||{}));});
}
module.exports={registerMemoryRoutes};
