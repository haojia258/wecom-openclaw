'use strict';
var crypto=require('crypto');
var CAPS=['股票观察','转债观察','风险提醒','价差分析','溢价率分析'];
var CONSTRAINTS={no_order:true,no_broker:true,no_guarantee:true,risk_warning_required:true};
function createMission(p){return{success:true,mission:{mission_id:'tr_'+Date.now().toString(36),domain:'trading',capabilities:CAPS,constraints:CONSTRAINTS,status:'created'}};}
function analyze(p){return{success:true,analysis:{symbols:p.symbols||[],warnings:['高风险提示：仅供观察，不构成投资建议'],timestamp:new Date().toISOString()}};}
function getReport(){return{success:true,report:{constraints:CONSTRAINTS,watchlist:[],risks:[],timestamp:new Date().toISOString()}};}
module.exports={createMission,analyze,getReport,CAPABILITIES:CAPS,CONSTRAINTS:CONSTRAINTS};
