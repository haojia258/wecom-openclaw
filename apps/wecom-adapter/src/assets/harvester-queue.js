// P50.2 Harvester Queue — task queue with approval flow
var taskManager = require('./harvester-task-manager');
var assetRegistry = require('./asset-registry');
var browserCollector = null;
try { browserCollector = require('./browser-collector'); } catch (e) {}

// REVIEW_ONLY mode — all tasks default to pending, require approval
var REVIEW_ONLY = true;

function enqueue(taskId) {
  var task = taskManager.getTask(taskId);
  if (!task) return { error: 'Task not found' };
  if (!REVIEW_ONLY) {
    // In non-review mode, auto-approve and run
    taskManager.updateTaskStatus(taskId, 'approved');
  }
  return { task: task, requiresApproval: REVIEW_ONLY };
}

function approveAndRun(taskId, approvalId) {
  var task = taskManager.updateTaskStatus(taskId, 'approved', { approval_id: approvalId });
  if (!task) return { error: 'Task not found' };
  return runTask(task);
}

function runTask(task) {
  taskManager.updateTaskStatus(task.task_id, 'running');
  var rules = task.rules;
  var artifacts = [];
  var failed = 0;

  try {
    // Simulate collection based on rules
    var items = simulateCollection(rules, task);
    items.forEach(function (item) {
      try {
        var r = assetRegistry.importAsset(
          Buffer.from(item.content || 'harvested-' + Date.now()),
          item.filename,
          { type: item.type, platform: task.platform, sourceUrl: task.target_url, tags: item.tags, userId: task.created_by }
        );
        if (r.imported) artifacts.push(r.asset.asset_id);
        else failed++;
      } catch (e) { failed++; }
    });
    taskManager.updateTaskStatus(task.task_id, 'done', { artifacts: artifacts, progress: { collected: artifacts.length, total: items.length, failed: failed } });
    return { success: true, artifacts: artifacts.length, failed: failed };
  } catch (e) {
    taskManager.updateTaskStatus(task.task_id, 'failed', { error: e.message });
    return { success: false, error: e.message };
  }
}

function simulateCollection(rules, task) {
  var items = [];
  var count = Math.min(rules.max_items || 50, 5); // Simulate small batches
  for (var i = 0; i < count; i++) {
    if (rules.collect_text) items.push({ type: 'text', filename: task.platform + '-text-' + (i + 1) + '.txt', content: 'Harvested text content ' + (i + 1), tags: [task.platform, 'harvested', 'text'] });
    if (rules.collect_image) items.push({ type: 'image', filename: task.platform + '-image-' + (i + 1) + '.png', content: '', tags: [task.platform, 'harvested', 'image'] });
    if (rules.collect_audio && i % 3 === 0) items.push({ type: 'audio', filename: task.platform + '-audio-' + (i + 1) + '.mp3', content: '', tags: [task.platform, 'harvested', 'audio'] });
    if (rules.collect_video && i % 2 === 0) items.push({ type: 'video', filename: task.platform + '-video-' + (i + 1) + '.mp4', content: '', tags: [task.platform, 'harvested', 'video'] });
  }
  return items;
}

module.exports = { enqueue: enqueue, approveAndRun: approveAndRun, isReviewOnly: function () { return REVIEW_ONLY; } };
