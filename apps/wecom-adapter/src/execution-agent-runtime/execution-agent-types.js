/**
 * execution-agent-types.js — P9.7.4 Agent Runtime types & constants.
 * Dry-run only. No real agent invocation.
 */
'use strict';

const INVOCATION_STATUS = {
  PLANNED:'planned',VALIDATED:'validated',DRY_RUN_READY:'dry_run_ready',
  DRY_RUN_COMPLETED:'dry_run_completed',FAILED:'failed',ARCHIVED:'archived'
};
const INVOCATION_STATUS_VALUES = Object.values(INVOCATION_STATUS);

const ALLOWED_MODES = ['dry-run','supervised'];
const FORBIDDEN_MODES = ['live','auto','execute'];

const ALLOWED_TRANSITIONS = {};
ALLOWED_TRANSITIONS[INVOCATION_STATUS.PLANNED]=[INVOCATION_STATUS.VALIDATED,INVOCATION_STATUS.FAILED];
ALLOWED_TRANSITIONS[INVOCATION_STATUS.VALIDATED]=[INVOCATION_STATUS.DRY_RUN_READY,INVOCATION_STATUS.FAILED];
ALLOWED_TRANSITIONS[INVOCATION_STATUS.DRY_RUN_READY]=[INVOCATION_STATUS.DRY_RUN_COMPLETED,INVOCATION_STATUS.FAILED];
ALLOWED_TRANSITIONS[INVOCATION_STATUS.DRY_RUN_COMPLETED]=[INVOCATION_STATUS.ARCHIVED];
ALLOWED_TRANSITIONS[INVOCATION_STATUS.FAILED]=[];
ALLOWED_TRANSITIONS[INVOCATION_STATUS.ARCHIVED]=[];

const SUPPORTED_AGENTS = ['codex','workbuddy','deepseek','doubao'];

const BUILTIN_ADAPTERS = [
  { name:'codex', capabilities:['code-generation','code-review','debugging','refactoring'], supportedStepTypes:['validation','preparation','checkpoint','finalization'], promptTemplate:'You are Codex. Task: {stepName}. Mode: dry-run.', riskLevel:'low', dryRunOnly:true },
  { name:'workbuddy', capabilities:['task-orchestration','workflow-management','notification','reporting'], supportedStepTypes:['validation','preparation','finalization'], promptTemplate:'You are WorkBuddy. Task: {stepName}. Mode: dry-run.', riskLevel:'low', dryRunOnly:true },
  { name:'deepseek', capabilities:['analysis','reasoning','planning','research'], supportedStepTypes:['validation','preparation'], promptTemplate:'You are DeepSeek. Task: {stepName}. Mode: dry-run.', riskLevel:'low', dryRunOnly:true },
  { name:'doubao', capabilities:['content-generation','translation','summarization'], supportedStepTypes:['validation','preparation','finalization'], promptTemplate:'You are Doubao. Task: {stepName}. Mode: dry-run.', riskLevel:'low', dryRunOnly:true }
];

const ERROR_CODES = {
  INVALID_INVOCATION:'INVALID_INVOCATION',INVALID_INVOCATION_ID:'INVALID_INVOCATION_ID',
  INVALID_ORCHESTRATION_ID:'INVALID_ORCHESTRATION_ID',INVALID_STEP_ID:'INVALID_STEP_ID',
  INVALID_AGENT:'INVALID_AGENT',INVALID_ADAPTER:'INVALID_ADAPTER',
  INVALID_MODE:'INVALID_MODE',INVALID_STATUS:'INVALID_STATUS',
  ADAPTER_NOT_FOUND:'ADAPTER_NOT_FOUND',AGENT_NOT_SUPPORTED:'AGENT_NOT_SUPPORTED',
  STEP_TYPE_MISMATCH:'STEP_TYPE_MISMATCH',LIVE_MODE_FORBIDDEN:'LIVE_MODE_FORBIDDEN',
  REAL_INVOCATION_FORBIDDEN:'REAL_INVOCATION_FORBIDDEN',
  INVOCATION_NOT_FOUND:'INVOCATION_NOT_FOUND'
};

function createInvocationId(){return 'invoke_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,8);}

function createInvocationPlan(orchestrationId,stepId,selectedAgent,options){
  options=options||{};
  return {
    invocationId:options.invocationId||createInvocationId(),
    orchestrationId:orchestrationId||null,
    stepId:stepId||null,
    selectedAgent:selectedAgent||'codex',
    adapterType:selectedAgent||'codex',
    mode:options.mode||'dry-run',
    status:INVOCATION_STATUS.PLANNED,
    promptPreview:options.promptPreview||'',
    commandPreview:null,
    inputSnapshot:options.inputSnapshot||{},
    guardrails:options.guardrails||[],
    expectedOutput:{},
    risks:options.risks||[],
    createdAt:new Date().toISOString(),
    updatedAt:new Date().toISOString(),
    metadata:options.metadata||{}
  };
}

function isValidTransition(from,to){var a=ALLOWED_TRANSITIONS[from];return a?a.indexOf(to)!==-1:false;}
function isTerminal(s){return s===INVOCATION_STATUS.ARCHIVED||s===INVOCATION_STATUS.FAILED;}

module.exports={
  INVOCATION_STATUS,INVOCATION_STATUS_VALUES,ALLOWED_MODES,FORBIDDEN_MODES,
  ALLOWED_TRANSITIONS,SUPPORTED_AGENTS,BUILTIN_ADAPTERS,ERROR_CODES,
  createInvocationId,createInvocationPlan,isValidTransition,isTerminal
};
