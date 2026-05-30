'use strict';
var crypto=require('crypto');
var STYPES=['growth','efficiency','risk_reduction','inventory','marketing','customer_retention'];
var store={},goals={};

function analyze(params){
  var f=[];
  if(params.gmv!==null&&params.gmv<50000)f.push({type:'gmv_low',sev:'warning',msg:'GMV低于目标'});
  if(params.roi!==null&&params.roi<1.5)f.push({type:'roi_low',sev:'danger',msg:'ROI低于1.5'});
  if((params.risks||[]).length>0)f.push({type:'risk',sev:'warning',msg:'检测到风险'});
  return{success:true,domain:params.domain||'commerce',findings:f,recommended:f.length>0?'risk_reduction':'growth'};
}

function generateStrategy(params){
  var analysis=analyze(params);
  var t=params.type||analysis.recommended;
  if(!STYPES.includes(t))return{success:false,error:'unknown type'};
  var id='str_'+Date.now().toString(36)+'_'+crypto.randomBytes(2).toString('hex');
  var g=[];
  if(t==='growth'){g.push({type:'gmv',target:params.target_gmv||100000});g.push({type:'roi',target:2.0});}
  if(t==='risk_reduction'){g.push({type:'refund_rate',target:5});g.push({type:'inventory_risk',target:0});}
  if(t==='marketing'){g.push({type:'roi',target:3.0});g.push({type:'ctr',target:3});}
  var s={id:id,type:t,domain:params.domain||'commerce',goal:params.goal||'',findings:analysis.findings,missions:[{domain:params.domain||'commerce',type:t==='growth'?'development':'audit',text:'执行'+t+'策略',agents:['workbuddy','deepseek']}],goals:g,status:'draft',created_at:new Date().toISOString()};
  store[id]=s;goals[id]=g;
  return{success:true,strategy:s};
}

function getReport(){return{success:true,strategies:Object.values(store),total:Object.keys(store).length};}
function getGoals(){return{success:true,goals:Object.values(goals).flat()};}

module.exports={analyze,generateStrategy,getReport,getGoals,STRATEGY_TYPES:STYPES};
