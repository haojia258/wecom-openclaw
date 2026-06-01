"use strict";var fs=require("fs"),path=require("path");
var DIR=path.join(__dirname,"..","..","storage","video-ads"),SP=path.join(DIR,"video-scripts.json");
function init(){if(!fs.existsSync(DIR))fs.mkdirSync(DIR,{recursive:true});if(!fs.existsSync(SP))fs.writeFileSync(SP,"[]","utf8")}
function load(){try{return JSON.parse(fs.readFileSync(SP,"utf8"))}catch(e){return[]}}
function save(d){fs.writeFileSync(SP,JSON.stringify(d,null,2),"utf8")}
function create(planId){init();var id="scr-"+Date.now().toString(36);
  var s={scriptId:id,videoPlanId:planId,sections:[
    {name:"钩子3秒",content:"你还在为XX烦恼吗？"},
    {name:"痛点",content:"传统方式费时费力效果差"},
    {name:"产品卖点",content:"我们的产品具备3大核心优势"},
    {name:"场景",content:"无论是居家/办公/户外都能用"},
    {name:"价格活动",content:"限时优惠仅需XX元"},
    {name:"CTA",content:"点击下方链接立即购买"}
  ],voiceover:["开场白","问题引入","解决方案","产品展示","限时优惠","立即下单"].join("→"),subtitles:"全字幕建议",status:"draft",createdAt:new Date().toISOString()};
  var all=load();all.unshift(s);save(all);
  // Link to plan
  var planEngine=require("./video-plan-engine");var plan=planEngine.getById(planId);if(plan){plan.scriptId=id;planEngine.updateStatus(planId,"scripted")}
  return s}
function getByProduct(pid){var planEngine=require("./video-plan-engine");var plans=planEngine.getByProduct(pid);var scriptIds=plans.map(function(p){return p.scriptId}).filter(Boolean);return load().filter(function(s){return scriptIds.indexOf(s.scriptId)>=0})}
function getById(id){return load().find(function(s){return s.scriptId===id})||null}
function revise(id,instruction){var all=load();var s=all.find(function(x){return x.scriptId===id});if(!s)return null;s.sections.push({name:"修改说明",content:instruction});s.status="revised";s.revisedAt=new Date().toISOString();save(all);return s}
init();module.exports={create,getByProduct,getById,revise};
