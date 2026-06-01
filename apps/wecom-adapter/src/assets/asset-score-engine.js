"use strict";var store=require("./asset-store");
function score(asset){
  var rv=asset.status==="reviewed"?100:asset.status==="raw"?50:0;
  var ql=(asset.tags&&asset.tags.length>0?60:20)+(asset.title&&asset.title.length>3?30:10);
  var fr=0;if(asset.createdAt){var days=(Date.now()-new Date(asset.createdAt).getTime())/864e5;fr=days<7?80:days<30?60:days<90?40:20}
  var us=asset.status==="reviewed"?70:40;
  var cv=asset.score||40;
  var tg=asset.tags&&asset.tags.length>=3?90:asset.tags&&asset.tags.length>=1?50:10;
  var final=Math.round(rv*0.2+ql*0.2+fr*0.15+us*0.15+cv*0.2+tg*0.1);
  return{assetId:asset.assetId,reviewScore:rv,qualityScore:ql,freshnessScore:fr,usageScore:us,conversionScore:cv,tagMatchScore:tg,finalAssetScore:Math.max(1,Math.min(100,final))};
}
function scoreAsset(assetId){var a=store.getById(assetId);if(!a)return{error:"not found"};var s=score(a);a.score=s.finalAssetScore;a.updatedAt=new Date().toISOString();return s}
function rescoreAll(pid){var list=store.getByProduct(pid);return list.map(function(a){return scoreAsset(a.assetId)})}
function topScored(pid){return store.getByProduct(pid).sort(function(a,b){return(b.score||0)-(a.score||0)}).slice(0,10).map(function(a){return{assetId:a.assetId,title:a.title,type:a.type,finalAssetScore:a.score}})}
module.exports={score,scoreAsset,rescoreAll,topScored};
