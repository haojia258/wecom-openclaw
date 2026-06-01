var fs=require('fs');var path=require('path');var FILE=path.join(__dirname,'..','..','storage','cluster','node-registry.json');
function load(){try{return JSON.parse(fs.readFileSync(FILE,'utf8'))}catch(e){return[]}}
function save(d){fs.writeFileSync(FILE,JSON.stringify(d,null,2),'utf8')}
function register(node){var all=load();var idx=all.findIndex(function(n){return n.nodeId===node.nodeId});node.heartbeat=new Date().toISOString();node.status='online';if(idx>=0)all[idx]=node;else all.push(node);save(all);return node}
function getAll(){return load()}
function getNode(id){return load().find(function(n){return n.nodeId===id})||null}
function getStatus(){var nodes=load();return{nodes:nodes.length,online:nodes.filter(function(n){return n.status==='online'}).length,offline:nodes.filter(function(n){return n.status==='offline'}).length,list:nodes}}
var defs=[{nodeId:'main',hostname:'49.232.24.120',role:'primary',cpu:23,memory:42,capabilities:['web','kpi','board','brain','dispatch'],status:'online'},{nodeId:'node-a',hostname:'node-a.internal',role:'worker',cpu:8,memory:28,capabilities:['analysis','content','risk'],status:'online'},{nodeId:'japan',hostname:'jp-node.internal',role:'worker',cpu:4,memory:16,capabilities:['oss-radar','review','memory'],status:'online'}];
function init(){var e=load();if(e.length===0)defs.forEach(function(d){register(d)})}
if(!fs.existsSync(FILE))init();
module.exports={register:register,getAll:getAll,getNode:getNode,getStatus:getStatus,init:init};
