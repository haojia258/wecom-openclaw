'use strict';var crypto=require('crypto');
var TYPES=['git.merge','pm2.restart','deploy.production','server.write','budget.increase','ad.budget.increase','customer.high_risk_reply','trading.high_risk_alert','campaign.enroll','domain.high_risk_action'];
var requests={};
function createRequest(p){
  if(!TYPES.includes(p.type))return{success:false,error:'unknown approval type'};
  var id='apr_'+Date.now().toString(36)+'_'+crypto.randomBytes(2).toString('hex');
  var r={id:id,type:p.type,source:p.source||'',details:p.details||{},requestor:p.requestor||'unknown',status:'pending',created_at:new Date().toISOString(),expires_at:new Date(Date.now()+3600000).toISOString(),approved_at:null,rejected_at:null,approver:null,reason:''};
  requests[id]=r;return{success:true,request:r};
}
function getRequest(id){return requests[id]?{success:true,request:requests[id]}:{success:false};}
function listRequests(f){
  var l=Object.values(requests);
  if(f&&f.status)l=l.filter(function(r){return r.status===f.status;});
  return{success:true,requests:l,total:l.length};
}
function getPending(){return listRequests({status:'pending'});}
function approveRequest(id,info){var r=requests[id];if(!r)return{success:false};if(r.status!=='pending')return{success:false,error:'not pending'};if(new Date(r.expires_at)<new Date()){r.status='expired';return{success:false,error:'request expired'};}
r.status='approved';r.approver=info.operator||'unknown';r.reason=info.reason||'';r.approved_at=new Date().toISOString();return{success:true,request:r};}
function rejectRequest(id,info){var r=requests[id];if(!r)return{success:false};if(r.status!=='pending')return{success:false};r.status='rejected';r.reason=info.reason||'';r.rejected_at=new Date().toISOString();return{success:true,request:r};}
function expireRequests(){var n=new Date();Object.keys(requests).forEach(function(k){if(requests[k].status==='pending'&&new Date(requests[k].expires_at)<n)requests[k].status='expired';});return{success:true};}
function formatWeCom(req){var lines=['⏸️ **审批请求: '+req.type+'**','','| 字段 | 值 |','|------|-----|','| ID | `'+req.id+'` |','| Type | '+req.type+' |','| Status | '+req.status+' |'];if(req.details)lines.push('| Details | '+JSON.stringify(req.details).substring(0,100)+' |');lines.push('');lines.push('请使用 `/审批 '+req.id+'` 或 `/拒绝 '+req.id+'`');return lines.join('\n');}
function generateReport(){var l=Object.values(requests);var approved=l.filter(function(r){return r.status==='approved';});var rejected=l.filter(function(r){return r.status==='rejected';});return{success:true,report:{total:l.length,approved:approved.length,rejected:rejected.length,pending:l.length-approved.length-rejected.length,generated_at:new Date().toISOString()}};}
module.exports={createRequest,getRequest,listRequests,getPending,approveRequest,rejectRequest,expireRequests,formatWeCom,generateReport,TYPES};
