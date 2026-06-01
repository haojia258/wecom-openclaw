"use strict";var store=require("./asset-store");
function search(query){var all=store.getAll();if(!query)return all.slice(0,20);var q=query.toLowerCase();return all.filter(function(a){return JSON.stringify(a).toLowerCase().indexOf(q)>=0}).slice(0,20)}
function byProduct(pid){return store.getByProduct(pid)}
function bySku(sku){return store.getAll().filter(function(a){return a.skuId===sku})}
function byTags(tags){return store.getAll().filter(function(a){return a.tags&&a.tags.some(function(t){return tags.indexOf(t)>=0})})}
function byType(type){return store.getAll().filter(function(a){return a.type===type})}
function topAssets(pid){return store.getByProduct(pid).sort(function(a,b){return(b.score||0)-(a.score||0)}).slice(0,10)}
module.exports={search,byProduct,bySku,byTags,byType,topAssets};
