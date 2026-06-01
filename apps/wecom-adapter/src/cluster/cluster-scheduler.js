var dispatch=require('./worker-dispatch');var queue=require('./task-queue');var failover=require('./failover-manager');
function schedule(task){var r=dispatch.dispatch(task.type,task.id||'task-'+Date.now().toString(36));if(r.dispatched)return{queued:true,task:r};return{queued:false,reason:r.reason,failover:failover.checkAndFailover()}}
function status(){return{queue:queue.getStats(),nodes:require('./node-registry').getStatus(),failover:failover.checkAndFailover()}}
module.exports={schedule:schedule,status:status,getQueue:queue.getQueue};
