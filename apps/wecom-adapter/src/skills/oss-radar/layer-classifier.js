'use strict';
// P2 — Layer Classifier
var RULES = [
  { keywords: ['langgraph','langchain','workflow','agentic','multi-agent','orchestrat','dag','pipeline','state machine','autogen','task graph'], layer: 'Workflow Graph' },
  { keywords: ['agent','llm','gpt','chat','assistant','copilot','auto gpt','babyagi','agent runtime','tool calling','function calling','crewai'], layer: 'Agent Runtime' },
  { keywords: ['memory','vector','embedding','retrieval','rag','knowledge graph','context','chroma','pinecone','weaviate','qdrant','milvus','faiss'], layer: 'Memory Bus' },
  { keywords: ['govern','policy','audit','compliance','rbac','permission','approval','review','gate'], layer: 'Governance' },
  { keywords: ['skill','plugin','marketplace','extension','tool registry','capability','module'], layer: 'Skill Marketplace' },
  { keywords: ['quant','trading','finance','stock','qlib','backtest','factor','alpha','portfolio','risk model'], layer: 'Quant Research Engine' },
  { keywords: ['code','developer','ide','copilot','cursor','swe','patch','refactor','lint','code review','pr'], layer: 'Coding Agent' },
  { keywords: ['devops','ci','cd','deploy','kubernetes','docker','terraform','infra','monitor','logging'], layer: 'DevOps' },
  { keywords: ['data','pipeline','etl','streaming','kafka','spark','flink','airflow','dbt','warehouse'], layer: 'Data Pipeline' }
];

function classify(repo) {
  var text = ((repo.description || '') + ' ' + (repo.full_name || '') + ' ' + (repo.name || '') + ' ' + ((repo.topics || []).join(' '))).toLowerCase();
  var best = null; var bestScore = 0;

  RULES.forEach(function (rule) {
    var score = 0;
    rule.keywords.forEach(function (kw) {
      if (text.indexOf(kw.toLowerCase()) >= 0) score += 1;
    });
    if (score > bestScore) { bestScore = score; best = rule.layer; }
  });

  return best || 'Unknown';
}

function getLayers() { return RULES.map(function (r) { return r.layer; }); }

module.exports = { classify: classify, getLayers: getLayers, RULES: RULES };
