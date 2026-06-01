// P50.2 Asset Harvester Task Manager — task CRUD and lifecycle
var fs = require('fs');
var path = require('path');

var TASKS_FILE = path.join(__dirname, '..', '..', 'storage', 'openclaw-assets', 'harvester-tasks.json');
var STATUS_LIFECYCLE = ['pending', 'approved', 'running', 'done', 'failed', 'cancelled'];

function loadTasks() {
  try { return JSON.parse(fs.readFileSync(TASKS_FILE, 'utf8')); } catch (e) { return []; }
}

function saveTasks(tasks) {
  fs.writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2), 'utf8');
}

function guid() { return 'hvt-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 6); }

function createTask(config) {
  var tasks = loadTasks();
  var task = {
    task_id: guid(),
    title: config.title || 'Untitled Task',
    type: config.type || 'manual',
    platform: config.platform || 'douyin',
    target_url: config.targetUrl || '',
    rules: {
      collect_text: config.collectText !== false,
      collect_image: config.collectImage !== false,
      collect_audio: config.collectAudio || false,
      collect_video: config.collectVideo || false,
      max_items: config.maxItems || 50,
      save_screenshot: config.saveScreenshot || false
    },
    status: 'pending',
    approval_id: null,
    progress: { collected: 0, total: 0, failed: 0 },
    artifacts: [],
    error: null,
    created_by: config.userId || 'system',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    started_at: null,
    completed_at: null
  };
  tasks.push(task);
  saveTasks(tasks);
  return task;
}

function getTasks(filters) {
  var tasks = loadTasks();
  if (filters) {
    if (filters.status) tasks = tasks.filter(function (t) { return t.status === filters.status; });
    if (filters.platform) tasks = tasks.filter(function (t) { return t.platform === filters.platform; });
    if (filters.userId) tasks = tasks.filter(function (t) { return t.created_by === filters.userId; });
  }
  tasks.sort(function (a, b) { return new Date(b.created_at) - new Date(a.created_at); });
  return tasks;
}

function getTask(taskId) {
  var tasks = loadTasks();
  return tasks.find(function (t) { return t.task_id === taskId; }) || null;
}

function updateTaskStatus(taskId, status, metadata) {
  var tasks = loadTasks();
  var t = tasks.find(function (t) { return t.task_id === taskId; });
  if (!t) return null;
  if (STATUS_LIFECYCLE.indexOf(status) === -1) return null;
  t.status = status;
  t.updated_at = new Date().toISOString();
  if (status === 'running' && !t.started_at) t.started_at = new Date().toISOString();
  if (status === 'done' || status === 'failed') t.completed_at = new Date().toISOString();
  if (metadata) Object.keys(metadata).forEach(function (k) { t[k] = metadata[k]; });
  saveTasks(tasks);
  return t;
}

function deleteTask(taskId) {
  var tasks = loadTasks();
  var idx = tasks.findIndex(function (t) { return t.task_id === taskId; });
  if (idx === -1) return false;
  tasks.splice(idx, 1);
  saveTasks(tasks);
  return true;
}

// Initialize file if not exists
if (!fs.existsSync(TASKS_FILE)) saveTasks([]);

module.exports = { createTask: createTask, getTasks: getTasks, getTask: getTask, updateTaskStatus: updateTaskStatus, deleteTask: deleteTask, STATUS_LIFECYCLE: STATUS_LIFECYCLE };
