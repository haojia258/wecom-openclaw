"use strict";var fs=require("fs"),path=require("path");
var MDIR=path.join(__dirname,"..","..","storage","memory");
function init(){if(!fs.existsSync(MDIR))fs.mkdirSync(MDIR,{recursive:true})}
function file(n){return path.join(MDIR,n)}

// Aggregate all memory domains
function agg(){
  var sources=[
    {domain:"activity",file:"activity-memory.json"},
    {domain:"asset",file:"asset-memory.json"},
    {domain:"video-ads",file:"video-ads-memory.json"},
    {domain:"workflow",file:path.join(__dirname,"..","..","storage","workflow","audit.jsonl")}
  ];
  return sources.map(function(s){
    try{var raw=fs.readFileSync(file(s.file),"utf8");return{domain:s.domain,count:raw.trim().split("\n").filter(Boolean).length}}catch(e){return{domain:s.domain,count:0}}
  })
}

// Query across all domains
function query(kw){
  var results=[];
  var sources=["activity-memory.json","asset-memory.json","video-ads-memory.json"];
  sources.forEach(function(f){
    try{var d=JSON.parse(fs.readFileSync(file(f),"utf8"));d.forEach(function(e){if(!kw||JSON.stringify(e).toLowerCase().indexOf(kw.toLowerCase())>=0)results.push(Object.assign({},e,{source:f}))})}catch(e){}
  });
  return results.slice(0,50)
}

// Recent entries
function recent(n){init();return query("").slice(0,n||20)}

// Stats summary
function summary(){
  var a=agg();var total=a.reduce(function(s,x){return s+x.count},0);
  return"🧠 Memory System\n总记录: "+total+"\n"+a.map(function(x){return"• "+x.domain+": "+x.count}).join("\n")+"\n\nquery / SKU / 活动 / 风险 / 最近7天"
}

module.exports={agg,query,recent,summary,init};
