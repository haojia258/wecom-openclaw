'use strict';

/**
 * task-graph.js — P11 Task Graph v0.1
 *
 * REVIEW_ONLY=true — no deploy, no production mutation.
 * Stores task graphs as JSON artifacts in storage/task-graphs/.
 */

const fs = require('fs');
const path = require('path');
const STORAGE_DIR = path.resolve(__dirname, '../../storage/task-graphs');

if (!fs.existsSync(STORAGE_DIR)) fs.mkdirSync(STORAGE_DIR, { recursive: true });

const STATUS = ['pending','running','blocked','review','done','failed','rejected'];

class TaskGraph {
  constructor() {
    this.graphs = {};
  }

  createGraph({ title, owner, goal }) {
    const id = 'graph-' + Date.now();
    this.graphs[id] = { id, title, owner, goal, tasks: {}, createdAt: new Date(), updatedAt: new Date() };
    this._saveGraph(id);
    return this.graphs[id];
  }

  addTask(graphId, task) {
    this._assertGraph(graphId);
    if (!task.taskId) task.taskId = 'task-' + Date.now();
    task.status = task.status && STATUS.includes(task.status) ? task.status : 'pending';
    task.dependsOn = task.dependsOn || [];
    task.artifacts = task.artifacts || [];
    task.reviewRequired = !!task.reviewRequired;
    task.createdAt = new Date();
    task.updatedAt = new Date();

    this.graphs[graphId].tasks[task.taskId] = task;
    this.graphs[graphId].updatedAt = new Date();
    this._saveGraph(graphId);
    return task;
  }

  updateTaskStatus(graphId, taskId, status) {
    this._assertGraph(graphId);
    const task = this.graphs[graphId].tasks[taskId];
    if (!task) throw new Error('Task not found');
    if (!STATUS.includes(status)) throw new Error('Invalid status');
    task.status = status;
    task.updatedAt = new Date();
    this.graphs[graphId].updatedAt = new Date();
    this._saveGraph(graphId);
    return task;
  }

  addDependency(graphId, taskId, dependsOnTaskId) {
    this._assertGraph(graphId);
    const task = this.graphs[graphId].tasks[taskId];
    if (!task) throw new Error('Task not found');
    if (!this.graphs[graphId].tasks[dependsOnTaskId]) throw new Error('Dependency task not found');
    task.dependsOn.push(dependsOnTaskId);
    task.updatedAt = new Date();
    this._saveGraph(graphId);
  }

  attachArtifact(graphId, taskId, artifact) {
    this._assertGraph(graphId);
    const task = this.graphs[graphId].tasks[taskId];
    if (!task) throw new Error('Task not found');
    task.artifacts.push(artifact);
    task.updatedAt = new Date();
    this._saveGraph(graphId);
  }

  getGraph(graphId) {
    this._assertGraph(graphId);
    return this.graphs[graphId];
  }

  listGraphs() {
    return Object.values(this.graphs);
  }

  _assertGraph(graphId) {
    if (!this.graphs[graphId]) throw new Error('Graph not found');
  }

  _saveGraph(graphId) {
    const filePath = path.join(STORAGE_DIR, `${graphId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(this.graphs[graphId], null, 2));
  }
}

module.exports = new TaskGraph();
