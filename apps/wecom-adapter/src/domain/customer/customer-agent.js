'use strict';
var crypto=require('crypto');
var CAPS=['客服回复建议','售后风险摘要','差评风险识别','FAQ生成','企业微信回复模板'];
function createMission(p){var id='cu_'+Date.now().toString(36)+'_'+crypto.randomBytes(2).toString('hex');return{success:true,mission:{mission_id:id,domain:'customer',capabilities:CAPS,status:'created'}};}
function replyDraft(p){return{success:true,draft:{text:p.text||'',sensitive:false,needsApproval:false}};}
module.exports={createMission,replyDraft,CAPABILITIES:CAPS};
