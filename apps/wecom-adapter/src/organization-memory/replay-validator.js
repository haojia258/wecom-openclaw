'use strict';var t=require('./replay-types');
function validateReplay(rep){var e=[];
  if(!rep||typeof rep!=='object'){e.push({code:t.ERROR_CODES.INVALID_REPLAY});return{valid:false,errors:e};}
  if(!rep.replayId||typeof rep.replayId!=='string'||rep.replayId.indexOf('replay_')!==0)e.push({code:t.ERROR_CODES.INVALID_REPLAY_ID});
  if(!rep.goalId||typeof rep.goalId!=='string')e.push({code:t.ERROR_CODES.INVALID_GOAL});
  return{valid:e.length===0,errors:e};}
module.exports={validateReplay};
