var WORKERS=[{workerId:'planner',type:'planning',nodeId:'main',status:'idle',tasks:0},{workerId:'analysis',type:'analysis',nodeId:'node-a',status:'idle',tasks:0},{workerId:'content',type:'content',nodeId:'node-a',status:'idle',tasks:0},{workerId:'risk',type:'risk',nodeId:'node-a',status:'busy',tasks:2},{workerId:'memory',type:'memory',nodeId:'japan',status:'idle',tasks:0},{workerId:'review',type:'review',nodeId:'japan',status:'idle',tasks:0}];
function getWorkers(){return WORKERS}
function getWorker(id){return WORKERS.find(function(w){return w.workerId===id})||null}
function getNodeWorkers(nid){return WORKERS.filter(function(w){return w.nodeId===nid})}
function getStatus(){return{total:WORKERS.length,idle:WORKERS.filter(function(w){return w.status==='idle'}).length,busy:WORKERS.filter(function(w){return w.status==='busy'}).length,byNode:{main:getNodeWorkers('main').length,'node-a':getNodeWorkers('node-a').length,japan:getNodeWorkers('japan').length}}}
module.exports={getWorkers:getWorkers,getWorker:getWorker,getNodeWorkers:getNodeWorkers,getStatus:getStatus};
