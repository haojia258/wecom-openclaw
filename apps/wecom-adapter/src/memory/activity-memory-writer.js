"use strict";
/**
 * P63 — Activity Memory Writer
 * 写入 activity-memory.json + activity-learning-log.jsonl
 * hash 去重，可重复运行不重复写入
 */
var fs = require("fs"), path = require("path"), crypto = require("crypto");

var DIR = path.join(__dirname, "..", "..", "storage", "memory");
var MEM_FILE = path.join(DIR, "activity-memory.json");
var LOG_FILE = path.join(DIR, "activity-learning-log.jsonl");

function init() {
  if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
  if (!fs.existsSync(MEM_FILE)) fs.writeFileSync(MEM_FILE, "[]", "utf8");
}

function hashEvent(e) {
  var src = (e.eventType || "") + "|" + (e.planId || "") + "|" + (e.batchId || "") + "|" + (e.createdAt || "");
  return crypto.createHash("md5").update(src).digest("hex").substring(0, 16);
}

function loadMem() {
  try { return JSON.parse(fs.readFileSync(MEM_FILE, "utf8")); } catch (e) { return []; }
}

function saveMem(d) {
  fs.writeFileSync(MEM_FILE, JSON.stringify(d, null, 2), "utf8");
}

function appendLog(entry) {
  fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + "\n", "utf8");
}

/** Write a single event. Returns { written, eventId, skipped } */
function write(event) {
  init();
  if (!event || !event.eventType) return { written: false, skipped: true, reason: "no eventType" };

  var eventId = hashEvent(event);
  var mem = loadMem();

  if (mem.some(function (m) { return m.eventId === eventId; })) {
    return { written: false, skipped: true, eventId: eventId, reason: "duplicate" };
  }

  var entry = {
    eventId: eventId,
    eventType: event.eventType,
    planId: event.planId || null,
    batchId: event.batchId || null,
    activity: event.activity || null,
    skus: event.skus || [],
    outcome: event.outcome || null,
    error: event.error || null,
    timestamp: event.createdAt || new Date().toISOString(),
    syncedAt: new Date().toISOString()
  };

  mem.unshift(entry);
  if (mem.length > 500) mem = mem.slice(0, 500);
  saveMem(mem);
  appendLog(entry);
  return { written: true, skipped: false, eventId: eventId };
}

/** Sync from history.json */
var HISTORY_FILE = path.join(__dirname, "..", "..", "storage", "activities", "history.json");

var TRACKED_EVENTS = [
  "enrollment_plan_created", "approval_approved", "approval_rejected",
  "real_enroll_requested", "real_enroll_confirmed", "real_enroll_success", "real_enroll_failed",
  "price_plan_created", "price_blocked", "price_executed_mock",
  "postcheck_completed", "rollback_plan_viewed",
  "batch_real_enroll_requested", "batch_real_enroll_confirmed", "batch_real_enroll_plan_success",
  "batch_real_enroll_plan_failed", "batch_real_enroll_stopped", "batch_real_enroll_completed"
];

function syncFromHistory() {
  var hist = [];
  try { hist = JSON.parse(fs.readFileSync(HISTORY_FILE, "utf8")); } catch (e) {}

  var written = 0, skipped = 0;
  hist.forEach(function (e) {
    if (TRACKED_EVENTS.indexOf(e.eventType) >= 0) {
      // Convert history entry to event
      var event = {
        eventType: e.eventType,
        planId: e.planId || null,
        batchId: e.batchId || null,
        activity: e.activity || null,
        skus: e.skus || [],
        outcome: e.outcome || (e.eventType.indexOf("success") >= 0 ? "success" : e.eventType.indexOf("failed") >= 0 ? "failed" : null),
        error: e.error || e.reason || null,
        createdAt: e.createdAt || null
      };
      var r = write(event);
      if (r.written) written++; else skipped++;
    }
  });
  return { written: written, skipped: skipped, total: hist.length };
}

/** Stats */
function stats() {
  init();
  var mem = loadMem();
  var types = {};
  var activities = {};
  var skus = {};
  mem.forEach(function (m) {
    types[m.eventType] = (types[m.eventType] || 0) + 1;
    if (m.activity) activities[m.activity] = (activities[m.activity] || 0) + 1;
    (m.skus || []).forEach(function (s) { skus[s] = (skus[s] || 0) + 1; });
  });
  return {
    total: mem.length,
    eventTypes: types,
    activityCount: Object.keys(activities).length,
    skuCount: Object.keys(skus).length,
    lastSync: mem.length > 0 ? mem[0].timestamp : null
  };
}

/** Recent records */
function recent(n) {
  init();
  var mem = loadMem();
  return mem.slice(0, n || 20);
}

module.exports = { write: write, syncFromHistory: syncFromHistory, stats: stats, recent: recent, TRACKED_EVENTS: TRACKED_EVENTS };
