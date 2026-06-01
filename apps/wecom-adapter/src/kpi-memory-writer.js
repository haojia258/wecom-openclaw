"use strict";var fs=require("fs"),path=require("path"),crypto=require("crypto");
var MF=path.join(__dirname,"..","..","storage","memory","kpi-memory.json"),LF=path.join(__dirname,"..","..","storage","memory","kpi-learning-log.jsonl");
function init(){try{if(!fs.existsSync(MF))fs.writeFileSync(MF,"[]","utf8")}catch(e){}}
function hash(e){return crypto.createHash("md5").update((e.eventType||"")+"|"+(e.gmv||0)+"|"+(e.profit||0)+"|"+(e.roi||0)+"|"+(e.createdAt||"")).digest("hex").substring(0,16)}
function write(event){init();if(!event||!event.eventType)return{skipped:true};var eid=hash(event),mem=JSON.parse(fs.readFileSync(MF,"utf8"));if(mem.some(function(m){return m.eventId===eid}))return{skipped:true};var entry={eventId:eid,eventType:event.eventType,gmv:event.gmv||0,profit:event.profit||0,roi:event.roi||0,createdAt:event.createdAt||new Date().toISOString(),syncedAt:new Date().toISOString()};mem.unshift(entry);if(mem.length>500)mem=mem.slice(0,500);fs.writeFileSync(MF,JSON.stringify(mem,null,2),"utf8");try{fs.appendFileSync(LF,JSON.stringify(entry)+"\n","utf8")}catch(e){}return{written:true,eventId:eid}}
function stats(){init();var m=JSON.parse(fs.readFileSync(MF,"utf8"));return{total:m.length,lastSync:m.length>0?m[0].createdAt:null}}
function recent(n){init();return JSON.parse(fs.readFileSync(MF,"utf8")).slice(0,n||20)}
module.exports={write,stats,recent};
