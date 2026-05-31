/**
 * task-queue.js
 * AI Orchestrator Runtime 任务队列 v0.4
 *
 * JSONL 文件存储，每行一个任务。
 * 存储路径：apps/wecom-adapter/storage/orchestrator/tasks.jsonl
 *
 * 状态流转（合法）：
 *   queued → planned → dispatched → artifact_received
 *   → review_pending → approved → closed
 *   → review_pending → rejected → rollback_required → closed
 */

const path = require('path');
const fs = require('fs');

const DEFAULT_STORAGE_DIR = path.resolve(__dirname, '..', '..', 'storage', 'orchestrator');
const TASKS_FILE = 'tasks.jsonl';

let _storageDir = DEFAULT_STORAGE_DIR;

function setStorageDir(dir) {
  _storageDir = dir;
}

function getStorageDir() {
  return _storageDir;
}

function getTasksPath() {
  return path.join(_storageDir, TASKS_FILE);
}

function ensureDir() {
  if (!fs.existsSync(_storageDir)) {
    fs.mkdirSync(_storageDir, { recursive: true });
  }
}

function generateTaskId() {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).substring(2, 6);
  return `task-${ts}-${rand}`;
}

/**
 * 合法状态列表
 */
const VALID_STATUSES = [
  'queued',
  'planned',
  'dispatched',
  'artifact_received',
  'review_pending',
  'approved',
  'rejected',
  'cancelled',
  'rollback_required',
  'closed',
];

/**
 * 创建任务
 * @param {object} input
 * @param {string} input.userRequest - 用户原始指令
 * @param {string} input.assignee - 推荐 AI 角色
 * @param {string} [input.branch] - 分支名
 * @param {string} [input.patchFile] - patch 文件名
 * @param {string[]} [input.forbidden] - 禁止范围
 * @param {string} [input.auditId] - 关联审计 ID
 * @returns {object} task
 */
function createTask(input = {}) {
  ensureDir();

  const task = {
    taskId: generateTaskId(),
    status: 'queued',
    assignee: input.assignee || 'workbuddy',
    userRequest: input.userRequest || '',
    branch: input.branch || '',
    patchFile: input.patchFile || '',
    forbidden: input.forbidden || [],
    acceptance: input.acceptance || '',
    auditId: input.auditId || '',
    events: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  appendTask(task);
  return task;
}

/**
 * 将任务追加到 JSONL 文件
 */
function appendTask(task) {
  const filePath = getTasksPath();
  const line = JSON.stringify(task) + '\n';
  fs.appendFileSync(filePath, line, 'utf-8');
}

/**
 * 获取单个任务
 */
function getTask(taskId) {
  const all = readAllTasks();
  return all.find((t) => t.taskId === taskId) || null;
}

/**
 * 列出最新 N 条任务
 */
function listTasks(n = 20) {
  const all = readAllTasks();
  return all.slice(-n).reverse(); // 最新在前
}

/**
 * 列出所有任务
 */
function listAllTasks() {
  return readAllTasks();
}

/**
 * 更新任务状态（带合法性校验）
 */
function updateStatus(taskId, newStatus) {
  if (!VALID_STATUSES.includes(newStatus)) {
    throw new Error(`Invalid status: ${newStatus}`);
  }

  const all = readAllTasks();
  const task = all.find((t) => t.taskId === taskId);
  if (!task) {
    throw new Error(`Task not found: ${taskId}`);
  }

  task.status = newStatus;
  task.updatedAt = new Date().toISOString();

  // 追加事件
  appendEvent(task, { type: 'status_change', to: newStatus });

  // 持久化
  rewriteTasksFile(all);
  return task;
}

/**
 * 追加事件到任务
 */
function appendEvent(task, event) {
  if (!task.events) task.events = [];
  task.events.push({
    ...event,
    ts: new Date().toISOString(),
  });
}

/**
 * 通过事件追加并持久化
 */
function appendEventById(taskId, event) {
  const all = readAllTasks();
  const task = all.find((t) => t.taskId === taskId);
  if (!task) {
    throw new Error(`Task not found: ${taskId}`);
  }
  appendEvent(task, event);
  rewriteTasksFile(all);
  return task;
}

/**
 * 更新整个任务对象
 */
function updateTask(taskId, updates) {
  const all = readAllTasks();
  const idx = all.findIndex((t) => t.taskId === taskId);
  if (idx === -1) {
    throw new Error(`Task not found: ${taskId}`);
  }

  // 允许更新状态、assignee、branch 等
  if (updates.status) {
    if (!VALID_STATUSES.includes(updates.status)) {
      throw new Error(`Invalid status: ${updates.status}`);
    }
  }

  Object.assign(all[idx], updates, { updatedAt: new Date().toISOString() });

  // 如果有状态变更，追加事件
  if (updates.status && updates.status !== all[idx].status) {
    // The status was directly set by Object.assign above
  }

  // 重写文件
  const filePath = getTasksPath();
  const lines = all.map((t) => JSON.stringify(t)).join('\n') + '\n';
  fs.writeFileSync(filePath, lines, 'utf-8');
  return all[idx];
}

/**
 * 读取所有任务
 */
function readAllTasks() {
  const filePath = getTasksPath();
  if (!fs.existsSync(filePath)) {
    return [];
  }
  const text = fs.readFileSync(filePath, 'utf-8').trim();
  if (!text) return [];
  return text.split('\n').map((line) => {
    try {
      return JSON.parse(line);
    } catch (e) {
      return null;
    }
  }).filter(Boolean);
}

/**
 * 内部：重写任务文件
 * @param {object[]} [tasks] - 可选，传入则用此数组，不从文件重读
 */
function rewriteTasksFile(tasks) {
  const all = tasks || readAllTasks();
  const filePath = getTasksPath();
  const lines = all.map((t) => JSON.stringify(t)).join('\n') + '\n';
  fs.writeFileSync(filePath, lines, 'utf-8');
}

module.exports = {
  createTask,
  getTask,
  listTasks,
  listAllTasks,
  updateStatus,
  updateTask,
  appendEvent: appendEventById,
  generateTaskId,
  setStorageDir,
  getStorageDir,
  getTasksPath,
  VALID_STATUSES,
};
