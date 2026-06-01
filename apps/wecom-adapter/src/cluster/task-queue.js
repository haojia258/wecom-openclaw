var q=[{taskId:'t-001',type:'analysis',status:'running',node:'node-a'},{taskId:'t-002',type:'content',status:'pending',node:'node-a'},{taskId:'t-003',type:'review',status:'completed',node:'japan'}];
function getQueue(){return q}
function getStats(){return{total:q.length,pending:q.filter(function(t){return t.status==='pending'}).length,running:q.filter(function(t){return t.status==='running'}).length,completed:q.filter(function(t){return t.status==='completed'}).length,failed:0}}
module.exports={getQueue:getQueue,getStats:getStats};
