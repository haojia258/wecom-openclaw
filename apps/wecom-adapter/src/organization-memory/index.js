'use strict';var types=require('./knowledge-types'),valid=require('./knowledge-validator'),store=require('./knowledge-store'),runtime=require('./knowledge-capture-runtime'),audit=require('./knowledge-audit');
module.exports={
  SOURCE_TYPE:types.SOURCE_TYPE,CATEGORY:types.CATEGORY,OUTCOME:types.OUTCOME,ERROR_CODES:types.ERROR_CODES,createKnowledgeRecord:types.createKnowledgeRecord,
  validateKnowledge:valid.validateKnowledge,
  saveKnowledge:store.saveKnowledge,getKnowledge:store.getKnowledge,listKnowledge:store.listKnowledge,
  captureKnowledge:runtime.captureKnowledge,captureFromGoal:runtime.captureFromGoal,captureFromExecutionAnalytics:runtime.captureFromExecutionAnalytics,captureFromOrchestration:runtime.captureFromOrchestration,
  getKnowledgeRecord:runtime.getKnowledgeRecord,listKnowledgeRecords:runtime.listKnowledgeRecords,generateKnowledgeSnapshot:runtime.generateKnowledgeSnapshot,
  recordKnowledgeEvent:audit.recordKnowledgeEvent,listKnowledgeEvents:audit.listKnowledgeEvents,
  _reset:runtime._reset,_clearAll:store._clearAll
};
