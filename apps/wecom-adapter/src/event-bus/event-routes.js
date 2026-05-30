'use strict';
var bus=require('./event-bus');
function registerEventBusRoutes(app){
  app.post('/event-bus/events',function(req,res){var r=bus.publishEvent(req.body||{});res.status(r.success?201:400).json(r);});
  app.get('/event-bus/events',function(req,res){res.json(bus.listEvents(req.query));});
  app.post('/event-bus/events/:id/ack',function(req,res){res.json(bus.ackEvent(req.params.id));});
  app.post('/event-bus/events/:id/retry',function(req,res){res.json(bus.retryEvent(req.params.id));});
  app.get('/event-bus/dead-letter',function(req,res){res.json(bus.getDeadLetter());});
}
module.exports={registerEventBusRoutes};
