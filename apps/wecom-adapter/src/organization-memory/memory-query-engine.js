'use strict';var st=require('./memory-store');
function searchMemory(query){
  if(!query||typeof query!=='string'||query.trim()==='')return[];
  var all=st.listMemory(),qt=query.toLowerCase();
  return all.filter(function(m){
    return (m.title&&m.title.toLowerCase().indexOf(qt)!==-1)||(m.content&&m.content.toLowerCase().indexOf(qt)!==-1)||(m.tags&&m.tags.some(function(t){return t.toLowerCase().indexOf(qt)!==-1;}));});}
function findSimilarGoals(goal){
  if(!goal||!goal.title)return[];
  var all=st.listMemory({type:'knowledge'}),words=(goal.title||'').toLowerCase().split(/\s+/);
  return all.filter(function(m){return words.some(function(w){return w.length>2&&(m.title||'').toLowerCase().indexOf(w)!==-1;});});}
function findRelevantInsights(category){
  var all=st.listMemory({type:'insight'});if(!category)return all;
  return all.filter(function(m){return m.category===category;});}
function findByCategory(category){return st.listMemory({category:category});}
function findByTag(tag){return st.listMemory({tag:tag});}
function topByScore(limit){return st.listMemory({sortBy:'score',limit:limit||10});}
function recentByTime(limit){return st.listMemory({sortBy:'recency',limit:limit||10});}
module.exports={searchMemory,findSimilarGoals,findRelevantInsights,findByCategory,findByTag,topByScore,recentByTime};
