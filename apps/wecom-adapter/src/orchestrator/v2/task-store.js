'use strict';

/**
 * task-store.js - 任务持久化层 (v2 SQLite)
 *
 * 主存储: SQLite (data/tasks.db)
 * 审计备份: JSONL (logs/tasks/YYYY-MM-DD.jsonl)
 *
 * P6.6.1: 改为薄层 re-export，实际逻辑在 src/storage/task-repository.js
 */

var repo = require('../../storage/task-repository');

module.exports = {
  createTask: repo.createTask,
  updateTask: repo.updateTask,
  getTask: repo.getTask,
  listTasks: repo.listTasks,
  getBlockers: repo.getBlockers,
  getStats: repo.getStats,
};
