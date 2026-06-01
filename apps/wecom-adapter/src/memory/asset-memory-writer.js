"use strict";var fs=require("fs"),path=require("path"),crypto=require("crypto");
var DIR=path.join(__dirname,"..","..","storage","memory");
var MF=path.join(DIR,"asset-memory.json"),LF=path.join(DIR,"asset-learning-log.jsonl");
function init(){if(!fs.existsSync(DIR))fs.mkdirSync(DIR,{recursive:true});if(!fs.existsSync(MF))fs.writeFileSync(MF,"[]","utf8")}
function hash(e){return crypto.createHash("md5").update((e.eventType||"")+"|"+(e.assetId||"")+"|"+(e.createdAt||"")).digest("hex").substring(0,16)}
function write(event){init();if(!event||!event.eventType)return{skipped:true};var eid=hash(event),mem=JSON.parse(fs.readFileSync(MF,"utf8"));if(mem.some(function(m){return m.eventId===eid}))return{skipped:true,eventId:eid};var entry={eventId:eid,eventType:event.eventType,assetId:event.assetId||null,productId:event.productId||null,createdAt:event.createdAt||new Date().toISOString(),syncedAt:new Date().toISOString()};mem.unshift(entry);if(mem.length>500)mem=mem.slice(0,500);fs.writeFileSync(MF,JSON.stringify(mem,null,2),"utf8");fs.appendFileSync(LF,JSON.stringify(entry)+"\n","utf8");return{written:true,eventId:eid}}
function stats(){init();var m=JSON.parse(fs.readFileSync(MF,"utf8"));var types={};m.forEach(function(e){types[e.eventType]=(types[e.eventType]||0)+1});return{total:m.length,eventTypes:types,lastSync:m.length>0?m[0].createdAt:null}}
function recent(n){init();return JSON.parse(fs.readFileSync(MF,"utf8")).slice(0,n||20)}
module.exports={write,stats,recent};
