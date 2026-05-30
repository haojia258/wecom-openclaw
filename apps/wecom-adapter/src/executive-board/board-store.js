'use strict';
var crypto=require('crypto');

var MEMBERS=['CEO Agent','COO Agent','CTO Agent','CMO Agent','CFO Agent'];
var VOTE_RESULTS=['approve','reject','needs_info','requires_human'];
var reviews={},votes={};

function review(params){
  var id='brd_'+Date.now().toString(36)+'_'+crypto.randomBytes(2).toString('hex');
  var r={id:id,topic:params.topic||'',type:params.type||'strategy',domain:params.domain||'general',status:'in_review',members:MEMBERS,vote_count:{approve:0,reject:0,needs_info:0,requires_human:0},created_at:new Date().toISOString(),expires_at:new Date(Date.now()+86400000).toISOString()};
  reviews[id]=r;votes[id]={};
  return{success:true,review:r};
}

function getReview(id){return reviews[id]?{success:true,review:reviews[id],votes:votes[id]}:{success:false};}
function listReviews(){var l=Object.values(reviews);return{success:true,reviews:l,total:l.length};}

function vote(reviewId,member,result){
  if(!reviews[reviewId])return{success:false,error:'review not found'};
  if(!MEMBERS.includes(member))return{success:false,error:'unknown member'};
  if(!VOTE_RESULTS.includes(result))return{success:false,error:'invalid vote'};
  if(votes[reviewId]&&votes[reviewId][member])return{success:false,error:'already voted'};
  var v={review_id:reviewId,member:member,result:result,reason:'',timestamp:new Date().toISOString()};
  if(!votes[reviewId])votes[reviewId]={};
  votes[reviewId][member]=v;
  reviews[reviewId].vote_count[result]=(reviews[reviewId].vote_count[result]||0)+1;
  // Determine result
  var totalVotes=Object.keys(votes[reviewId]).length;
  if(totalVotes>=3){
    var vc=reviews[reviewId].vote_count;
    if(vc.approve>=3)reviews[reviewId].result='approved';
    else if(vc.reject>=3)reviews[reviewId].result='rejected';
    else if(vc.requires_human>=1)reviews[reviewId].result='requires_human';
    else if(vc.approve>=vc.reject)reviews[reviewId].result='approved';
    reviews[reviewId].status='completed';
  }
  return{success:true,vote:v,review_status:reviews[reviewId].status};
}

function generateReport(){
  var l=Object.values(reviews);
  return{success:true,report:{total:l.length,completed:l.filter(function(r){return r.status==='completed';}).length,in_review:l.filter(function(r){return r.status==='in_review';}).length,generated_at:new Date().toISOString()}};
}

module.exports={review,getReview,listReviews,vote,generateReport,MEMBERS,VOTE_RESULTS};
