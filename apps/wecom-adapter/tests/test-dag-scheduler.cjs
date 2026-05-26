'use strict';

// Test environment isolation
process.env.TASK_DB_PATH = process.env.TASK_DB_PATH ||
  require('path').resolve(__dirname, '../logs/tasks-test/test-tasks.db');
process.env.TASK_LOG_DIR = process.env.TASK_LOG_DIR ||
  require('path').resolve(__dirname, '../logs/tasks-test');

var fs = require('fs');
var path = require('path');

// SUT imports
var { DAGNode } = require('../src/orchestrator/v2/dag-node');
var dagScheduler = require('../src/orchestrator/v2/dag-scheduler');
var dagPlan = require('../src/orchestrator/v2/dag-executor-plan');

// Test infrastructure
var passed = 0;
var failed = 0;
var total = 0;

function assert(condition, label) {
  total++;
  if (condition) { passed++; }
  else { console.log('  FAIL: ' + (label || '(unnamed)')); failed++; }
}

function assertEqual(actual, expected, label) {
  total++;
  if (actual === expected) { passed++; }
  else {
    console.log('  FAIL: ' + (label || '(unnamed)') + ' — expected: ' + JSON.stringify(expected) + ', got: ' + JSON.stringify(actual));
    failed++;
  }
}

function assertContains(str, substring, label) {
  total++;
  if (str && str.indexOf(substring) !== -1) { passed++; }
  else { console.log('  FAIL: ' + (label || 'str doesn\'t contain') + ' — "' + substring + '" not found'); failed++; }
}

function assertDeepEqual(actual, expected, label) {
  total++;
  if (JSON.stringify(actual) === JSON.stringify(expected)) { passed++; }
  else {
    console.log('  FAIL: ' + (label || '(unnamed)') + ' — expected: ' + JSON.stringify(expected) + ', got: ' + JSON.stringify(actual));
    failed++;
  }
}

// ==================== GROUP A: DAGNode Creation ====================
console.log('\n=== GROUP A: DAGNode 创建和属性 ===');

(function testGroupA() {
  // A1: basic creation
  var node = new DAGNode('cmd1', 'codex', 'analyze', 1, 'analyze data', [], {});
  assert(node instanceof DAGNode, 'A1: instanceof DAGNode');
  assertEqual(node.id, 'cmd1', 'A2: id');
  assertEqual(node.agent, 'codex', 'A3: agent');
  assertEqual(node.command, 'analyze', 'A4: command');
  assertEqual(node.priority, 1, 'A5: priority');
  assertEqual(node.blocked, false, 'A6: blocked default false');
  assertEqual(node.blockReason, null, 'A7: blockReason default null');
  assert(Array.isArray(node.dependsOn), 'A8: dependsOn is array');
  assertEqual(node.dependsOn.length, 0, 'A9: dependsOn empty');

  // A10: with dependencies
  var node2 = new DAGNode('cmd2', 'deepseek', 'strategy', 2, 'strategy', ['cmd1'], {});
  assertEqual(node2.dependsOn.length, 1, 'A10: dependsOn has 1 item');
  assertEqual(node2.dependsOn[0], 'cmd1', 'A11: dependsOn value');

  // A12: dependsOn is cloned (not shared reference)
  var deps = ['a', 'b'];
  var node3 = new DAGNode('cmd3', 'workbuddy', 'plan', 3, 'plan', deps, {});
  deps.push('c');
  assertEqual(node3.dependsOn.length, 2, 'A12: dependsOn defensive copy');

  // A13: non-array dependsOn
  var node4 = new DAGNode('cmd4', 'doubao', 'content', 4, 'content', 'not_array', {});
  assert(Array.isArray(node4.dependsOn), 'A13: non-array dependsOn -> empty array');
  assertEqual(node4.dependsOn.length, 0, 'A14: non-array dependsOn empty');

  // A15: fromQueueItem
  var item = { seq: 1, agent: 'codex', command: 'analyze_gmv', priority: 1, reason: 'test', dependsOn: [] };
  var qNode = DAGNode.fromQueueItem(item);
  assertEqual(qNode.id, 'analyze_gmv', 'A15: fromQueueItem id from command');
  assertEqual(qNode.agent, 'codex', 'A16: fromQueueItem agent');
  assertEqual(qNode.command, 'analyze_gmv', 'A17: fromQueueItem command');

  // A18: fromQueueItem without command
  var item2 = { seq: 1, agent: 'codex', priority: 1, reason: 'test' };
  var qNode2 = DAGNode.fromQueueItem(item2);
  assertEqual(qNode2.id, 'codex_1', 'A18: fromQueueItem fallback id');

  // A19: setBlocked
  qNode.setBlocked('RBAC deny');
  assertEqual(qNode.blocked, true, 'A19: blocked flag');
  assertEqual(qNode.blockReason, 'RBAC deny', 'A20: blockReason');

  // A21: toJSON
  var json = node.toJSON();
  assertEqual(json.id, 'cmd1', 'A21: toJSON id');
  assertEqual(json.agent, 'codex', 'A22: toJSON agent');
  assertEqual(json.blocked, false, 'A23: toJSON blocked false');
  assert(typeof json.blockReason === 'undefined', 'A24: toJSON no blockReason when null');

  // A25: toJSON with blockReason
  var json2 = qNode.toJSON();
  assertEqual(json2.blocked, true, 'A25: toJSON blocked true');
  assertEqual(json2.blockReason, 'RBAC deny', 'A26: toJSON blockReason');

  // A27: context in toJSON
  var nodeWithCtx = new DAGNode('c1', 'codex', 'cmd', 1, 'r', [], { key: 'val' });
  var json3 = nodeWithCtx.toJSON();
  assertEqual(json3.context.key, 'val', 'A27: toJSON with context');
})();

// ==================== GROUP B: buildDAG ====================
console.log('\n=== GROUP B: buildDAG — 队列转 DAG ===');

(function testGroupB() {
  // B1: empty queue
  var dag1 = dagScheduler.buildDAG([]);
  assertEqual(dag1.nodes.length, 0, 'B1: empty queue 0 nodes');
  assertEqual(dag1.edges.length, 0, 'B2: empty queue 0 edges');

  // B3: single node
  var singleItem = [{ seq: 1, agent: 'codex', command: 'cmd1', priority: 1, reason: 'test', dependsOn: [] }];
  var dag2 = dagScheduler.buildDAG(singleItem);
  assertEqual(dag2.nodes.length, 1, 'B3: single node');
  assertEqual(dag2.edges.length, 0, 'B4: no edges for single node');
  assertEqual(dag2.nodes[0].id, 'cmd1', 'B5: node id');

  // B6-8: chain A->B->C
  var chain = [
    { seq: 1, agent: 'codex', command: 'cmd_a', priority: 1, reason: 'a', dependsOn: [] },
    { seq: 2, agent: 'deepseek', command: 'cmd_b', priority: 2, reason: 'b', dependsOn: ['cmd_a'] },
    { seq: 3, agent: 'workbuddy', command: 'cmd_c', priority: 3, reason: 'c', dependsOn: ['cmd_b'] },
  ];
  var dag3 = dagScheduler.buildDAG(chain);
  assertEqual(dag3.nodes.length, 3, 'B6: chain 3 nodes');
  assertEqual(dag3.edges.length, 2, 'B7: chain 2 edges');
  assertEqual(dag3.edges[0].from, 'cmd_a', 'B8: first edge from');
  assertEqual(dag3.edges[0].to, 'cmd_b', 'B9: first edge to');
  assertEqual(dag3.edges[1].from, 'cmd_b', 'B10: second edge from');
  assertEqual(dag3.edges[1].to, 'cmd_c', 'B11: second edge to');

  // B12-14: inDegree
  assertEqual(dag3.inDegree['cmd_a'], 0, 'B12: root inDegree=0');
  assertEqual(dag3.inDegree['cmd_b'], 1, 'B13: middle inDegree=1');
  assertEqual(dag3.inDegree['cmd_c'], 1, 'B14: leaf inDegree=1');

  // B15-17: adjacency
  assertDeepEqual(dag3.adjacency['cmd_a'], ['cmd_b'], 'B15: adjacency root');
  assertDeepEqual(dag3.adjacency['cmd_b'], ['cmd_c'], 'B16: adjacency middle');
  assertDeepEqual(dag3.adjacency['cmd_c'], [], 'B17: adjacency leaf');

  // B18-20: fanout A->[B,C]
  var fanout = [
    { seq: 1, agent: 'codex', command: 'root', priority: 1, reason: 'r', dependsOn: [] },
    { seq: 2, agent: 'deepseek', command: 'branch1', priority: 2, reason: 'b1', dependsOn: ['root'] },
    { seq: 3, agent: 'workbuddy', command: 'branch2', priority: 2, reason: 'b2', dependsOn: ['root'] },
  ];
  var dag4 = dagScheduler.buildDAG(fanout);
  assertEqual(dag4.edges.length, 2, 'B18: fanout 2 edges');
  assertEqual(dag4.inDegree['branch1'], 1, 'B19: branch1 inDegree=1');
  assertEqual(dag4.inDegree['branch2'], 1, 'B20: branch2 inDegree=1');

  // B21-23: fanin [A,B]->C
  var fanin = [
    { seq: 1, agent: 'codex', command: 'src1', priority: 1, reason: 's1', dependsOn: [] },
    { seq: 2, agent: 'workbuddy', command: 'src2', priority: 1, reason: 's2', dependsOn: [] },
    { seq: 3, agent: 'deepseek', command: 'target', priority: 3, reason: 't', dependsOn: ['src1', 'src2'] },
  ];
  var dag5 = dagScheduler.buildDAG(fanin);
  assertEqual(dag5.inDegree['target'], 2, 'B21: fanin target inDegree=2');
  assertEqual(dag5.inDegree['src1'], 0, 'B22: src1 root');
  assertEqual(dag5.inDegree['src2'], 0, 'B23: src2 root');

  // B24: duplicate command IDs get suffixed
  var dup = [
    { seq: 1, agent: 'codex', command: 'same_cmd', priority: 1, reason: 'a', dependsOn: [] },
    { seq: 2, agent: 'deepseek', command: 'same_cmd', priority: 2, reason: 'b', dependsOn: [] },
  ];
  var dag6 = dagScheduler.buildDAG(dup);
  assertEqual(dag6.nodes.length, 2, 'B24: duplicate handled');
  assert(dag6.nodes[0].id !== dag6.nodes[1].id, 'B25: unique ids');
})();

// ==================== GROUP C: topologicalSort ====================
console.log('\n=== GROUP C: topologicalSort — 阶段排序 ===');

(function testGroupC() {
  // C1: empty
  var dag0 = dagScheduler.buildDAG([]);
  var sort0 = dagScheduler.topologicalSort(dag0);
  assertEqual(sort0.totalStages, 0, 'C1: empty 0 stages');

  // C2: single node
  var dag1 = dagScheduler.buildDAG([{ seq: 1, agent: 'codex', command: 'cmd', priority: 1, reason: 't', dependsOn: [] }]);
  var sort1 = dagScheduler.topologicalSort(dag1);
  assertEqual(sort1.totalStages, 1, 'C2: single node 1 stage');
  assertEqual(sort1.stages[0].length, 1, 'C3: stage has 1 node');

  // C4-6: chain A->B->C → 3 stages
  var chain = [
    { seq: 1, agent: 'codex', command: 'a', priority: 1, reason: 'a', dependsOn: [] },
    { seq: 2, agent: 'deepseek', command: 'b', priority: 2, reason: 'b', dependsOn: ['a'] },
    { seq: 3, agent: 'workbuddy', command: 'c', priority: 3, reason: 'c', dependsOn: ['b'] },
  ];
  var dag2 = dagScheduler.buildDAG(chain);
  var sort2 = dagScheduler.topologicalSort(dag2);
  assertEqual(sort2.totalStages, 3, 'C4: chain 3 stages');
  assertEqual(sort2.stages[0][0].id, 'a', 'C5: stage 1 has a');
  assertEqual(sort2.stages[1][0].id, 'b', 'C6: stage 2 has b');
  assertEqual(sort2.stages[2][0].id, 'c', 'C7: stage 3 has c');

  // C8-9: fanout → 2 stages (root + 2 parallel)
  var fanout = [
    { seq: 1, agent: 'codex', command: 'root', priority: 1, reason: 'r', dependsOn: [] },
    { seq: 2, agent: 'deepseek', command: 'b1', priority: 2, reason: 'b1', dependsOn: ['root'] },
    { seq: 3, agent: 'workbuddy', command: 'b2', priority: 2, reason: 'b2', dependsOn: ['root'] },
  ];
  var dag3 = dagScheduler.buildDAG(fanout);
  var sort3 = dagScheduler.topologicalSort(dag3);
  assertEqual(sort3.totalStages, 2, 'C8: fanout 2 stages');
  assertEqual(sort3.stages[0].length, 1, 'C9: stage 1 = 1 node (root)');
  assertEqual(sort3.stages[1].length, 2, 'C10: stage 2 = 2 nodes (parallel)');

  // C11-13: fanin → 3 stages (2 parallel roots + 1 target)
  var fanin = [
    { seq: 1, agent: 'codex', command: 's1', priority: 1, reason: 's1', dependsOn: [] },
    { seq: 2, agent: 'workbuddy', command: 's2', priority: 1, reason: 's2', dependsOn: [] },
    { seq: 3, agent: 'deepseek', command: 't', priority: 3, reason: 't', dependsOn: ['s1', 's2'] },
  ];
  var dag4 = dagScheduler.buildDAG(fanin);
  var sort4 = dagScheduler.topologicalSort(dag4);
  assertEqual(sort4.totalStages, 2, 'C11: fanin 2 stages');
  assertEqual(sort4.stages[0].length, 2, 'C12: stage 1 = 2 parallel roots');
  assertEqual(sort4.stages[1].length, 1, 'C13: stage 2 = 1 target');

  // C14-16: OPTIMIZE_WECOM pattern
  var wecom = [
    { seq: 1, agent: 'codex', command: 'analyze_wecom_logs', priority: 1, reason: 'a', dependsOn: [] },
    { seq: 2, agent: 'workbuddy', command: 'check_status', priority: 2, reason: 'b', dependsOn: [] },
    { seq: 3, agent: 'deepseek', command: 'stability_optimization_plan', priority: 3, reason: 'c', dependsOn: ['analyze_wecom_logs', 'check_status'] },
    { seq: 4, agent: 'codex', command: 'implement_stability_fixes', priority: 4, reason: 'd', dependsOn: ['stability_optimization_plan'] },
  ];
  var dag5 = dagScheduler.buildDAG(wecom);
  var sort5 = dagScheduler.topologicalSort(dag5);
  assertEqual(sort5.totalStages, 3, 'C14: wecom 3 stages');
  assertEqual(sort5.stages[0].length, 2, 'C15: stage 1 = 2 parallel roots');
  assertEqual(sort5.stages[1].length, 1, 'C16: stage 2 = deepseek');

  // C17: BOOST_GMV pattern (4 stages or 3 with P3+P4 parallel)
  var gmv = [
    { seq: 1, agent: 'codex', command: 'analyze_gmv_data', priority: 1, reason: 'a', dependsOn: [] },
    { seq: 2, agent: 'deepseek', command: 'gmv_optimization_strategy', priority: 2, reason: 'b', dependsOn: ['analyze_gmv_data'] },
    { seq: 3, agent: 'workbuddy', command: 'generate_plan', priority: 3, reason: 'c', dependsOn: ['gmv_optimization_strategy'] },
    { seq: 4, agent: 'doubao', command: 'gmv_content_marketing', priority: 4, reason: 'd', dependsOn: ['gmv_optimization_strategy'] },
  ];
  var dag6 = dagScheduler.buildDAG(gmv);
  var sort6 = dagScheduler.topologicalSort(dag6);
  assert(sort6.totalStages >= 3, 'C17: gmv at least 3 stages');
  // P3+P4 should be parallel if both depend on P2
  var parallelStage = sort6.stages[2];
  assertEqual(parallelStage.length, 2, 'C18: stage 3 has 2 parallel nodes');

  // C19: all independent (4 parallel)
  var allInd = [
    { seq: 1, agent: 'codex', command: 'a', priority: 1, reason: 'a', dependsOn: [] },
    { seq: 2, agent: 'deepseek', command: 'b', priority: 2, reason: 'b', dependsOn: [] },
    { seq: 3, agent: 'workbuddy', command: 'c', priority: 3, reason: 'c', dependsOn: [] },
    { seq: 4, agent: 'doubao', command: 'd', priority: 4, reason: 'd', dependsOn: [] },
  ];
  var dag7 = dagScheduler.buildDAG(allInd);
  var sort7 = dagScheduler.topologicalSort(dag7);
  assertEqual(sort7.totalStages, 1, 'C19: all independent = 1 stage');
  assertEqual(sort7.stages[0].length, 4, 'C20: 4 parallel nodes');

  // C21: diamond pattern A->[B,C]->D
  var diamond = [
    { seq: 1, agent: 'codex', command: 'a', priority: 1, reason: 'a', dependsOn: [] },
    { seq: 2, agent: 'deepseek', command: 'b', priority: 2, reason: 'b', dependsOn: ['a'] },
    { seq: 3, agent: 'workbuddy', command: 'c', priority: 2, reason: 'c', dependsOn: ['a'] },
    { seq: 4, agent: 'doubao', command: 'd', priority: 3, reason: 'd', dependsOn: ['b', 'c'] },
  ];
  var dag8 = dagScheduler.buildDAG(diamond);
  var sort8 = dagScheduler.topologicalSort(dag8);
  assertEqual(sort8.totalStages, 3, 'C21: diamond 3 stages');
  assertEqual(sort8.stages[1].length, 2, 'C22: stage 2 = 2 parallel (B,C)');
  assertEqual(sort8.stages[2].length, 1, 'C23: stage 3 = D');
})();

// ==================== GROUP D: schedule() full pipeline ====================
console.log('\n=== GROUP D: schedule() — 完整调度管道 ===');

(function testGroupD() {
  // D1: empty
  var r1 = dagScheduler.schedule([]);
  assertEqual(r1.success, false, 'D1: empty queue fails');
  assertEqual(r1.error, '队列为空', 'D2: error message');

  // D2: null
  var r1b = dagScheduler.schedule(null);
  assertEqual(r1b.success, false, 'D2b: null fails');

  // D3-5: BOOST_GMV
  var gmv = [
    { seq: 1, agent: 'codex', command: 'analyze_gmv_data', priority: 1, reason: 'a', dependsOn: [] },
    { seq: 2, agent: 'deepseek', command: 'gmv_optimization_strategy', priority: 2, reason: 'b', dependsOn: ['analyze_gmv_data'] },
    { seq: 3, agent: 'workbuddy', command: 'generate_plan', priority: 3, reason: 'c', dependsOn: ['gmv_optimization_strategy'] },
    { seq: 4, agent: 'doubao', command: 'gmv_content_marketing', priority: 4, reason: 'd', dependsOn: ['gmv_optimization_strategy'] },
  ];
  var r2 = dagScheduler.schedule(gmv);
  assertEqual(r2.success, true, 'D3: schedule success');
  assertEqual(r2.totalNodes, 4, 'D4: 4 nodes');
  assert(r2.totalStages >= 3, 'D5: >=3 stages');

  // D6-7: dag properties
  assert(r2.dag !== null, 'D6: dag not null');
  assertEqual(Object.keys(r2.dag.nodeMap).length, 4, 'D7: 4 entries in nodeMap');

  // D8-10: getStages
  var st = dagScheduler.getStages(r2);
  assertEqual(st.totalStages, r2.totalStages, 'D8: getStages totalStages');
  assertEqual(st.stages.length, r2.totalStages, 'D9: getStages length');
  assert(st.stages[0].length > 0, 'D10: first stage has nodes');

  // D11-12: stage order preserved
  assertEqual(r2.stages[0][0].agent, 'codex', 'D11: stage 1 = codex (P1)');
  assertEqual(r2.stages[1][0].agent, 'deepseek', 'D12: stage 2 = deepseek (P2)');

  // D13-15: REDUCE_REFUND
  var refund = [
    { seq: 1, agent: 'codex', command: 'analyze_refund_patterns', priority: 1, reason: 'a', dependsOn: [] },
    { seq: 2, agent: 'deepseek', command: 'refund_reduction_strategy', priority: 2, reason: 'b', dependsOn: ['analyze_refund_patterns'] },
    { seq: 3, agent: 'workbuddy', command: 'implement_refund_controls', priority: 3, reason: 'c', dependsOn: ['refund_reduction_strategy'] },
    { seq: 4, agent: 'doubao', command: 'customer_experience_content', priority: 4, reason: 'd', dependsOn: ['refund_reduction_strategy'] },
  ];
  var r3 = dagScheduler.schedule(refund);
  assertEqual(r3.totalNodes, 4, 'D13: refund 4 nodes');
  assert(r3.totalStages >= 3, 'D14: refund >=3 stages');
  assertEqual(r3.stages[2].length, 2, 'D15: stage 3 = 2 parallel (P3+P4)');
})();

// ==================== GROUP E: propagateBlocked ====================
console.log('\n=== GROUP E: propagateBlocked — 阻塞传播 ===');

(function testGroupE() {
  // E1: empty blocked list
  var dag1 = dagScheduler.buildDAG([{ seq: 1, agent: 'codex', command: 'a', priority: 1, reason: 'a', dependsOn: [] }]);
  var b1 = dagScheduler.propagateBlocked(dag1, []);
  assertEqual(b1.length, 0, 'E1: empty blocked = 0');

  // E2: null blocked list
  var b2 = dagScheduler.propagateBlocked(dag1, null);
  assertEqual(b2.length, 0, 'E2: null blocked = 0');

  // E3-5: chain blocked at root → all blocked
  var chain = [
    { seq: 1, agent: 'codex', command: 'a', priority: 1, reason: 'a', dependsOn: [] },
    { seq: 2, agent: 'deepseek', command: 'b', priority: 2, reason: 'b', dependsOn: ['a'] },
    { seq: 3, agent: 'workbuddy', command: 'c', priority: 3, reason: 'c', dependsOn: ['b'] },
  ];
  var dag2 = dagScheduler.buildDAG(chain);
  var b3 = dagScheduler.propagateBlocked(dag2, ['a']);
  assertEqual(b3.length, 3, 'E3: chain root blocked → 3 blocked');
  assert(dag2.nodeMap['b'].blocked, 'E4: b is propagated-blocked');
  assert(dag2.nodeMap['c'].blocked, 'E5: c is propagated-blocked');

  // E6-7: chain blocked middle → middle+leaf blocked
  var dag3 = dagScheduler.buildDAG(chain);
  var b4 = dagScheduler.propagateBlocked(dag3, ['b']);
  assertEqual(b4.length, 2, 'E6: middle blocked → 2 blocked (b+c)');
  assert(dag3.nodeMap['c'].blocked, 'E7: c propagated');
  assert(!dag3.nodeMap['a'].blocked, 'E8: root NOT blocked');

  // E9-11: blocked leaf → only leaf
  var dag4 = dagScheduler.buildDAG(chain);
  var b5 = dagScheduler.propagateBlocked(dag4, ['c']);
  assertEqual(b5.length, 1, 'E9: leaf blocked → 1 blocked');
  assert(dag4.nodeMap['c'].blocked, 'E10: c blocked');
  assert(!dag4.nodeMap['a'].blocked, 'E11: root not affected');

  // E12-14: fanout blocked root → all blocked
  var fanout = [
    { seq: 1, agent: 'codex', command: 'root', priority: 1, reason: 'r', dependsOn: [] },
    { seq: 2, agent: 'deepseek', command: 'b1', priority: 2, reason: 'b1', dependsOn: ['root'] },
    { seq: 3, agent: 'workbuddy', command: 'b2', priority: 2, reason: 'b2', dependsOn: ['root'] },
  ];
  var dag5 = dagScheduler.buildDAG(fanout);
  var b6 = dagScheduler.propagateBlocked(dag5, ['root']);
  assertEqual(b6.length, 3, 'E12: fanout root blocked → 3 blocked');
  assert(dag5.nodeMap['b1'].blocked, 'E13: b1 blocked');
  assert(dag5.nodeMap['b2'].blocked, 'E14: b2 blocked');

  // E15: blockReason set
  var dag6 = dagScheduler.buildDAG(fanout);
  dagScheduler.propagateBlocked(dag6, ['root']);
  assertEqual(dag6.nodeMap['b1'].blockReason, 'Propagated: upstream node blocked', 'E15: propagated blockReason');
})();

// ==================== GROUP F: applyRBAC ====================
console.log('\n=== GROUP F: applyRBAC — RBAC 集成 ===');

(function testGroupF() {
  // F1: empty rbacResults
  var dag1 = dagScheduler.buildDAG([{ seq: 1, agent: 'codex', command: 'a', priority: 1, reason: 'a', dependsOn: [] }]);
  var r1 = dagScheduler.applyRBAC(dag1, []);
  assertEqual(r1.totalBlocked, 0, 'F1: empty rbac → 0 blocked');
  assertEqual(r1.originalDenied, 0, 'F2: originalDenied 0');

  // F3: null rbacResults
  var r1b = dagScheduler.applyRBAC(dag1, null);
  assertEqual(r1b.totalBlocked, 0, 'F3: null rbac → 0 blocked');

  // F4-6: one denied node → blocked + propagation
  var chain = [
    { seq: 1, agent: 'codex', command: 'a', priority: 1, reason: 'a', dependsOn: [] },
    { seq: 2, agent: 'deepseek', command: 'b', priority: 2, reason: 'b', dependsOn: ['a'] },
    { seq: 3, agent: 'workbuddy', command: 'c', priority: 3, reason: 'c', dependsOn: ['b'] },
  ];
  var dag2 = dagScheduler.buildDAG(chain);
  var rbacResults = [
    { agent: 'codex', command: 'a', allowed: true },
    { agent: 'deepseek', command: 'b', allowed: false, denyReason: 'explicit-deny', reason: 'DeepSeek blocked' },
    { agent: 'workbuddy', command: 'c', allowed: true },
  ];
  var r2 = dagScheduler.applyRBAC(dag2, rbacResults);
  assertEqual(r2.originalDenied, 1, 'F4: 1 original denied');
  assert(r2.totalBlocked >= 2, 'F5: total blocked >= 2 (b + propagated c)');
  assertEqual(r2.blockedNodes.length, r2.totalBlocked, 'F6: blockedNodes count matches');

  // F7-8: all allowed → 0 blocked
  var dag3 = dagScheduler.buildDAG(chain);
  var rbacAllAllowed = [
    { agent: 'codex', command: 'a', allowed: true },
    { agent: 'deepseek', command: 'b', allowed: true },
    { agent: 'workbuddy', command: 'c', allowed: true },
  ];
  var r3 = dagScheduler.applyRBAC(dag3, rbacAllAllowed);
  assertEqual(r3.totalBlocked, 0, 'F7: all allowed → 0 blocked');
  assertEqual(r3.originalDenied, 0, 'F8: originalDenied 0');

  // F9-10: blocked node NOT in stages after applyRBAC + topo
  var dag4 = dagScheduler.buildDAG(chain);
  var r4 = dagScheduler.applyRBAC(dag4, rbacResults);
  var sortAfter = dagScheduler.topologicalSort(r4.dag);
  var allStageNodes = [];
  for (var si = 0; si < sortAfter.stages.length; si++) {
    for (var sj = 0; sj < sortAfter.stages[si].length; sj++) {
      allStageNodes.push(sortAfter.stages[si][sj].id);
    }
  }
  assert(allStageNodes.indexOf('a') !== -1, 'F9: allowed node in stages');
  assert(allStageNodes.indexOf('b') === -1, 'F10: denied node NOT in stages');
  assert(allStageNodes.indexOf('c') === -1, 'F11: propagated node NOT in stages');
})();

// ==================== GROUP G: Cycle Detection ====================
console.log('\n=== GROUP G: detectCycles — 循环检测 ===');

(function testGroupG() {
  // G1: no cycle
  var chain = [
    { seq: 1, agent: 'codex', command: 'a', priority: 1, reason: 'a', dependsOn: [] },
    { seq: 2, agent: 'deepseek', command: 'b', priority: 2, reason: 'b', dependsOn: ['a'] },
  ];
  var dag1 = dagScheduler.buildDAG(chain);
  var c1 = dagScheduler.detectCycles(dag1);
  assertEqual(c1.hasCycle, false, 'G1: no cycle');
  assertEqual(c1.cycleNodes.length, 0, 'G2: 0 cycle nodes');

  // G3: simple 2-node cycle
  var cycle2 = [
    { seq: 1, agent: 'codex', command: 'a', priority: 1, reason: 'a', dependsOn: ['b'] },
    { seq: 2, agent: 'deepseek', command: 'b', priority: 2, reason: 'b', dependsOn: ['a'] },
  ];
  var dag2 = dagScheduler.buildDAG(cycle2);
  var c2 = dagScheduler.detectCycles(dag2);
  assertEqual(c2.hasCycle, true, 'G3: 2-node cycle detected');
  assertEqual(c2.cycleNodes.length, 2, 'G4: 2 cycle nodes');

  // G5: 3-node cycle
  var cycle3 = [
    { seq: 1, agent: 'codex', command: 'a', priority: 1, reason: 'a', dependsOn: ['c'] },
    { seq: 2, agent: 'deepseek', command: 'b', priority: 2, reason: 'b', dependsOn: ['a'] },
    { seq: 3, agent: 'workbuddy', command: 'c', priority: 3, reason: 'c', dependsOn: ['b'] },
  ];
  var dag3 = dagScheduler.buildDAG(cycle3);
  var c3 = dagScheduler.detectCycles(dag3);
  assertEqual(c3.hasCycle, true, 'G5: 3-node cycle detected');
  assertEqual(c3.cycleNodes.length, 3, 'G6: 3 cycle nodes');

  // G7: self-dependency
  var self = [
    { seq: 1, agent: 'codex', command: 'a', priority: 1, reason: 'a', dependsOn: ['a'] },
  ];
  var dag4 = dagScheduler.buildDAG(self);
  var c4 = dagScheduler.detectCycles(dag4);
  assertEqual(c4.hasCycle, true, 'G7: self-dependency cycle');

  // G8: diamond no cycle
  var diamond = [
    { seq: 1, agent: 'codex', command: 'a', priority: 1, reason: 'a', dependsOn: [] },
    { seq: 2, agent: 'deepseek', command: 'b', priority: 2, reason: 'b', dependsOn: ['a'] },
    { seq: 3, agent: 'workbuddy', command: 'c', priority: 2, reason: 'c', dependsOn: ['a'] },
    { seq: 4, agent: 'doubao', command: 'd', priority: 3, reason: 'd', dependsOn: ['b', 'c'] },
  ];
  var dag5 = dagScheduler.buildDAG(diamond);
  var c5 = dagScheduler.detectCycles(dag5);
  assertEqual(c5.hasCycle, false, 'G8: diamond no cycle');
})();

// ==================== GROUP H: Edge Cases ====================
console.log('\n=== GROUP H: Edge Cases — 边界条件 ===');

(function testGroupH() {
  // H1: single node with dependency on non-existent node
  var missing = [
    { seq: 1, agent: 'codex', command: 'a', priority: 1, reason: 'a', dependsOn: ['nonexistent'] },
  ];
  var dag1 = dagScheduler.buildDAG(missing);
  assertEqual(dag1.nodes.length, 1, 'H1: node with missing dep still created');
  assertEqual(dag1.edges.length, 0, 'H2: no edge for missing dep');

  // H3: mixed (some deps valid, some not)
  var mixed = [
    { seq: 1, agent: 'codex', command: 'a', priority: 1, reason: 'a', dependsOn: [] },
    { seq: 2, agent: 'deepseek', command: 'b', priority: 2, reason: 'b', dependsOn: ['a', 'nonexistent'] },
  ];
  var dag2 = dagScheduler.buildDAG(mixed);
  assertEqual(dag2.edges.length, 1, 'H3: only valid dep creates edge');
  assertEqual(dag2.edges[0].from, 'a', 'H4: valid edge from a');

  // H5: all same priority
  var samePrio = [
    { seq: 1, agent: 'codex', command: 'a', priority: 1, reason: 'a', dependsOn: [] },
    { seq: 2, agent: 'deepseek', command: 'b', priority: 1, reason: 'b', dependsOn: ['a'] },
  ];
  var dag3 = dagScheduler.buildDAG(samePrio);
  var sort3 = dagScheduler.topologicalSort(dag3);
  assertEqual(sort3.totalStages, 2, 'H5: same priority still 2 stages');

  // H6: 10 node linear chain
  var bigChain = [];
  for (var bi = 0; bi < 10; bi++) {
    var prev = bi > 0 ? ['cmd_' + (bi - 1)] : [];
    bigChain.push({ seq: bi + 1, agent: 'codex', command: 'cmd_' + bi, priority: bi + 1, reason: 'r', dependsOn: prev });
  }
  var dag4 = dagScheduler.buildDAG(bigChain);
  var sort4 = dagScheduler.topologicalSort(dag4);
  assertEqual(sort4.totalStages, 10, 'H6: 10-node chain = 10 stages');

  // H7: 10 independent nodes → 1 stage
  var bigParallel = [];
  for (var bj = 0; bj < 10; bj++) {
    bigParallel.push({ seq: bj + 1, agent: 'codex', command: 'p_' + bj, priority: bj + 1, reason: 'r', dependsOn: [] });
  }
  var dag5 = dagScheduler.buildDAG(bigParallel);
  var sort5 = dagScheduler.topologicalSort(dag5);
  assertEqual(sort5.totalStages, 1, 'H7: 10 independent → 1 stage');
  assertEqual(sort5.stages[0].length, 10, 'H8: 10 nodes in 1 stage');
})();

// ==================== GROUP I: Output Format ====================
console.log('\n=== GROUP I: DAG Executor Plan — 输出格式化 ===');

(function testGroupI() {
  // I1-3: formatDAGPlan basic
  var gmv = [
    { seq: 1, agent: 'codex', command: 'analyze_gmv_data', priority: 1, reason: 'a', dependsOn: [] },
    { seq: 2, agent: 'deepseek', command: 'gmv_optimization_strategy', priority: 2, reason: 'b', dependsOn: ['analyze_gmv_data'] },
    { seq: 3, agent: 'workbuddy', command: 'generate_plan', priority: 3, reason: 'c', dependsOn: ['gmv_optimization_strategy'] },
    { seq: 4, agent: 'doubao', command: 'gmv_content_marketing', priority: 4, reason: 'd', dependsOn: ['gmv_optimization_strategy'] },
  ];
  var sr = dagScheduler.schedule(gmv);
  var plan1 = dagPlan.formatDAGPlan(sr);
  assert(typeof plan1 === 'string', 'I1: formatDAGPlan returns string');
  assert(plan1.length > 0, 'I2: non-empty output');
  assertContains(plan1, 'DAG Execution Plan', 'I3: header present');
  assertContains(plan1, 'Stage', 'I4: stage labels');
  assertContains(plan1, 'parallel', 'I5: parallel indicators');
  assertContains(plan1, 'Total Stages', 'I6: total stages');
  assertContains(plan1, 'Total Nodes', 'I7: total nodes');
  assertContains(plan1, 'Max Parallelism', 'I8: max parallelism');

  // I9: with blocked info
  var blockedInfo = { blockedNodes: ['cmd_x'], totalBlocked: 1, originalDenied: 1 };
  var plan2 = dagPlan.formatDAGPlan(sr, blockedInfo);
  assertContains(plan2, 'Blocked Nodes', 'I9: blocked section');

  // I10: without blocked info
  var plan3 = dagPlan.formatDAGPlan(sr);
  assert(plan3.indexOf('Blocked Nodes') === -1, 'I10: no blocked section when no blocked');

  // I11-13: getExecutionLevels
  var levels = dagPlan.getExecutionLevels(sr.stages);
  assert(levels.length > 0, 'I11: getExecutionLevels returns levels');
  assertEqual(levels[0].type, 'sequential', 'I12: stage 1 sequential (single node)');
  assertEqual(levels[levels.length - 1].type, 'parallel', 'I13: last stage parallel (P3+P4)');

  // I14-15: formatNode
  var nodeStr = dagPlan.formatNode(gmv[0]);
  assert(typeof nodeStr === 'string', 'I14: formatNode returns string');
  assertContains(nodeStr, 'codex', 'I15: node includes agent');

  // I16-18: formatDAGPlanDetailed
  var detailed = dagPlan.formatDAGPlanDetailed(sr);
  assert(typeof detailed === 'string', 'I16: detailed returns string');
  assertContains(detailed, 'Dependency Graph', 'I17: detailed has dep graph');
  assertContains(detailed, 'Command:', 'I18: detailed has command info');

  // I19-20: formatBlockedReport
  var blockedReport = dagPlan.formatBlockedReport(['node_a', 'node_b']);
  assertContains(blockedReport, 'Blocked Nodes Report', 'I19: blocked report header');
  assertContains(blockedReport, 'node_a', 'I20: blocked report lists nodes');

  // I21: formatBlockedReport empty
  var emptyReport = dagPlan.formatBlockedReport([]);
  assertEqual(emptyReport, '', 'I21: empty blocked report = empty string');
})();

// ==================== GROUP J: Integration ====================
console.log('\n=== GROUP J: Commander Runtime Integration ===');

(function testGroupJ() {
  // J1: schedule result is compatible with formatOutput data
  var gmv = [
    { seq: 1, agent: 'codex', command: 'analyze_gmv_data', priority: 1, reason: 'a', dependsOn: [] },
    { seq: 2, agent: 'deepseek', command: 'gmv_optimization_strategy', priority: 2, reason: 'b', dependsOn: ['analyze_gmv_data'] },
    { seq: 3, agent: 'workbuddy', command: 'generate_plan', priority: 3, reason: 'c', dependsOn: ['gmv_optimization_strategy'] },
    { seq: 4, agent: 'doubao', command: 'gmv_content_marketing', priority: 4, reason: 'd', dependsOn: ['gmv_optimization_strategy'] },
  ];
  var sr = dagScheduler.schedule(gmv);
  assertEqual(sr.totalNodes, 4, 'J1: totalNodes = queue length');
  assert(sr.stages[0].length === 1, 'J2: first stage = 1 node');

  // J3-4: blocked nodes excluded from stages
  var rbacMismatch = [
    { agent: 'codex', command: 'analyze_gmv_data', allowed: false, denyReason: 'test', reason: 'blocked' },
    { agent: 'deepseek', command: 'gmv_optimization_strategy', allowed: true },
  ];
  var dagForRBAC = dagScheduler.buildDAG(gmv);
  var rbacApplied = dagScheduler.applyRBAC(dagForRBAC, rbacMismatch);
  var sortBlocked = dagScheduler.topologicalSort(rbacApplied.dag);

  // Count nodes in stages
  var stageNodeCount = 0;
  for (var si = 0; si < sortBlocked.stages.length; si++) {
    stageNodeCount += sortBlocked.stages[si].length;
  }
  assert(stageNodeCount < 4, 'J3: blocked nodes excluded from stages');
  assert(rbacApplied.totalBlocked >= 1, 'J4: at least 1 blocked');

  // J5: no actual execution in plan
  var planStr = dagPlan.formatDAGPlan(sr);
  assert(planStr.indexOf('execute') === -1, 'J5: no "execute" in plan (plan-only)');
  assert(planStr.indexOf('dispatch') === -1, 'J6: no "dispatch" in plan');
  assert(planStr.indexOf('exec') === -1, 'J7: no "exec" in plan');

  // J8: edge count matches dependencies
  // analyze_gmv_data → gmv_optimization_strategy
  // gmv_optimization_strategy → generate_plan, gmv_content_marketing
  assertEqual(sr.dag.edges.length, 3, 'J8: 3 edges for GMV template');
})();

// ==================== Summary ====================
console.log('\n========================================');
console.log('DAG Scheduler Test Results');
console.log('========================================');
console.log('Total:  ' + total);
console.log('Passed: ' + passed);
console.log('Failed: ' + failed);
console.log('========================================');

if (failed > 0) {
  process.exit(1);
}
