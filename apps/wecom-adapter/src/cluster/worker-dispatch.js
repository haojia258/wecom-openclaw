var pool=require('./worker-pool');var router=require('./worker-router');var reg=require('./node-registry');
function dispatch(type,taskId){var tn=router.route(type);var w=pool.getWorker(type);if(!w)return{error:'No worker for: '+type};var n=reg.getNode(tn);if(!n||n.status==='offline')return{dispatched:false,reason:'node_offline',targetNode:tn,failover:'auto'};w.tasks++;w.status='busy';return{dispatched:true,taskId:taskId,taskType:type,targetNode:tn,workerId:w.workerId,timestamp:new Date().toISOString()}}
module.exports={dispatch:dispatch};
