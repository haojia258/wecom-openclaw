"use strict";var fs=require("fs"),path=require("path");
var MDIR=path.join(__dirname,"..","..","storage","memory");
function retention(days){
  var files=["activity-memory.json","asset-memory.json","video-ads-memory.json"];
  var cutoff=Date.now()-days*864e5;var totalRemoved=0;
  files.forEach(function(f){
    var fp=path.join(MDIR,f);
    try{var d=JSON.parse(fs.readFileSync(fp,"utf8"));var before=d.length;
      d=d.filter(function(e){var t=e.timestamp||e.createdAt||e.syncedAt;return t?new Date(t).getTime()>cutoff:true});
      totalRemoved+=before-d.length;fs.writeFileSync(fp,JSON.stringify(d,null,2),"utf8")}catch(e){}
  });
  return{days:days,removed:totalRemoved,message:"保留最近 "+days+" 天"}
}
function archive(days){
  retention(days);
  var total=0;["activity-memory.json","asset-memory.json","video-ads-memory.json"].forEach(function(f){
    try{total+=JSON.parse(fs.readFileSync(path.join(MDIR,f),"utf8")).length}catch(e){}
  });
  return{archived:true,remaining:total};
}
function dedup(){
  var totalDedup=0;
  ["activity-memory.json","asset-memory.json","video-ads-memory.json"].forEach(function(f){
    var fp=path.join(MDIR,f);
    try{var d=JSON.parse(fs.readFileSync(fp,"utf8"));var seen={};d=d.filter(function(e){var k=e.eventId||JSON.stringify(e);if(seen[k]){totalDedup++;return false}seen[k]=true;return true});fs.writeFileSync(fp,JSON.stringify(d,null,2),"utf8")}catch(e){}
  });
  return{deduped:totalDedup}
}
function stats(){return{retention:retention(7),archive:archive(30),dedup:dedup()}}
module.exports={retention,archive,dedup,stats};
