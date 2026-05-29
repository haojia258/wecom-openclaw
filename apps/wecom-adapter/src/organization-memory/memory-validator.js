'use strict';var t=require('./memory-types');
function validateMemory(mem){var e=[];
  if(!mem||typeof mem!=='object'){e.push({code:t.ERROR_CODES.INVALID_MEMORY});return{valid:false,errors:e};}
  if(!mem.memoryId||typeof mem.memoryId!=='string'||mem.memoryId.indexOf('mem_')!==0)e.push({code:t.ERROR_CODES.INVALID_MEMORY_ID});
  if(!mem.type||t.MEMORY_TYPE_VALUES.indexOf(mem.type)===-1)e.push({code:t.ERROR_CODES.INVALID_MEMORY_TYPE});
  if(typeof mem.content!=='string')e.push({code:t.ERROR_CODES.INVALID_CONTENT});
  return{valid:e.length===0,errors:e};}
module.exports={validateMemory};
