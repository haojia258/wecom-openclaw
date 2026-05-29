'use strict';var t=require('./replay-types'),eng=require('./experience-replay-engine'),au=require('./replay-audit');
var _replays=[];
function replayExperienceForGoal(goal){
  var r=eng.replayExperienceForGoal(goal);if(!r.success)return r;
  _replays.push(r.replay);au.recordReplayEvent(r.replay.replayId,'replay_created','system',{goalId:goal.goalId});return r;}
function findSimilarGoalExperiences(goal){return eng.findSimilarGoalExperiences(goal);}
function recommendStrategiesFromMemory(goal){return eng.recommendStrategiesFromMemory(goal);}
function generateRiskWarnings(goal){return eng.generateRiskWarnings(goal);}
function generateReplaySnapshot(replays){return eng.generateReplaySnapshot(replays||_replays);}
function getReplay(id){for(var i=0;i<_replays.length;i++){if(_replays[i].replayId===id)return _replays[i];}return null;}
function listReplays(){return _replays.slice();}
function _reset(){_replays=[];au._reset();}
module.exports={replayExperienceForGoal,findSimilarGoalExperiences,recommendStrategiesFromMemory,generateRiskWarnings,generateReplaySnapshot,getReplay,listReplays,_reset};
