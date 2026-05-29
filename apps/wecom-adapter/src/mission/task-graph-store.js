'use strict';

/**
 * task-graph-store.js - P10.5 Task Graph 持久化层
 *
 * 职责:
 *   - 内存中维护 task graph 数据
 *   - 每次 graph 变更时写入 artifact (graph.json)
 *   - 事件追加写入 artifact (graph-events.json)
 *   - 提供 CRUD 接口供 engine 和 routes 使用
 *
 * Graph 数据结构:
 *   {
 *     graph_id: string,
 *     mission_id: string,
 *     nodes: [{ id, type, skill, capability, agent, dependsOn, status }],
 *     status: 'pending'|'running'|'completed'|'failed'|'blocked',
 *     created_at: ISO8601,
 *     updated_at: ISO8601
 *   }
 */

var artifactStore = require('../artifacts/artifact-store');
var missionStore = require('./mission-store');

// ─── 内存存储 ──────────────────────────────────────────────

/** @type {Object<string, object>} */
var _graphs = {};

/** @type {Object<string, Array>} */
var _events = {};

// ─── 辅助 ──────────────────────────────────────────────────

function now() {
  return new Date().toISOString();
}

/**
 * 将 graph 持久化到 artifact
 * @param {string} missionId
 * @param {object} graph
 */
function _persistGraph(missionId, graph) {
  try {
    artifactStore.saveArtifact({
      mission_id: missionId,
      filename: 'graph.json',
      agent: 'task-graph-engine',
      content: JSON.stringify({
        graph_id: graph.graph_id,
        mission_id: graph.mission_id,
        status: graph.status,
        nodes: graph.nodes,
        created_at: graph.created_at,
        updated_at: graph.updated_at
      }, null, 2)
    });
  } catch (e) {
    // artifact 写入失败不阻断主流程
    console.error('[task-graph-store] Failed to persist graph.json:', e.message);
  }
}

/**
 * 将 events 持久化到 artifact
 * @param {string} missionId
 * @param {string} graphId
 * @param {Array} events
 */
function _persistEvents(missionId, graphId, events) {
  try {
    artifactStore.saveArtifact({
      mission_id: missionId,
      filename: 'graph-events.json',
      agent: 'task-graph-engine',
      content: JSON.stringify({
        graph_id: graphId,
        mission_id: missionId,
        events: events,
        updated_at: now()
      }, null, 2)
    });
  } catch (e) {
    console.error('[task-graph-store] Failed to persist graph-events.json:', e.message);
  }
}

// ─── CRUD ──────────────────────────────────────────────────

/**
 * 创建 task graph
 * @param {object} graph
 * @param {string} graph.graph_id
 * @param {string} graph.mission_id
 * @param {Array}  graph.nodes
 * @returns {object} 创建的 graph
 */
function createGraph(graph) {
  if (!graph || !graph.graph_id) {
    throw new Error('graph 缺少必填字段: graph_id');
  }
  if (!graph.mission_id) {
    throw new Error('graph 缺少必填字段: mission_id');
  }

  if (_graphs[graph.graph_id]) {
    throw new Error('Graph 已存在: ' + graph.graph_id);
  }

  var entry = {
    graph_id: graph.graph_id,
    mission_id: graph.mission_id,
    nodes: graph.nodes || [],
    status: graph.status || 'pending',
    created_at: graph.created_at || now(),
    updated_at: graph.updated_at || now()
  };

  _graphs[graph.graph_id] = entry;
  _events[graph.graph_id] = [];

  // 写入 artifact
  _persistGraph(graph.mission_id, entry);

  // 写入 agent_events
  try {
    missionStore.createAgentEvent({
      mission_task_id: graph.mission_id,
      event_type: 'GRAPH_CREATED',
      stage: 'task_graph',
      payload: { graph_id: graph.graph_id, node_count: entry.nodes.length }
    });
  } catch (e) { /* ignore */ }

  return JSON.parse(JSON.stringify(entry));
}

/**
 * 获取 graph
 * @param {string} graphId
 * @returns {object|null}
 */
function getGraph(graphId) {
  var g = _graphs[graphId];
  if (!g) return null;
  return JSON.parse(JSON.stringify(g));
}

/**
 * 列出所有 graphs
 * @returns {Array<object>}
 */
function listGraphs() {
  var ids = Object.keys(_graphs);
  var result = [];
  for (var i = 0; i < ids.length; i++) {
    result.push(JSON.parse(JSON.stringify(_graphs[ids[i]])));
  }
  return result;
}

/**
 * 更新 graph
 * @param {string} graphId
 * @param {object} updates
 * @returns {object|null}
 */
function updateGraph(graphId, updates) {
  var g = _graphs[graphId];
  if (!g) return null;

  var keys = Object.keys(updates || {});
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    if (k === 'graph_id' || k === 'mission_id' || k === 'created_at') continue; // 不可变字段
    g[k] = updates[k];
  }
  g.updated_at = now();

  // 写入 artifact
  _persistGraph(g.mission_id, g);

  return JSON.parse(JSON.stringify(g));
}

/**
 * 删除 graph
 * @param {string} graphId
 * @returns {boolean}
 */
function deleteGraph(graphId) {
  if (!_graphs[graphId]) return false;
  delete _graphs[graphId];
  delete _events[graphId];
  return true;
}

// ─── Events ────────────────────────────────────────────────

/**
 * 追加 graph event
 * @param {string} graphId
 * @param {object} event - { type, node_id?, detail? }
 * @returns {object} 创建的 event
 */
function addGraphEvent(graphId, event) {
  if (!_events[graphId]) {
    _events[graphId] = [];
  }

  var entry = {
    id: _events[graphId].length + 1,
    type: event.type || 'UNKNOWN',
    node_id: event.node_id || null,
    detail: event.detail || null,
    timestamp: now()
  };

  _events[graphId].push(entry);

  // 写入 artifact
  var g = _graphs[graphId];
  if (g) {
    _persistEvents(g.mission_id, graphId, _events[graphId]);
  }

  return entry;
}

/**
 * 获取 graph 的所有 events
 * @param {string} graphId
 * @returns {Array}
 */
function getGraphEvents(graphId) {
  return (_events[graphId] || []).slice();
}

// ─── 导出 ──────────────────────────────────────────────────

module.exports = {
  createGraph: createGraph,
  getGraph: getGraph,
  listGraphs: listGraphs,
  updateGraph: updateGraph,
  deleteGraph: deleteGraph,
  addGraphEvent: addGraphEvent,
  getGraphEvents: getGraphEvents,

  // 测试用
  _graphs: _graphs,
  _events: _events,
  _reset: function() {
    var gKeys = Object.keys(_graphs);
    for (var i = 0; i < gKeys.length; i++) {
      delete _graphs[gKeys[i]];
    }
    var eKeys = Object.keys(_events);
    for (var j = 0; j < eKeys.length; j++) {
      delete _events[eKeys[j]];
    }
  }
};
