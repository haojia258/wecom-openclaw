/** execution-agent-adapter-registry.js — Built-in agent adapter registry. Dry-run only. */
'use strict';var t=require('./execution-agent-types');
var _adapters={};
t.BUILTIN_ADAPTERS.forEach(function(a){_adapters[a.name]=a;});
function registerAgentAdapter(adapter){if(!adapter||!adapter.name)return{success:false,error:'adapter.name required'};
if(!adapter.dryRunOnly)return{success:false,error:'adapter must be dryRunOnly'};
_adapters[adapter.name]=adapter;return{success:true,adapter:adapter};}
function listAgentAdapters(){return Object.values(_adapters);}
function getAgentAdapter(agentName){return _adapters[agentName]||null;}
function findAdapterForStep(stepName,stepType){var all=listAgentAdapters();
for(var i=0;i<all.length;i++){var a=all[i];if(a.supportedStepTypes&&a.supportedStepTypes.indexOf(stepType)!==-1)return a;}return null;}
function _clearAll(){_adapters={};t.BUILTIN_ADAPTERS.forEach(function(a){_adapters[a.name]=a;});}
module.exports={registerAgentAdapter,listAgentAdapters,getAgentAdapter,findAdapterForStep,_clearAll};
