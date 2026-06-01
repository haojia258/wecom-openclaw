"use strict";
var config=[]; // [{workflowId:"daily-commerce-workflow-v2", cron:"0 8 * * *"}]

function schedule(workflowId,cronExpr){config.push({workflowId:workflowId,cron:cronExpr})}
function getScheduled(){return config}
function manualTrigger(){var wf=null;try{wf=require("../workflow/workflow-v2")}catch(e){}return wf?wf.executeV2():{error:"workflow module not loaded"}}
function status(){return{scheduled:config.length,nextRun:config.length>0?"08:00 daily":"none",dryRun:true,REVIEW_ONLY:true}}

schedule("daily-commerce-workflow-v2","0 8 * * *");
module.exports={schedule,getScheduled,manualTrigger,status};
