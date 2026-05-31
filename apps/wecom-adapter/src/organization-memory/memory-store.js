'use strict';var fs=require('fs'),path=require('path');
var DIR=path.join(__dirname,'..','..','..','storage','organization-memory');
var FILE=path.join(DIR,'memory-store.json');
function _dir(){try{if(!fs.existsSync(DIR))fs.mkdirSync(DIR,{recursive:true});}catch(e){}}
function _read(){try{if(!fs.existsSync(FILE))return{};var r=fs.readFileSync(FILE,'utf8');return r.trim()?JSON.parse(r):{};}catch(e){return{};}}
function _write(d){_dir();var t=FILE+'.tmp.'+Date.now();fs.writeFileSync(t,JSON.stringify(d,null,2),'utf8');fs.renameSync(t,FILE);}
function addMemory(mem){var db=_read();if(db[mem.memoryId])return{success:false,error:'exists'};db[mem.memoryId]=mem;_write(db);return{success:true,memory:mem};}
function getMemory(id){return _read()[id]||null;}
function listMemory(filter){
  filter=filter||{};var db=_read(),ids=Object.keys(db),r=[];
  for(var i=0;i<ids.length;i++){var m=db[ids[i]],ok=true;
    if(filter.type&&m.type!==filter.type)ok=false;
    if(filter.category&&m.category!==filter.category)ok=false;
    if(filter.tag&&m.tags.indexOf(filter.tag)===-1)ok=false;
    if(filter.minScore!==undefined&&m.score<filter.minScore)ok=false;
    if(ok)r.push(m);
  }
  if(filter.sortBy==='score')r.sort(function(a,b){return b.score-a.score;});
  if(filter.sortBy==='recency')r.sort(function(a,b){return new Date(b.createdAt)-new Date(a.createdAt);});
  if(filter.limit)r=r.slice(0,filter.limit);return r;}
function deleteMemory(id){var db=_read();if(!db[id])return false;delete db[id];_write(db);return true;}
function countMemory(){return Object.keys(_read()).length;}
function _clearAll(){try{if(fs.existsSync(FILE))fs.unlinkSync(FILE);}catch(e){}}
module.exports={addMemory,getMemory,listMemory,deleteMemory,countMemory,_clearAll};
