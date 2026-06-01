"use strict";var planner=require("./enterprise-planner");
function build(){
  var p=planner.plan();
  var nodes=p.tasks.map(function(t){return{id:t.task,domain:t.domain,priority:t.priority,status:t.status,dependsOn:t.dependsOn||[],requiresApproval:t.requiresApproval||false}});
  var edges=[];nodes.forEach(function(n){n.dependsOn.forEach(function(d){edges.push({from:d,to:n.id})})});
  return{nodes:nodes,edges:edges,metrics:p.metrics}
}
function nextReady(){
  var g=build();return g.nodes.filter(function(n){return n.status==="ready"&&n.dependsOn.every(function(d){var dep=g.nodes.find(function(x){return x.id===d});return dep&&dep.status==="completed"})})
}
module.exports={build,nextReady};
