'use strict';var fs=require('fs'),path=require('path');
var STORE_DIR=path.join(__dirname,'..','..','..','storage','organization-memory');
var DB_FILE=path.join(STORE_DIR,'knowledge-records.json');
function _ensureDir(){try{if(!fs.existsSync(STORE_DIR))fs.mkdirSync(STORE_DIR,{recursive:true});}catch(e){}}
function _readDb(){try{if(!fs.existsSync(DB_FILE))return{};var raw=fs.readFileSync(DB_FILE,'utf8');if(!raw.trim())return{};return JSON.parse(raw);}catch(e){return{};}}
function _writeDb(data){_ensureDir();var tmp=DB_FILE+'.tmp.'+Date.now();fs.writeFileSync(tmp,JSON.stringify(data,null,2),'utf8');fs.renameSync(tmp,DB_FILE);}
function saveKnowledge(kb){
  var db=_readDb();if(db[kb.knowledgeId])return{success:false,error:'already exists'};
  db[kb.knowledgeId]=kb;_writeDb(db);return{success:true,record:kb};}
function getKnowledge(knowledgeId){var db=_readDb();return db[knowledgeId]||null;}
function listKnowledge(filter){
  filter=filter||{};var db=_readDb();var ids=Object.keys(db),res=[];
  for(var i=0;i<ids.length;i++){var kb=db[ids[i]];var ok=true;
    if(filter.sourceType&&kb.sourceType!==filter.sourceType)ok=false;
    if(filter.category&&kb.category!==filter.category)ok=false;
    if(filter.outcome&&kb.outcome!==filter.outcome)ok=false;
    if(filter.tag&&kb.tags&&kb.tags.indexOf(filter.tag)===-1)ok=false;
    if(filter.minScore!==undefined&&kb.score<filter.minScore)ok=false;
    if(ok)res.push(kb);
  }
  if(filter.sortBy==='score')res.sort(function(a,b){return b.score-a.score;});
  if(filter.sortBy==='recency')res.sort(function(a,b){return new Date(b.createdAt)-new Date(a.createdAt);});
  if(filter.limit)res=res.slice(0,filter.limit);return res;}
function deleteKnowledge(knowledgeId){var db=_readDb();if(!db[knowledgeId])return false;delete db[knowledgeId];_writeDb(db);return true;}
function countKnowledge(){return Object.keys(_readDb()).length;}
function _clearAll(){try{if(fs.existsSync(DB_FILE))fs.unlinkSync(DB_FILE);}catch(e){}}
module.exports={saveKnowledge,getKnowledge,listKnowledge,deleteKnowledge,countKnowledge,_clearAll};
