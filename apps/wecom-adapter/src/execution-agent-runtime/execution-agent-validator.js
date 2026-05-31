/** execution-agent-validator.js — P9.7.4 validation */
'use strict';var t=require('./execution-agent-types');
function validateInvocationPlan(p){var e=[];if(!p||typeof p!=='object'){e.push({code:t.ERROR_CODES.INVALID_INVOCATION,message:'plan required'});return{valid:false,errors:e};}
if(!p.invocationId||typeof p.invocationId!=='string'||p.invocationId.indexOf('invoke_')!==0)e.push({code:t.ERROR_CODES.INVALID_INVOCATION_ID,message:'invocationId must start with invoke_'});
if(!p.orchestrationId)e.push({code:t.ERROR_CODES.INVALID_ORCHESTRATION_ID,message:'orchestrationId required'});
if(!p.stepId)e.push({code:t.ERROR_CODES.INVALID_STEP_ID,message:'stepId required'});
if(!p.selectedAgent||t.SUPPORTED_AGENTS.indexOf(p.selectedAgent)===-1)e.push({code:t.ERROR_CODES.INVALID_AGENT,message:'unsupported agent: '+p.selectedAgent});
if(t.FORBIDDEN_MODES.indexOf(p.mode)!==-1)e.push({code:t.ERROR_CODES.LIVE_MODE_FORBIDDEN,message:p.mode+' forbidden'});
else if(t.ALLOWED_MODES.indexOf(p.mode)===-1)e.push({code:t.ERROR_CODES.INVALID_MODE,message:'invalid mode'});
if(!p.status||t.INVOCATION_STATUS_VALUES.indexOf(p.status)===-1)e.push({code:t.ERROR_CODES.INVALID_STATUS,message:'invalid status'});
return{valid:e.length===0,errors:e};}
function validateAdapter(adapter){var e=[];if(!adapter||typeof adapter!=='object'){e.push({code:t.ERROR_CODES.INVALID_ADAPTER,message:'adapter required'});return{valid:false,errors:e};}
if(!adapter.name)e.push({code:t.ERROR_CODES.INVALID_ADAPTER,message:'adapter.name required'});
if(!adapter.dryRunOnly)e.push({code:t.ERROR_CODES.REAL_INVOCATION_FORBIDDEN,message:'adapter must be dryRunOnly'});return{valid:e.length===0,errors:e};}
function validateMode(m){if(t.FORBIDDEN_MODES.indexOf(m)!==-1)return{valid:false,errors:[{code:t.ERROR_CODES.LIVE_MODE_FORBIDDEN,message:m+' forbidden'}]};if(t.ALLOWED_MODES.indexOf(m)===-1)return{valid:false,errors:[{code:t.ERROR_CODES.INVALID_MODE,message:'unknown mode'}]};return{valid:true,errors:[]};}
module.exports={validateInvocationPlan,validateAdapter,validateMode};
