"use strict";
/** P70 P1 — Asset Store. CRUD + search + config via JSON storage. */
var fs=require("fs"),path=require("path"),crypto=require("crypto");
var DIR=path.join(__dirname,"..","..","storage","assets");
var IDX=path.join(DIR,"asset-index.json"),CFG=path.join(DIR,"asset-config.json");

function init(){if(!fs.existsSync(DIR))fs.mkdirSync(DIR,{recursive:true});if(!fs.existsSync(IDX))fs.writeFileSync(IDX,"[]","utf8");if(!fs.existsSync(CFG))fs.writeFileSync(CFG,JSON.stringify({REVIEW_ONLY:true,ASSET_PUBLISH_EXECUTE:false,VIDEO_PUBLISH_EXECUTE:false},null,2),"utf8");}
function load(){try{return JSON.parse(fs.readFileSync(IDX,"utf8"))}catch(e){return[]}}
function save(d){fs.writeFileSync(IDX,JSON.stringify(d,null,2),"utf8")}
function uid(){return "ast-"+Date.now().toString(36)+"-"+crypto.randomBytes(3).toString("hex")}

function getConfig(){return JSON.parse(fs.readFileSync(CFG,"utf8"))}

// CRUD
function ingest(productId,asset){init();var all=load();asset.assetId=uid();asset.productId=productId;asset.status="raw";asset.score=0;asset.createdAt=new Date().toISOString();asset.updatedAt=asset.createdAt;all.unshift(asset);save(all);return asset}
function getByProduct(productId){return load().filter(function(a){return a.productId===productId})}
function getById(assetId){return load().find(function(a){return a.assetId===assetId})||null}
function updateTags(assetId,tags){var all=load();var a=all.find(function(x){return x.assetId===assetId});if(!a)return null;a.tags=tags;a.updatedAt=new Date().toISOString();save(all);return a}
function archive(assetId){var all=load();var a=all.find(function(x){return x.assetId===assetId});if(!a)return null;a.status="archived";a.updatedAt=new Date().toISOString();save(all);return a}
function stats(){var all=load();return{total:all.length,raw:all.filter(function(a){return a.status==="raw"}).length,reviewed:all.filter(function(a){return a.status==="reviewed"}).length,rejected:all.filter(function(a){return a.status==="rejected"}).length,archived:all.filter(function(a){return a.status==="archived"}).length,products:Object.keys(all.reduce(function(m,a){m[a.productId]=true;return m},{})).length}}

init();
module.exports={ingest,getByProduct,getById,updateTags,archive,getAll:load,stats,getConfig,init};
