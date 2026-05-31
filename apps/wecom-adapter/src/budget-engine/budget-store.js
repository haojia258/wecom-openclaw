'use strict';var crypto=require('crypto');
var TYPES=['ads','campaign','server','token','tool','domain','agent','risk_reserve'];
var REQUIRES_APPROVAL=['ads','campaign','domain'];
var budgets={},usage={};
function createBudget(p){var id='bud_'+Date.now().toString(36)+'_'+crypto.randomBytes(2).toString('hex');var b={id:id,type:p.type||'server',limit:p.limit||0,used:0,unit:p.unit||'CNY',created_at:new Date().toISOString()};budgets[id]=b;usage[id]=[];return{success:true,budget:b,requiresApproval:REQUIRES_APPROVAL.includes(b.type)};}
function recordUsage(p){var b=budgets[p.budget_id];if(!b)return{success:false};var amt=p.amount||0;b.used+=amt;usage[p.budget_id].push({amount:amt,description:p.description||'',timestamp:new Date().toISOString()});var overLimit=b.used>b.limit;var over80=b.used/b.limit>0.8;return{success:true,budget:b,over_limit:overLimit,over_80:over80,remaining:b.limit-b.used,requiresApproval:overLimit&&REQUIRES_APPROVAL.includes(b.type)};}
function getBudget(id){return budgets[id]?{success:true,budget:budgets[id],usage:usage[id]||[]}:{success:false};}
function listBudgets(){return{success:true,budgets:Object.values(budgets),total:Object.keys(budgets).length};}
function generateReport(){var bs=Object.values(budgets);var over=bs.filter(function(b){return b.used>b.limit;});return{success:true,report:{total:bs.length,over_budget:over.length,total_limit:bs.reduce(function(s,b){return s+b.limit;},0),total_used:bs.reduce(function(s,b){return s+b.used;},0),generated_at:new Date().toISOString()}};}
function approveBudget(id){var b=budgets[id];if(!b)return{success:false};b.approved=true;b.approved_at=new Date().toISOString();return{success:true,budget:b};}
module.exports={createBudget,recordUsage,getBudget,listBudgets,generateReport,approveBudget,TYPES,REQUIRES_APPROVAL};
