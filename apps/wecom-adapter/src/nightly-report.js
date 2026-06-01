"use strict";var path=require("path");
function generate(){
  var health=require("./foundation-health").health();
  var cov=require("./command-coverage").coverage();
  var mem=null;try{mem=require(path.join(__dirname,"..","memory","memory-engine"))}catch(e){}
  var ms=mem?mem.agg():[];
  return[
    "📊 Foundation Nightly Report",
    "Generated: "+new Date().toISOString().substring(0,19),
    "",
    "═══════════════ Health ═══════════════",
    "Score: "+health.score+"/100",
    health.checks.map(function(c){return c.status+" "+c.name}).join("\n"),
    "",
    "═══════════════ Memory ═══════════════",
    ms.map(function(x){return x.domain+": "+x.count+" entries"}).join("\n"),
    "",
    "═══════════════ Coverage ═══════════════",
    "Commands: "+cov.passed+"/"+cov.total+" ("+cov.rate+")",
    "",
    "REVIEW_ONLY=true | DRY_RUN"
  ].join("\n");
}
module.exports={generate};
