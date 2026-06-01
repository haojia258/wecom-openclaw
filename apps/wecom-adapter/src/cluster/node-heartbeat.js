var reg=require('./node-registry');
function ping(id){var n=reg.getNode(id);if(!n)return{error:'not found'};n.heartbeat=new Date().toISOString();n.status='online';reg.register(n);return{nodeId:id,status:'online',heartbeat:n.heartbeat,latency:Math.floor(Math.random()*50)+'ms'}}
function checkAll(){var nodes=reg.getAll();var now=Date.now();var r=[];nodes.forEach(function(n){var last=new Date(n.heartbeat||0).getTime();var alive=now-last<30000;if(!alive&&n.status==='online'){n.status='offline';reg.register(n)}r.push({nodeId:n.nodeId,status:n.status,lastSeen:n.heartbeat,alive:alive})});return r}
module.exports={ping:ping,checkAll:checkAll};
