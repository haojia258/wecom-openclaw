"use strict";
/**
 * P20 — Workflow Engine v1
 *
 * Registry + Executor + State Machine + Approval + Retry + Audit
 * REVIEW_ONLY=true. All steps are mock/dry-run.
 */

var fs=require("fs"),path=require("path");
var DIR=path.join(__dirname,"..","..","storage","workflow");
var REG=path.join(DIR,"registry.json"),RUNS=path.join(DIR,"runs.json"),AUDIT=path.join(DIR,"audit.jsonl");

function init(){if(!fs.existsSync(DIR))fs.mkdirSync(DIR,{recursive:true});if(!fs.existsSync(REG))fs.writeFileSync(REG,"[]","utf8");if(!fs.existsSync(RUNS))fs.writeFileSync(RUNS,"[]","utf8")}
init();

// ═══ STATES ═══
var STATES=["created","running","waiting_approval","completed","failed","cancelled"];

// ═══ REGISTRY ═══
function loadReg(){try{return JSON.parse(fs.readFileSync(REG,"utf8"))}catch(e){return[]}}
function saveReg(d){fs.writeFileSync(REG,JSON.stringify(d,null,2),"utf8")}
function register(wf){init();var all=loadReg();if(all.find(function(w){return w.workflowId===wf.workflowId}))throw new Error("duplicate: "+wf.workflowId);wf.status=wf.status||"created";wf.createdAt=new Date().toISOString();all.push(wf);saveReg(all);return wf}
function getWorkflow(id){return loadReg().find(function(w){return w.workflowId===id})||null}
function listWorkflows(){return loadReg().map(function(w){return{workflowId:w.workflowId,name:w.name,domain:w.domain,steps:w.steps.length,status:w.status}})}

// ═══ EXECUTOR + STATE MACHINE ═══
function loadRuns(){try{return JSON.parse(fs.readFileSync(RUNS,"utf8"))}catch(e){return[]}}
function saveRuns(d){fs.writeFileSync(RUNS,JSON.stringify(d,null,2),"utf8")}
function auditLog(entry){var line=JSON.stringify(entry);fs.appendFileSync(AUDIT,line+"\n","utf8")}

function execute(workflowId){
  var wf=getWorkflow(workflowId);if(!wf)return{error:"workflow not found: "+workflowId};
  if(!wf.enabled)return{error:"workflow disabled"};

  var runId="run-"+Date.now().toString(36);
  var run={runId:runId,workflowId:workflowId,name:wf.name,status:"running",stepResults:[],startedAt:new Date().toISOString(),finishedAt:null,error:null,approvalRequired:false,approvalStep:null};
  var runs=loadRuns();runs.push(run);saveRuns(runs);
  auditLog({eventType:"workflow_run_started",runId:runId,workflowId:workflowId,startedAt:run.startedAt});

  for(var i=0;i<wf.steps.length;i++){
    var step=wf.steps[i];var stepResult={stepId:step.stepId,index:i,status:"running",startedAt:new Date().toISOString(),retryCount:0};

    // ── Approval Gate ──
    if(step.type==="approval"||step.requiresApproval){
      stepResult.status="waiting_approval";
      run.status="waiting_approval";
      run.approvalRequired=true;run.approvalStep=step.stepId;
      run.stepResults.push(stepResult);saveRuns(runs);
      auditLog({eventType:"workflow_approval_required",runId:runId,stepId:step.stepId});
      return{runId:runId,status:"waiting_approval",message:"Workflow paused at step: "+step.stepId+" — requires human approval",approvalRequired:true,approvalStep:step.stepId};
    }

    // ── Execute Step (mock) ──
    var attempts=0,max=(step.retryLimit||1);
    while(attempts<max){
      try{
        stepResult.output=mockStep(step,runId);
        stepResult.status="completed";stepResult.finishedAt=new Date().toISOString();stepResult.retryCount=attempts;
        run.stepResults.push(stepResult);
        auditLog({eventType:"workflow_step_completed",runId:runId,stepId:step.stepId,attempts:attempts+1});
        break;
      }catch(e){
        attempts++;
        if(attempts>=max){stepResult.status="failed";stepResult.error=e.message;stepResult.retryCount=attempts;run.status="failed";run.error=step.stepId+" failed after "+attempts+" attempts: "+e.message;run.stepResults.push(stepResult);run.finishedAt=new Date().toISOString();saveRuns(runs);auditLog({eventType:"workflow_step_failed",runId:runId,stepId:step.stepId,error:e.message,attempts:attempts});return{runId:runId,status:"failed",error:run.error}}
        auditLog({eventType:"workflow_step_retrying",runId:runId,stepId:step.stepId,attempt:attempts});
      }
    }
  }

  run.status="completed";run.finishedAt=new Date().toISOString();saveRuns(runs);
  auditLog({eventType:"workflow_run_completed",runId:runId,workflowId:workflowId,steps:run.stepResults.length});
  return{runId:runId,status:"completed",stepResults:run.stepResults};
}

function mockStep(step,runId){return{dryRun:true,stepId:step.stepId,output:"mock_"+step.stepId+"_"+runId,timestamp:new Date().toISOString()};}

// ═══ RUNS ═══
function getRun(runId){return loadRuns().find(function(r){return r.runId===runId})||null}
function getHistory(){return loadRuns().slice(-20).reverse()}

// ═══ DAILY COMMERCE WORKFLOW ═══
function registerDaily(){
  register({workflowId:"daily-commerce-workflow",name:"每日电商工作流",domain:"commerce",enabled:true,steps:[
    {stepId:"collect_data",type:"mock",retryLimit:2},
    {stepId:"analyze_gmv",type:"mock",retryLimit:2},
    {stepId:"analyze_profit",type:"mock",retryLimit:2},
    {stepId:"analyze_activity",type:"mock",retryLimit:2},
    {stepId:"analyze_ads",type:"mock",retryLimit:2},
    {stepId:"analyze_video",type:"mock",retryLimit:2},
    {stepId:"detect_risk",type:"mock",retryLimit:2},
    {stepId:"create_tasks",type:"mock",retryLimit:2},
    {stepId:"human_review",type:"approval",requiresApproval:true,retryLimit:1},
    {stepId:"push_summary",type:"mock",retryLimit:2}
  ]});
}

// Initialize daily workflow
try{getWorkflow("daily-commerce-workflow")||registerDaily()}catch(e){}

module.exports={register,getWorkflow,listWorkflows,execute,getRun,getHistory,STATES};
