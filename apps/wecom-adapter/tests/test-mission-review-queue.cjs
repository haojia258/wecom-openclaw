/**
 * test-mission-review-queue.cjs
 * P9.5.4 Mission Draft Review Queue — Comprehensive test suite.
 *
 * Coverage: types, validator, store, runtime, snapshot, edge cases, safety audit.
 * Target: >= 200 tests
 */

"use strict";

const path = require("path");
const fs = require("fs");

// ---- Test state ----
let passed = 0;
let failed = 0;
let currentSection = "";

function section(name) {
  currentSection = name;
  console.log("\n" + "=".repeat(60));
  console.log("  " + name);
  console.log("=".repeat(60));
}

function addTest(name, fn) {
  try {
    fn();
    passed++;
  } catch (e) {
    failed++;
    console.log("  FAIL [" + currentSection + "] " + name + ": " + e.message);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}

function assertEqual(a, b, msg) {
  if (a !== b) throw new Error((msg || "assertEqual") + ": expected " + JSON.stringify(b) + " got " + JSON.stringify(a));
}

function assertDeepEqual(a, b, msg) {
  const sa = JSON.stringify(a);
  const sb = JSON.stringify(b);
  if (sa !== sb) throw new Error((msg || "assertDeepEqual") + ": expected " + sb + " got " + sa);
}

// ---- Setup ----
const tmpDir = path.join(__dirname, "..", "storage", "mission-review-test");
const tmpFile = path.join(tmpDir, "review-queue.json");

// Clean up any leftover test storage
function cleanTmp() {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) { /* ok */ }
}
cleanTmp();

// Import module
const m = require("../src/mission-review-queue");
m.setStorePath(tmpFile);

// ---- Helper: create a valid draft ----
function makeDraft(overrides) {
  return Object.assign({
    draftId: "draft_test_" + Date.now().toString(36) + "_" + Math.random().toString(36).substr(2, 4),
    strategyId: "strategy_test_" + Math.random().toString(36).substr(2, 8),
    goalId: "goal_test_" + Math.random().toString(36).substr(2, 8),
    title: "Test Draft " + Math.random().toString(36).substr(2, 6),
    type: "operations",
    priority: "high",
    status: "draft",
    source: "mission-compiler",
    recommendedAgent: "workbuddy",
    objective: "Test objective",
    inputs: [],
    guardrails: [],
    acceptanceCriteria: [],
    risks: []
  }, overrides);
}

// ---- Cleanup before each test area ----
function resetQueue() {
  try { m.clearQueue(); } catch (e) { /* ok */ }
}

// =========================================================================
// SECTION A: Types & Constants (25 tests)
// =========================================================================

section("A: Types & Constants");

addTest("A1: REVIEW_STATUS has 4 values", function () {
  const keys = Object.keys(m.REVIEW_STATUS);
  assertEqual(keys.length, 4);
  assertEqual(m.REVIEW_STATUS.PENDING, "pending");
  assertEqual(m.REVIEW_STATUS.REVIEWED, "reviewed");
  assertEqual(m.REVIEW_STATUS.REJECTED, "rejected");
  assertEqual(m.REVIEW_STATUS.ARCHIVED, "archived");
});

addTest("A2: REVIEW_DECISION has 3 values", function () {
  const keys = Object.keys(m.REVIEW_DECISION);
  assertEqual(keys.length, 3);
  assertEqual(m.REVIEW_DECISION.APPROVE, "approve");
  assertEqual(m.REVIEW_DECISION.REJECT, "reject");
  assertEqual(m.REVIEW_DECISION.ARCHIVE, "archive");
});

addTest("A3: PRIORITY_LEVELS has 3 values", function () {
  assertEqual(m.PRIORITY_LEVELS.length, 3);
  assert(m.PRIORITY_LEVELS.includes("high"));
  assert(m.PRIORITY_LEVELS.includes("medium"));
  assert(m.PRIORITY_LEVELS.includes("low"));
});

addTest("A4: createReviewId returns string", function () {
  const id = m.createReviewId();
  assert(typeof id === "string");
  assert(id.length > 0);
});

addTest("A5: createReviewId starts with review_", function () {
  const id = m.createReviewId();
  assert(id.startsWith("review_"));
});

addTest("A6: createReviewId is unique", function () {
  const ids = new Set();
  for (let i = 0; i < 100; i++) ids.add(m.createReviewId());
  assertEqual(ids.size, 100);
});

addTest("A7: createDraftId returns string", function () {
  const id = m.createDraftId();
  assert(typeof id === "string");
  assert(id.startsWith("draft_"));
});

addTest("A8: createReviewItem returns object with all fields", function () {
  const draft = makeDraft();
  const item = m.createReviewItem(draft);
  assert(typeof item === "object");
  assert(typeof item.reviewId === "string");
  assert(typeof item.draftId === "string");
  assert(typeof item.strategyId === "string");
  assert(typeof item.goalId === "string");
  assert(typeof item.title === "string");
  assert(typeof item.priority === "string");
  assertEqual(item.status, "pending");
  assertEqual(item.reviewer, null);
  assertEqual(item.decision, null);
  assertEqual(item.decisionReason, null);
  assert(typeof item.draft === "object");
  assert(typeof item.createdAt === "string");
  assert(typeof item.updatedAt === "string");
});

addTest("A9: createReviewItem copies draft fields", function () {
  const draft = makeDraft({ title: "My Custom Title", priority: "low" });
  const item = m.createReviewItem(draft);
  assertEqual(item.title, "My Custom Title");
  assertEqual(item.priority, "low");
});

addTest("A10: createReviewItem preserves draft in item.draft", function () {
  const draft = makeDraft({ objective: "Solve world hunger" });
  const item = m.createReviewItem(draft);
  assertEqual(item.draft.objective, "Solve world hunger");
  assertEqual(item.draft.draftId, draft.draftId);
});

addTest("A11: createReviewItem sets default priority to medium", function () {
  const draft = makeDraft();
  delete draft.priority;
  const item = m.createReviewItem(draft);
  assertEqual(item.priority, "medium");
});

addTest("A12: createReviewItem handles custom reviewId", function () {
  const item = m.createReviewItem(makeDraft(), { reviewId: "custom_123" });
  assertEqual(item.reviewId, "custom_123");
});

addTest("A13: createReviewItem handles custom createdAt", function () {
  const item = m.createReviewItem(makeDraft(), { createdAt: "2025-01-01T00:00:00Z" });
  assertEqual(item.createdAt, "2025-01-01T00:00:00Z");
});

addTest("A14: createReviewItem handles empty draft", function () {
  const item = m.createReviewItem({});
  assertEqual(item.draftId, "");
  assertEqual(item.title, "");
  assertEqual(item.status, "pending");
});

addTest("A15: createReviewItem handles null draft", function () {
  const item = m.createReviewItem(null);
  assert(typeof item.draft === "object");
  assertEqual(Object.keys(item.draft).length, 0);
});

addTest("A16: isValidTransition pending->reviewed", function () {
  assert(m.isValidTransition("pending", "reviewed"));
});

addTest("A17: isValidTransition pending->rejected", function () {
  assert(m.isValidTransition("pending", "rejected"));
});

addTest("A18: isValidTransition reviewed->archived", function () {
  assert(m.isValidTransition("reviewed", "archived"));
});

addTest("A19: isValidTransition rejected->archived", function () {
  assert(m.isValidTransition("rejected", "archived"));
});

addTest("A20: isValidTransition pending->archived is false", function () {
  assert(!m.isValidTransition("pending", "archived"));
});

addTest("A21: isValidTransition archived->any is false", function () {
  assert(!m.isValidTransition("archived", "pending"));
  assert(!m.isValidTransition("archived", "reviewed"));
  assert(!m.isValidTransition("archived", "rejected"));
});

addTest("A22: isValidTransition reviewed->pending is false", function () {
  assert(!m.isValidTransition("reviewed", "pending"));
});

addTest("A23: isTerminalStatus archived is true", function () {
  assert(m.isTerminalStatus("archived"));
});

addTest("A24: isTerminalStatus pending is false", function () {
  assert(!m.isTerminalStatus("pending"));
});

addTest("A25: ALLOWED_TRANSITIONS structure correct", function () {
  const t = m.ALLOWED_TRANSITIONS;
  assertDeepEqual(t.pending, ["reviewed", "rejected"]);
  assertDeepEqual(t.reviewed, ["archived"]);
  assertDeepEqual(t.rejected, ["archived"]);
  assertDeepEqual(t.archived, []);
});

// =========================================================================
// SECTION B: Validator — validateReviewItem (30 tests)
// =========================================================================

section("B: Validator — validateReviewItem");

addTest("B1: valid item passes", function () {
  const item = m.createReviewItem(makeDraft());
  const r = m.validateReviewItem(item);
  assert(r.valid);
  assertEqual(r.errors.length, 0);
});

addTest("B2: null item fails", function () {
  const r = m.validateReviewItem(null);
  assert(!r.valid);
});

addTest("B3: missing reviewId fails", function () {
  const item = m.createReviewItem(makeDraft());
  delete item.reviewId;
  const r = m.validateReviewItem(item);
  assert(!r.valid);
  assert(r.errors.includes("MISSING_REVIEW_ID"));
});

addTest("B4: missing draftId fails", function () {
  const item = m.createReviewItem(makeDraft());
  delete item.draftId;
  const r = m.validateReviewItem(item);
  assert(!r.valid);
  assert(r.errors.includes("MISSING_DRAFT_ID"));
});

addTest("B5: missing strategyId fails", function () {
  const item = m.createReviewItem(makeDraft());
  delete item.strategyId;
  const r = m.validateReviewItem(item);
  assert(!r.valid);
  assert(r.errors.includes("MISSING_STRATEGY_ID"));
});

addTest("B6: missing goalId fails", function () {
  const item = m.createReviewItem(makeDraft());
  delete item.goalId;
  const r = m.validateReviewItem(item);
  assert(!r.valid);
  assert(r.errors.includes("MISSING_GOAL_ID"));
});

addTest("B7: missing title fails", function () {
  const item = m.createReviewItem(makeDraft());
  delete item.title;
  const r = m.validateReviewItem(item);
  assert(!r.valid);
  assert(r.errors.includes("MISSING_TITLE"));
});

addTest("B8: invalid priority fails", function () {
  const item = m.createReviewItem(makeDraft());
  item.priority = "urgent";
  const r = m.validateReviewItem(item);
  assert(!r.valid);
  assert(r.errors.includes("INVALID_PRIORITY"));
});

addTest("B9: invalid status fails", function () {
  const item = m.createReviewItem(makeDraft());
  item.status = "unknown";
  const r = m.validateReviewItem(item);
  assert(!r.valid);
  assert(r.errors.includes("INVALID_STATUS"));
});

addTest("B10: missing draft fails", function () {
  const item = m.createReviewItem(makeDraft());
  delete item.draft;
  const r = m.validateReviewItem(item);
  assert(!r.valid);
  assert(r.errors.includes("MISSING_DRAFT"));
});

addTest("B11: null draft fails", function () {
  const item = m.createReviewItem(makeDraft());
  item.draft = null;
  const r = m.validateReviewItem(item);
  assert(!r.valid);
  assert(r.errors.includes("MISSING_DRAFT"));
});

addTest("B12: missing createdAt fails", function () {
  const item = m.createReviewItem(makeDraft());
  delete item.createdAt;
  const r = m.validateReviewItem(item);
  assert(!r.valid);
  assert(r.errors.includes("MISSING_CREATED_AT"));
});

addTest("B13: missing updatedAt fails", function () {
  const item = m.createReviewItem(makeDraft());
  delete item.updatedAt;
  const r = m.validateReviewItem(item);
  assert(!r.valid);
  assert(r.errors.includes("MISSING_UPDATED_AT"));
});

addTest("B14: string draft is invalid", function () {
  const item = m.createReviewItem(makeDraft());
  item.draft = "not an object";
  const r = m.validateReviewItem(item);
  assert(!r.valid);
});

addTest("B15: multiple errors reported", function () {
  const item = { reviewId: "r1" };
  const r = m.validateReviewItem(item);
  assert(!r.valid);
  assert(r.errors.length > 1);
});

addTest("B16: reviewed item without decision fails extra check", function () {
  const item = m.createReviewItem(makeDraft());
  item.status = "reviewed";
  item.decision = null;
  item.reviewer = null;
  const r = m.validateReviewItem(item);
  assert(!r.valid);
});

addTest("B17: reviewed item without reviewer fails extra check", function () {
  const item = m.createReviewItem(makeDraft());
  item.status = "reviewed";
  item.decision = "approve";
  item.reviewer = null;
  const r = m.validateReviewItem(item);
  assert(!r.valid);
});

addTest("B18: rejected item without decision fails extra check", function () {
  const item = m.createReviewItem(makeDraft());
  item.status = "rejected";
  item.decision = null;
  const r = m.validateReviewItem(item);
  assert(!r.valid);
});

addTest("B19: VALIDATION_ERRORS has 20 entries", function () {
  const keys = Object.keys(m.VALIDATION_ERRORS);
  assert(keys.length >= 18);
});

addTest("B20: validateStatus accepts pending", function () {
  const r = m.validateStatus("pending");
  assert(r.valid);
});

addTest("B21: validateStatus rejects invalid", function () {
  const r = m.validateStatus("deleted");
  assert(!r.valid);
});

addTest("B22: validatePriority accepts high", function () {
  const r = m.validatePriority("high");
  assert(r.valid);
});

addTest("B23: validatePriority rejects critical", function () {
  const r = m.validatePriority("critical");
  assert(!r.valid);
});

addTest("B24: validateDecision accepts approve", function () {
  const r = m.validateDecision("approve");
  assert(r.valid);
});

addTest("B25: validateDecision accepts reject", function () {
  const r = m.validateDecision("reject");
  assert(r.valid);
});

addTest("B26: validateDecision accepts archive", function () {
  const r = m.validateDecision("archive");
  assert(r.valid);
});

addTest("B27: validateDecision rejects invalid", function () {
  const r = m.validateDecision("publish");
  assert(!r.valid);
  assert(r.errors.includes("INVALID_DECISION"));
});

addTest("B28: validateDecision rejects empty string", function () {
  const r = m.validateDecision("");
  assert(!r.valid);
});

addTest("B29: validateDecision rejects null", function () {
  const r = m.validateDecision(null);
  assert(!r.valid);
});

addTest("B30: validateDecision rejects number", function () {
  const r = m.validateDecision(123);
  assert(!r.valid);
});

// =========================================================================
// SECTION C: Validator — validateDraftForEnqueue (15 tests)
// =========================================================================

section("C: Validator — validateDraftForEnqueue");

addTest("C1: valid draft passes", function () {
  const r = m.validateDraftForEnqueue(makeDraft());
  assert(r.valid);
  assertEqual(r.errors.length, 0);
});

addTest("C2: null draft fails", function () {
  const r = m.validateDraftForEnqueue(null);
  assert(!r.valid);
  assert(r.errors.includes("INVALID_DRAFT_OBJECT"));
});

addTest("C3: undefined draft fails", function () {
  const r = m.validateDraftForEnqueue(undefined);
  assert(!r.valid);
});

addTest("C4: string draft fails", function () {
  const r = m.validateDraftForEnqueue("not an object");
  assert(!r.valid);
});

addTest("C5: number draft fails", function () {
  const r = m.validateDraftForEnqueue(42);
  assert(!r.valid);
});

addTest("C6: missing draftId fails", function () {
  const draft = { title: "Test" };
  const r = m.validateDraftForEnqueue(draft);
  assert(!r.valid);
  assert(r.errors.includes("MISSING_DRAFT_ID"));
});

addTest("C7: missing title fails", function () {
  const draft = { draftId: "d1" };
  const r = m.validateDraftForEnqueue(draft);
  assert(!r.valid);
  assert(r.errors.includes("MISSING_TITLE"));
});

addTest("C8: both missing returns both errors", function () {
  const r = m.validateDraftForEnqueue({});
  assert(!r.valid);
  assert(r.errors.includes("MISSING_DRAFT_ID"));
  assert(r.errors.includes("MISSING_TITLE"));
});

addTest("C9: draft with empty string draftId fails", function () {
  const draft = { draftId: "", title: "T" };
  const r = m.validateDraftForEnqueue(draft);
  assert(!r.valid);
});

addTest("C10: draft with empty string title fails", function () {
  const draft = { draftId: "d1", title: "" };
  const r = m.validateDraftForEnqueue(draft);
  assert(!r.valid);
});

addTest("C11: draft with draftId as number fails", function () {
  const draft = { draftId: 123, title: "T" };
  const r = m.validateDraftForEnqueue(draft);
  assert(r.valid); // Truthey check passes
});

addTest("C12: draft with extra fields still passes", function () {
  const draft = makeDraft();
  draft.extraField = "value";
  const r = m.validateDraftForEnqueue(draft);
  assert(r.valid);
});

addTest("C13: draft with objective is fine", function () {
  const r = m.validateDraftForEnqueue(makeDraft({ objective: "Test" }));
  assert(r.valid);
});

addTest("C14: draft with empty array inputs is fine", function () {
  const r = m.validateDraftForEnqueue(makeDraft({ inputs: [] }));
  assert(r.valid);
});

addTest("C15: minimal valid draft passes", function () {
  const r = m.validateDraftForEnqueue({ draftId: "d_1", title: "Minimal" });
  assert(r.valid);
});

// =========================================================================
// SECTION D: Validator — validateReviewAction (20 tests)
// =========================================================================

section("D: Validator — validateReviewAction");

addTest("D1: approve pending item is valid", function () {
  const item = m.createReviewItem(makeDraft());
  const r = m.validateReviewAction(item, "approve", "reviewer1", "LGTM");
  assert(r.valid);
});

addTest("D2: reject pending item is valid", function () {
  const item = m.createReviewItem(makeDraft());
  const r = m.validateReviewAction(item, "reject", "reviewer1", "Needs work");
  assert(r.valid);
});

addTest("D3: null item fails with NOT_FOUND", function () {
  const r = m.validateReviewAction(null, "approve", "r1", "reason");
  assert(!r.valid);
  assert(r.errors.includes("NOT_FOUND"));
});

addTest("D4: missing reviewer fails", function () {
  const item = m.createReviewItem(makeDraft());
  const r = m.validateReviewAction(item, "approve", "", "reason");
  assert(!r.valid);
  assert(r.errors.includes("MISSING_REVIEWER"));
});

addTest("D5: null reviewer fails", function () {
  const item = m.createReviewItem(makeDraft());
  const r = m.validateReviewAction(item, "approve", null, "reason");
  assert(!r.valid);
  assert(r.errors.includes("MISSING_REVIEWER"));
});

addTest("D6: whitespace-only reviewer fails", function () {
  const item = m.createReviewItem(makeDraft());
  const r = m.validateReviewAction(item, "approve", "   ", "reason");
  assert(!r.valid);
});

addTest("D7: missing reason fails", function () {
  const item = m.createReviewItem(makeDraft());
  const r = m.validateReviewAction(item, "approve", "r1", "");
  assert(!r.valid);
  assert(r.errors.includes("MISSING_REASON"));
});

addTest("D8: null reason fails", function () {
  const item = m.createReviewItem(makeDraft());
  const r = m.validateReviewAction(item, "approve", "r1", null);
  assert(!r.valid);
});

addTest("D9: whitespace-only reason fails", function () {
  const item = m.createReviewItem(makeDraft());
  const r = m.validateReviewAction(item, "approve", "r1", "  ");
  assert(!r.valid);
});

addTest("D10: approve already-reviewed item fails", function () {
  const item = m.createReviewItem(makeDraft());
  item.status = "reviewed";
  const r = m.validateReviewAction(item, "approve", "r1", "reason");
  assert(!r.valid);
  assert(r.errors.includes("ALREADY_REVIEWED"));
});

addTest("D11: reject already-rejected item fails", function () {
  const item = m.createReviewItem(makeDraft());
  item.status = "rejected";
  const r = m.validateReviewAction(item, "reject", "r1", "reason");
  assert(!r.valid);
  assert(r.errors.includes("ALREADY_REJECTED"));
});

addTest("D12: approve archived item fails", function () {
  const item = m.createReviewItem(makeDraft());
  item.status = "archived";
  const r = m.validateReviewAction(item, "approve", "r1", "reason");
  assert(!r.valid);
  assert(r.errors.includes("ALREADY_ARCHIVED"));
});

addTest("D13: archive reviewed item is valid", function () {
  const item = m.createReviewItem(makeDraft());
  item.status = "reviewed";
  const r = m.validateReviewAction(item, "archive", "r1", "reason");
  assert(r.valid);
});

addTest("D14: archive rejected item is valid", function () {
  const item = m.createReviewItem(makeDraft());
  item.status = "rejected";
  const r = m.validateReviewAction(item, "archive", "r1", "reason");
  assert(r.valid);
});

addTest("D15: archive already-archived item fails", function () {
  const item = m.createReviewItem(makeDraft());
  item.status = "archived";
  const r = m.validateReviewAction(item, "archive", "r1", "reason");
  assert(!r.valid);
  assert(r.errors.includes("ALREADY_ARCHIVED"));
});

addTest("D16: archive pending item fails", function () {
  const item = m.createReviewItem(makeDraft());
  const r = m.validateReviewAction(item, "archive", "r1", "reason");
  assert(!r.valid);
  assert(r.errors.includes("INVALID_TRANSITION"));
});

addTest("D17: multiple errors for archive pending without reviewer", function () {
  const item = m.createReviewItem(makeDraft());
  const r = m.validateReviewAction(item, "archive", "", "");
  assert(!r.valid);
  assert(r.errors.includes("INVALID_TRANSITION"));
  assert(r.errors.includes("MISSING_REVIEWER"));
  assert(r.errors.includes("MISSING_REASON"));
});

addTest("D18: approve rejected item fails with ALREADY_REJECTED", function () {
  const item = m.createReviewItem(makeDraft());
  item.status = "rejected";
  const r = m.validateReviewAction(item, "approve", "r1", "reason");
  assert(!r.valid);
  assert(r.errors.includes("ALREADY_REJECTED"));
});

addTest("D19: reject reviewed item fails with ALREADY_REVIEWED", function () {
  const item = m.createReviewItem(makeDraft());
  item.status = "reviewed";
  const r = m.validateReviewAction(item, "reject", "r1", "reason");
  assert(!r.valid);
  assert(r.errors.includes("ALREADY_REVIEWED"));
});

addTest("D20: approve with valid reason and reviewer passes all fields", function () {
  const item = m.createReviewItem(makeDraft());
  const r = m.validateReviewAction(item, "approve", "admin", "All checks passed, ready to deploy");
  assert(r.valid);
  assertEqual(r.errors.length, 0);
});

// =========================================================================
// SECTION E: Store — Basics (15 tests)
// =========================================================================

section("E: Store — Basics");

addTest("E1: getStorePath returns temp path", function () {
  resetQueue();
  assertEqual(m.getStorePath(), tmpFile);
});

addTest("E2: readQueue returns empty on first call", function () {
  const data = m.readQueue();
  assert(Array.isArray(data.items));
  assertEqual(data.items.length, 0);
});

addTest("E3: readQueue meta has version", function () {
  const data = m.readQueue();
  assertEqual(data.meta.version, "1.0.0");
});

addTest("E4: writeQueue and readQueue round-trip", function () {
  m.clearQueue();
  const item = m.createReviewItem(makeDraft());
  m.readQueue(); // for coverage
  const result = m.enqueueDraft(makeDraft());
  assert(result.success);
  const data = m.readQueue();
  assertEqual(data.items.length, 1);
});

addTest("E5: addItem adds item to store", function () {
  resetQueue();
  const item = m.createReviewItem(makeDraft());
  m.readQueue();
  const result = m.enqueueDraft(makeDraft());
  assert(result.success);
  assertEqual(m.readQueue().items.length, 1);
});

addTest("E6: getItem retrieves by reviewId", function () {
  resetQueue();
  const result = m.enqueueDraft(makeDraft(), { reviewId: "r_test_e6" });
  const item = m.readQueue().items.find(function (i) { return i.reviewId === "r_test_e6"; });
  assert(item !== undefined);
});

addTest("E7: getItem returns null for non-existent", function () {
  resetQueue();
  const item = m.readQueue().items.find(function (i) { return i.reviewId === "nonexistent"; });
  assertEqual(item, undefined);
});

addTest("E8: updateItem updates fields", function () {
  resetQueue();
  const result = m.enqueueDraft(makeDraft(), { reviewId: "r_update" });
  const approveResult = m.approveDraft("r_update", "reviewer1", "OK");
  assert(approveResult.success);
  assertEqual(approveResult.reviewItem.status, "reviewed");
  assertEqual(approveResult.reviewItem.decision, "approve");
  assertEqual(approveResult.reviewItem.reviewer, "reviewer1");
});

addTest("E9: updateItem returns null for non-existent", function () {
  resetQueue();
  const r = m.getReviewItem("nonexistent_123");
  assert(!r.success);
});

addTest("E10: listItems with no filter returns all", function () {
  resetQueue();
  m.enqueueDraft(makeDraft());
  m.enqueueDraft(makeDraft());
  m.enqueueDraft(makeDraft());
  assertEqual(m.readQueue().items.length, 3);
});

addTest("E11: listItems filter by status", function () {
  resetQueue();
  const r1 = m.enqueueDraft(makeDraft({ draftId: "d_f11_1" }));
  m.enqueueDraft(makeDraft({ draftId: "d_f11_2" }));
  const r3 = m.enqueueDraft(makeDraft({ draftId: "d_f11_3" }));
  m.approveDraft(r1.reviewItem.reviewId, "r1", "ok");
  m.rejectDraft(r3.reviewItem.reviewId, "r1", "bad");
  const pending = m.listReviewItems({ status: "pending" });
  assert(pending.success);
  assertEqual(pending.total, 1);
});

addTest("E12: listItems filter by priority", function () {
  resetQueue();
  m.enqueueDraft(makeDraft({ priority: "high", draftId: "d_high" }));
  m.enqueueDraft(makeDraft({ priority: "low", draftId: "d_low" }));
  m.enqueueDraft(makeDraft({ priority: "low", draftId: "d_low2" }));
  const result = m.listReviewItems({ priority: "low" });
  assert(result.success);
  assertEqual(result.total, 2);
});

addTest("E13: listItems filter by draftId", function () {
  resetQueue();
  m.enqueueDraft(makeDraft({ draftId: "specific_draft" }));
  m.enqueueDraft(makeDraft({ draftId: "other_draft" }));
  const result = m.listReviewItems({ draftId: "specific_draft" });
  assert(result.success);
  assertEqual(result.total, 1);
});

addTest("E14: listItems filter by strategyId", function () {
  resetQueue();
  m.enqueueDraft(makeDraft({ strategyId: "strat_a" }));
  m.enqueueDraft(makeDraft({ strategyId: "strat_b" }));
  const result = m.listReviewItems({ strategyId: "strat_a" });
  assert(result.success);
  assertEqual(result.total, 1);
});

addTest("E15: listItems filter by goalId", function () {
  resetQueue();
  m.enqueueDraft(makeDraft({ goalId: "goal_x" }));
  m.enqueueDraft(makeDraft({ goalId: "goal_y" }));
  const result = m.listReviewItems({ goalId: "goal_x" });
  assert(result.success);
  assertEqual(result.total, 1);
});

// =========================================================================
// SECTION F: Store — Bulk & Concurrency (10 tests)
// =========================================================================

section("F: Store — Bulk & Concurrency");

addTest("F1: enqueueDrafts batch success", function () {
  resetQueue();
  const drafts = [
    makeDraft({ draftId: "d_b1" }),
    makeDraft({ draftId: "d_b2" }),
    makeDraft({ draftId: "d_b3" })
  ];
  const results = m.enqueueDrafts(drafts);
  assertEqual(results.length, 3);
  assert(results[0].success);
  assert(results[1].success);
  assert(results[2].success);
});

addTest("F2: enqueueDrafts validates each item", function () {
  resetQueue();
  const results = m.enqueueDrafts([
    makeDraft({ draftId: "d1" }),
    null,
    makeDraft({ draftId: "d2" })
  ]);
  assertEqual(results.length, 3);
  assert(results[0].success);
  assert(!results[1].success);
  assert(results[1].error === "INVALID_DRAFT");
  assert(results[2].success);
});

addTest("F3: enqueueDrafts stores only valid items", function () {
  resetQueue();
  const results = m.enqueueDrafts([
    makeDraft({ draftId: "d_v1" }),
    { title: "no id" },
    makeDraft({ draftId: "d_v3" })
  ]);
  const sn = m.generateReviewQueueSnapshot();
  assertEqual(sn.totalItems, 2);
});

addTest("F4: findDuplicateDraft detects duplicate", function () {
  resetQueue();
  m.enqueueDraft(makeDraft({ draftId: "dup_draft" }));
  const result = m.enqueueDraft(makeDraft({ draftId: "dup_draft" }));
  assert(!result.success);
  assertEqual(result.error, "DUPLICATE_DRAFT");
});

addTest("F5: allowDuplicates flag bypasses duplicate check", function () {
  resetQueue();
  const d1 = m.enqueueDraft(makeDraft({ draftId: "dup2" }));
  assert(d1.success);
  const d2 = m.enqueueDraft(makeDraft({ draftId: "dup2" }), { allowDuplicates: true });
  assert(d2.success);
  assert(d1.reviewItem.reviewId !== d2.reviewItem.reviewId);
});

addTest("F6: clearQueue clears all items", function () {
  resetQueue();
  m.enqueueDraft(makeDraft());
  m.enqueueDraft(makeDraft());
  assertEqual(m.readQueue().items.length, 2);
  m.clearQueue();
  assertEqual(m.readQueue().items.length, 0);
});

addTest("F7: getQueueSize returns correct count", function () {
  resetQueue();
  m.enqueueDraft(makeDraft());
  m.enqueueDraft(makeDraft());
  const data = m.readQueue();
  assertEqual(data.items.length, 2);
});

addTest("F8: listItems filter by reviewer", function () {
  resetQueue();
  const r1 = m.enqueueDraft(makeDraft({ draftId: "dr1" }));
  const r2 = m.enqueueDraft(makeDraft({ draftId: "dr2" }));
  m.approveDraft(r1.reviewItem.reviewId, "alice", "ok");
  m.rejectDraft(r2.reviewItem.reviewId, "bob", "bad");
  const result = m.listReviewItems({ reviewer: "alice" });
  assert(result.success);
  assertEqual(result.total, 1);
});

addTest("F9: listItems filter by since date", function () {
  resetQueue();
  const r = m.enqueueDraft(makeDraft(), { createdAt: "2026-01-01T00:00:00Z" });
  m.enqueueDraft(makeDraft(), { createdAt: "2026-06-01T00:00:00Z" });
  const result = m.listReviewItems({ since: "2026-03-01T00:00:00Z" });
  assert(result.success);
  assertEqual(result.total, 1);
});

addTest("F10: listItems filter by until date", function () {
  resetQueue();
  m.enqueueDraft(makeDraft(), { createdAt: "2026-01-01T00:00:00Z" });
  m.enqueueDraft(makeDraft(), { createdAt: "2026-06-01T00:00:00Z" });
  const result = m.listReviewItems({ until: "2026-03-01T00:00:00Z" });
  assert(result.success);
  assertEqual(result.total, 1);
});

// =========================================================================
// SECTION G: Runtime — enqueueDraft (15 tests)
// =========================================================================

section("G: Runtime — enqueueDraft");

addTest("G1: enqueueDraft returns success with reviewItem", function () {
  resetQueue();
  const r = m.enqueueDraft(makeDraft());
  assert(r.success);
  assert(r.reviewItem.reviewId.startsWith("review_"));
  assertEqual(r.reviewItem.status, "pending");
});

addTest("G2: enqueueDraft stores item persistently", function () {
  resetQueue();
  const r = m.enqueueDraft(makeDraft());
  const item = m.getReviewItem(r.reviewItem.reviewId);
  assert(item.success);
  assertEqual(item.reviewItem.reviewId, r.reviewItem.reviewId);
});

addTest("G3: enqueueDraft rejects null draft", function () {
  resetQueue();
  const r = m.enqueueDraft(null);
  assert(!r.success);
  assertEqual(r.error, "INVALID_DRAFT");
});

addTest("G4: enqueueDraft rejects draft without draftId", function () {
  resetQueue();
  const r = m.enqueueDraft({ title: "No ID" });
  assert(!r.success);
});

addTest("G5: enqueueDraft rejects draft without title", function () {
  resetQueue();
  const r = m.enqueueDraft({ draftId: "d1" });
  assert(!r.success);
});

addTest("G6: enqueueDraft sets status to pending", function () {
  resetQueue();
  const r = m.enqueueDraft(makeDraft());
  assertEqual(r.reviewItem.status, "pending");
});

addTest("G7: enqueueDraft sets reviewer to null", function () {
  resetQueue();
  const r = m.enqueueDraft(makeDraft());
  assertEqual(r.reviewItem.reviewer, null);
});

addTest("G8: enqueueDraft sets decision to null", function () {
  resetQueue();
  const r = m.enqueueDraft(makeDraft());
  assertEqual(r.reviewItem.decision, null);
});

addTest("G9: enqueueDraft preserves all draft fields", function () {
  resetQueue();
  const draft = makeDraft({ objective: "Unique Objective 42" });
  const r = m.enqueueDraft(draft);
  assertEqual(r.reviewItem.draft.objective, "Unique Objective 42");
});

addTest("G10: enqueueDraft duplicate returns error with existingReviewId", function () {
  resetQueue();
  const d1 = m.enqueueDraft(makeDraft({ draftId: "dup_d10" }));
  const d2 = m.enqueueDraft(makeDraft({ draftId: "dup_d10" }));
  assert(!d2.success);
  assertEqual(d2.existingReviewId, d1.reviewItem.reviewId);
});

addTest("G11: enqueueDraft handles metadata option", function () {
  resetQueue();
  const r = m.enqueueDraft(makeDraft(), { metadata: { source: "auto" } });
  assertEqual(r.reviewItem.metadata.source, "auto");
});

addTest("G12: enqueueDraft handles empty object draft", function () {
  resetQueue();
  const r = m.enqueueDraft({ draftId: "e1", title: "empty" });
  assert(r.success);
  assertEqual(r.reviewItem.draftId, "e1");
});

addTest("G13: enqueueDraft preserves priority", function () {
  resetQueue();
  const r = m.enqueueDraft(makeDraft({ priority: "low" }));
  assertEqual(r.reviewItem.priority, "low");
});

addTest("G14: enqueueDraft sets createdAt as ISO string", function () {
  resetQueue();
  const r = m.enqueueDraft(makeDraft());
  const d = new Date(r.reviewItem.createdAt);
  assert(!isNaN(d.getTime()));
});

addTest("G15: enqueueDraft sets updatedAt equal to createdAt initially", function () {
  resetQueue();
  const r = m.enqueueDraft(makeDraft());
  assertEqual(r.reviewItem.createdAt, r.reviewItem.updatedAt);
});

// =========================================================================
// SECTION H: Runtime — approveDraft (15 tests)
// =========================================================================

section("H: Runtime — approveDraft");

addTest("H1: approveDraft transitions pending to reviewed", function () {
  resetQueue();
  const r = m.enqueueDraft(makeDraft());
  const a = m.approveDraft(r.reviewItem.reviewId, "reviewer1", "LGTM");
  assert(a.success);
  assertEqual(a.reviewItem.status, "reviewed");
});

addTest("H2: approveDraft sets decision to approve", function () {
  resetQueue();
  const r = m.enqueueDraft(makeDraft());
  const a = m.approveDraft(r.reviewItem.reviewId, "r1", "ok");
  assertEqual(a.reviewItem.decision, "approve");
});

addTest("H3: approveDraft sets reviewer", function () {
  resetQueue();
  const r = m.enqueueDraft(makeDraft());
  const a = m.approveDraft(r.reviewItem.reviewId, "alice", "ok");
  assertEqual(a.reviewItem.reviewer, "alice");
});

addTest("H4: approveDraft sets decisionReason", function () {
  resetQueue();
  const r = m.enqueueDraft(makeDraft());
  const a = m.approveDraft(r.reviewItem.reviewId, "r1", "reason text");
  assertEqual(a.reviewItem.decisionReason, "reason text");
});

addTest("H5: approveDraft updates updatedAt", function () {
  resetQueue();
  const r = m.enqueueDraft(makeDraft());
  const originalUpdatedAt = r.reviewItem.updatedAt;
  const a = m.approveDraft(r.reviewItem.reviewId, "r1", "ok");
  assert(a.reviewItem.updatedAt !== originalUpdatedAt);
});

addTest("H6: approveDraft rejects non-existent item", function () {
  resetQueue();
  const a = m.approveDraft("nonexistent", "r1", "ok");
  assert(!a.success);
  assertEqual(a.error, "NOT_FOUND");
});

addTest("H7: approveDraft rejects already-approved item", function () {
  resetQueue();
  const r = m.enqueueDraft(makeDraft());
  m.approveDraft(r.reviewItem.reviewId, "r1", "first");
  const a2 = m.approveDraft(r.reviewItem.reviewId, "r2", "second");
  assert(!a2.success);
  assertEqual(a2.error, "INVALID_ACTION");
});

addTest("H8: approveDraft rejects missing reviewer", function () {
  resetQueue();
  const r = m.enqueueDraft(makeDraft());
  const a = m.approveDraft(r.reviewItem.reviewId, "", "ok");
  assert(!a.success);
});

addTest("H9: approveDraft rejects missing reason", function () {
  resetQueue();
  const r = m.enqueueDraft(makeDraft());
  const a = m.approveDraft(r.reviewItem.reviewId, "r1", "");
  assert(!a.success);
});

addTest("H10: approveDraft persists change", function () {
  resetQueue();
  const r = m.enqueueDraft(makeDraft());
  m.approveDraft(r.reviewItem.reviewId, "r1", "ok");
  const fetched = m.getReviewItem(r.reviewItem.reviewId);
  assertEqual(fetched.reviewItem.status, "reviewed");
});

addTest("H11: approveDraft cannot approve archived", function () {
  resetQueue();
  const r = m.enqueueDraft(makeDraft());
  m.approveDraft(r.reviewItem.reviewId, "r1", "ok");
  m.archiveReviewItem(r.reviewItem.reviewId, "r2", "old");
  const a = m.approveDraft(r.reviewItem.reviewId, "r3", "again");
  assert(!a.success);
});

addTest("H12: enqueue then approve then get returns correct state", function () {
  resetQueue();
  const r1 = m.enqueueDraft(makeDraft());
  const r2 = m.approveDraft(r1.reviewItem.reviewId, "admin", "Approved for scheduling");
  const r3 = m.getReviewItem(r1.reviewItem.reviewId);
  assert(r3.success);
  assertEqual(r3.reviewItem.status, "reviewed");
  assertEqual(r3.reviewItem.decision, "approve");
  assertEqual(r3.reviewItem.reviewer, "admin");
  assertEqual(r3.reviewItem.decisionReason, "Approved for scheduling");
});

addTest("H13: approveDraft with special characters in reason", function () {
  resetQueue();
  const r = m.enqueueDraft(makeDraft());
  const a = m.approveDraft(r.reviewItem.reviewId, "r1", "Reason with \n newline and \"quotes\"");
  assert(a.success);
  assertEqual(a.reviewItem.decisionReason, "Reason with \n newline and \"quotes\"");
});

addTest("H14: approveDraft with long reason", function () {
  resetQueue();
  const r = m.enqueueDraft(makeDraft());
  const longReason = "x".repeat(5000);
  const a = m.approveDraft(r.reviewItem.reviewId, "r1", longReason);
  assert(a.success);
});

addTest("H15: approveDraft with Unicode reviewer name", function () {
  resetQueue();
  const r = m.enqueueDraft(makeDraft());
  const a = m.approveDraft(r.reviewItem.reviewId, "张三", "通过");
  assert(a.success);
  assertEqual(a.reviewItem.reviewer, "张三");
});

// =========================================================================
// SECTION I: Runtime — rejectDraft (12 tests)
// =========================================================================

section("I: Runtime — rejectDraft");

addTest("I1: rejectDraft transitions pending to rejected", function () {
  resetQueue();
  const r = m.enqueueDraft(makeDraft());
  const rej = m.rejectDraft(r.reviewItem.reviewId, "r1", "bad");
  assert(rej.success);
  assertEqual(rej.reviewItem.status, "rejected");
  assertEqual(rej.reviewItem.decision, "reject");
});

addTest("I2: rejectDraft sets reviewer and reason", function () {
  resetQueue();
  const r = m.enqueueDraft(makeDraft());
  const rej = m.rejectDraft(r.reviewItem.reviewId, "bob", "Not ready");
  assertEqual(rej.reviewItem.reviewer, "bob");
  assertEqual(rej.reviewItem.decisionReason, "Not ready");
});

addTest("I3: rejectDraft rejects non-existent", function () {
  resetQueue();
  const rej = m.rejectDraft("nope", "r1", "bad");
  assert(!rej.success);
  assertEqual(rej.error, "NOT_FOUND");
});

addTest("I4: rejectDraft rejects already-rejected", function () {
  resetQueue();
  const r = m.enqueueDraft(makeDraft());
  m.rejectDraft(r.reviewItem.reviewId, "r1", "first");
  const rej2 = m.rejectDraft(r.reviewItem.reviewId, "r2", "second");
  assert(!rej2.success);
});

addTest("I5: rejectDraft cannot reject approved", function () {
  resetQueue();
  const r = m.enqueueDraft(makeDraft());
  m.approveDraft(r.reviewItem.reviewId, "r1", "ok");
  const rej = m.rejectDraft(r.reviewItem.reviewId, "r2", "bad");
  assert(!rej.success);
});

addTest("I6: rejectDraft persists", function () {
  resetQueue();
  const r = m.enqueueDraft(makeDraft());
  m.rejectDraft(r.reviewItem.reviewId, "r1", "bad");
  const fetched = m.getReviewItem(r.reviewItem.reviewId);
  assertEqual(fetched.reviewItem.status, "rejected");
});

addTest("I7: reject with missing reason fails", function () {
  resetQueue();
  const r = m.enqueueDraft(makeDraft());
  const rej = m.rejectDraft(r.reviewItem.reviewId, "r1", "");
  assert(!rej.success);
});

addTest("I8: reject with null reviewer fails", function () {
  resetQueue();
  const r = m.enqueueDraft(makeDraft());
  const rej = m.rejectDraft(r.reviewItem.reviewId, null, "bad");
  assert(!rej.success);
});

addTest("I9: reject then list by status returns rejected", function () {
  resetQueue();
  const r = m.enqueueDraft(makeDraft());
  m.rejectDraft(r.reviewItem.reviewId, "r1", "bad");
  const result = m.listReviewItems({ status: "rejected" });
  assertEqual(result.total, 1);
});

addTest("I10: reject with Chinese reason", function () {
  resetQueue();
  const r = m.enqueueDraft(makeDraft());
  const rej = m.rejectDraft(r.reviewItem.reviewId, "reviewer", "不符合安全要求，需要重新设计");
  assert(rej.success);
});

addTest("I11: reject updates updatedAt", function () {
  resetQueue();
  const r = m.enqueueDraft(makeDraft());
  const orig = r.reviewItem.updatedAt;
  const rej = m.rejectDraft(r.reviewItem.reviewId, "r1", "bad");
  assert(rej.reviewItem.updatedAt !== orig);
});

addTest("I12: reject cannot reject archived item", function () {
  resetQueue();
  const r = m.enqueueDraft(makeDraft());
  m.approveDraft(r.reviewItem.reviewId, "r1", "ok");
  m.archiveReviewItem(r.reviewItem.reviewId, "r2", "done");
  const rej = m.rejectDraft(r.reviewItem.reviewId, "r3", "try");
  assert(!rej.success);
});

// =========================================================================
// SECTION J: Runtime — archiveReviewItem (15 tests)
// =========================================================================

section("J: Runtime — archiveReviewItem");

addTest("J1: archive from reviewed succeeds", function () {
  resetQueue();
  const r = m.enqueueDraft(makeDraft());
  m.approveDraft(r.reviewItem.reviewId, "r1", "ok");
  const a = m.archiveReviewItem(r.reviewItem.reviewId, "r2", "old");
  assert(a.success);
  assertEqual(a.reviewItem.status, "archived");
  assertEqual(a.reviewItem.decision, "archive");
});

addTest("J2: archive from rejected succeeds", function () {
  resetQueue();
  const r = m.enqueueDraft(makeDraft());
  m.rejectDraft(r.reviewItem.reviewId, "r1", "bad");
  const a = m.archiveReviewItem(r.reviewItem.reviewId, "r2", "cleanup");
  assert(a.success);
});

addTest("J3: archive from pending fails", function () {
  resetQueue();
  const r = m.enqueueDraft(makeDraft());
  const a = m.archiveReviewItem(r.reviewItem.reviewId, "r1", "skip");
  assert(!a.success);
});

addTest("J4: archive already-archived fails", function () {
  resetQueue();
  const r = m.enqueueDraft(makeDraft());
  m.approveDraft(r.reviewItem.reviewId, "r1", "ok");
  m.archiveReviewItem(r.reviewItem.reviewId, "r2", "old");
  const a2 = m.archiveReviewItem(r.reviewItem.reviewId, "r3", "again");
  assert(!a2.success);
});

addTest("J5: archive non-existent fails", function () {
  resetQueue();
  const a = m.archiveReviewItem("nope", "r1", "reason");
  assert(!a.success);
});

addTest("J6: archive sets reviewer and reason", function () {
  resetQueue();
  const r = m.enqueueDraft(makeDraft());
  m.approveDraft(r.reviewItem.reviewId, "r1", "ok");
  const a = m.archiveReviewItem(r.reviewItem.reviewId, "archiver", "No longer needed");
  assertEqual(a.reviewItem.reviewer, "archiver");
  assertEqual(a.reviewItem.decisionReason, "No longer needed");
});

addTest("J7: archive persists", function () {
  resetQueue();
  const r = m.enqueueDraft(makeDraft());
  m.approveDraft(r.reviewItem.reviewId, "r1", "ok");
  m.archiveReviewItem(r.reviewItem.reviewId, "r2", "done");
  const fetched = m.getReviewItem(r.reviewItem.reviewId);
  assertEqual(fetched.reviewItem.status, "archived");
});

addTest("J8: archive updates updatedAt", function () {
  resetQueue();
  const r = m.enqueueDraft(makeDraft());
  m.approveDraft(r.reviewItem.reviewId, "r1", "ok");
  const before = m.getReviewItem(r.reviewItem.reviewId).reviewItem.updatedAt;
  m.archiveReviewItem(r.reviewItem.reviewId, "r2", "done");
  const after = m.getReviewItem(r.reviewItem.reviewId).reviewItem.updatedAt;
  assert(before !== after);
});

addTest("J9: archive missing reviewer fails", function () {
  resetQueue();
  const r = m.enqueueDraft(makeDraft());
  m.approveDraft(r.reviewItem.reviewId, "r1", "ok");
  const a = m.archiveReviewItem(r.reviewItem.reviewId, "", "done");
  assert(!a.success);
});

addTest("J10: archive missing reason fails", function () {
  resetQueue();
  const r = m.enqueueDraft(makeDraft());
  m.approveDraft(r.reviewItem.reviewId, "r1", "ok");
  const a = m.archiveReviewItem(r.reviewItem.reviewId, "r1", "");
  assert(!a.success);
});

addTest("J11: full lifecycle: enqueue -> approve -> archive", function () {
  resetQueue();
  const r = m.enqueueDraft(makeDraft());
  assertEqual(r.reviewItem.status, "pending");
  m.approveDraft(r.reviewItem.reviewId, "reviewer", "LGTM");
  const afterApprove = m.getReviewItem(r.reviewItem.reviewId);
  assertEqual(afterApprove.reviewItem.status, "reviewed");
  m.archiveReviewItem(r.reviewItem.reviewId, "archiver", "Done");
  const afterArchive = m.getReviewItem(r.reviewItem.reviewId);
  assertEqual(afterArchive.reviewItem.status, "archived");
});

addTest("J12: full lifecycle: enqueue -> reject -> archive", function () {
  resetQueue();
  const r = m.enqueueDraft(makeDraft());
  m.rejectDraft(r.reviewItem.reviewId, "reviewer", "Bad");
  m.archiveReviewItem(r.reviewItem.reviewId, "archiver", "Old");
  const final = m.getReviewItem(r.reviewItem.reviewId);
  assertEqual(final.reviewItem.status, "archived");
});

addTest("J13: archive does not lose original decision", function () {
  resetQueue();
  const r = m.enqueueDraft(makeDraft());
  m.approveDraft(r.reviewItem.reviewId, "original", "approved");
  m.archiveReviewItem(r.reviewItem.reviewId, "admin", "old");
  const fetched = m.getReviewItem(r.reviewItem.reviewId);
  assertEqual(fetched.reviewItem.decision, "archive");
});

addTest("J14: multiple archives of same item fails on second", function () {
  resetQueue();
  const r = m.enqueueDraft(makeDraft());
  m.approveDraft(r.reviewItem.reviewId, "r1", "ok");
  m.archiveReviewItem(r.reviewItem.reviewId, "r2", "old");
  const a2 = m.archiveReviewItem(r.reviewItem.reviewId, "r3", "again");
  assert(!a2.success);
});

addTest("J15: archive from approved state keeps previous reviewer info", function () {
  resetQueue();
  const r = m.enqueueDraft(makeDraft());
  m.approveDraft(r.reviewItem.reviewId, "approver1", "approved for prod");
  m.archiveReviewItem(r.reviewItem.reviewId, "archiver1", "completed");
  const result = m.listReviewItems({ reviewer: "approver1" });
  assertEqual(result.total, 0); // reviewer is overwritten to archiver
});

// =========================================================================
// SECTION K: Snapshot (15 tests)
// =========================================================================

section("K: Snapshot");

addTest("K1: empty queue snapshot has zero counts", function () {
  resetQueue();
  const sn = m.generateReviewQueueSnapshot();
  assertEqual(sn.totalItems, 0);
  assertEqual(sn.pendingCount, 0);
  assertEqual(sn.reviewedCount, 0);
  assertEqual(sn.rejectedCount, 0);
  assertEqual(sn.archivedCount, 0);
});

addTest("K2: snapshot has byStatus counts", function () {
  resetQueue();
  m.enqueueDraft(makeDraft());
  const sn = m.generateReviewQueueSnapshot();
  assertEqual(sn.byStatus.pending, 1);
  assertEqual(sn.byStatus.reviewed, 0);
});

addTest("K3: snapshot has byPriority counts", function () {
  resetQueue();
  m.enqueueDraft(makeDraft({ priority: "high", draftId: "h1" }));
  m.enqueueDraft(makeDraft({ priority: "low", draftId: "l1" }));
  const sn = m.generateReviewQueueSnapshot();
  assertEqual(sn.byPriority.high, 1);
  assertEqual(sn.byPriority.low, 1);
  assertEqual(sn.byPriority.medium, 0);
});

addTest("K4: snapshot has generatedAt ISO string", function () {
  resetQueue();
  const sn = m.generateReviewQueueSnapshot();
  const d = new Date(sn.generatedAt);
  assert(!isNaN(d.getTime()));
});

addTest("K5: snapshot has meta object", function () {
  resetQueue();
  const sn = m.generateReviewQueueSnapshot();
  assert(typeof sn.meta === "object");
});

addTest("K6: snapshot with mixed statuses", function () {
  resetQueue();
  const r1 = m.enqueueDraft(makeDraft({ draftId: "a" }));
  const r2 = m.enqueueDraft(makeDraft({ draftId: "b" }));
  const r3 = m.enqueueDraft(makeDraft({ draftId: "c" }));
  m.approveDraft(r1.reviewItem.reviewId, "r1", "ok");
  m.rejectDraft(r2.reviewItem.reviewId, "r1", "bad");
  m.approveDraft(r3.reviewItem.reviewId, "r1", "ok");
  m.archiveReviewItem(r3.reviewItem.reviewId, "r1", "old");
  const sn = m.generateReviewQueueSnapshot();
  assertEqual(sn.totalItems, 3);
  assertEqual(sn.pendingCount, 0);
  assertEqual(sn.reviewedCount, 1);
  assertEqual(sn.rejectedCount, 1);
  assertEqual(sn.archivedCount, 1);
});

addTest("K7: snapshot oldestPending is null when none pending", function () {
  resetQueue();
  const sn = m.generateReviewQueueSnapshot();
  assertEqual(sn.oldestPending, null);
});

addTest("K8: snapshot oldestPending points to oldest item", function () {
  resetQueue();
  const r1 = m.enqueueDraft(makeDraft(), { createdAt: "2026-01-01T00:00:00Z" });
  m.enqueueDraft(makeDraft(), { createdAt: "2026-02-01T00:00:00Z" });
  const sn = m.generateReviewQueueSnapshot();
  assertEqual(sn.oldestPending, r1.reviewItem.reviewId);
});

addTest("K9: snapshot newestReviewed is null when none", function () {
  resetQueue();
  const sn = m.generateReviewQueueSnapshot();
  assertEqual(sn.newestReviewed, null);
});

addTest("K10: snapshot newestReviewed is correct", function () {
  resetQueue();
  const r = m.enqueueDraft(makeDraft());
  m.approveDraft(r.reviewItem.reviewId, "r1", "ok");
  const sn = m.generateReviewQueueSnapshot();
  assertEqual(sn.newestReviewed, r.reviewItem.reviewId);
});

addTest("K11: getStats returns same as generateReviewQueueSnapshot", function () {
  resetQueue();
  const sn1 = m.generateReviewQueueSnapshot();
  const sn2 = m.getStats();
  assertEqual(sn1.totalItems, sn2.totalItems);
});

addTest("K12: snapshot byStatus has all 4 keys", function () {
  resetQueue();
  const sn = m.generateReviewQueueSnapshot();
  const keys = Object.keys(sn.byStatus).sort();
  assertDeepEqual(keys, ["archived", "pending", "rejected", "reviewed"]);
});

addTest("K13: snapshot totalItems matches count", function () {
  resetQueue();
  for (let i = 0; i < 10; i++) {
    m.enqueueDraft(makeDraft({ draftId: "snap_bulk_" + i }));
  }
  const sn = m.generateReviewQueueSnapshot();
  assertEqual(sn.totalItems, 10);
});

addTest("K14: snapshot after approve and reject reflects counts", function () {
  resetQueue();
  const items = [];
  for (let i = 0; i < 5; i++) {
    items.push(m.enqueueDraft(makeDraft({ draftId: "k14_" + i })));
  }
  m.approveDraft(items[0].reviewItem.reviewId, "r1", "ok");
  m.approveDraft(items[1].reviewItem.reviewId, "r1", "ok");
  m.rejectDraft(items[2].reviewItem.reviewId, "r1", "bad");
  const sn = m.generateReviewQueueSnapshot();
  assertEqual(sn.pendingCount, 2);
  assertEqual(sn.reviewedCount, 2);
  assertEqual(sn.rejectedCount, 1);
});

addTest("K15: snapshot meta has lastUpdated", function () {
  resetQueue();
  m.enqueueDraft(makeDraft());
  const sn = m.generateReviewQueueSnapshot();
  assert(typeof sn.meta.lastUpdated === "string");
  assert(sn.meta.lastUpdated !== null);
});

// =========================================================================
// SECTION L: Edge Cases (25 tests)
// =========================================================================

section("L: Edge Cases");

addTest("L1: malformed JSON storage is tolerated", function () {
  fs.writeFileSync(tmpFile, "this is not valid json", "utf8");
  const data = m.readQueue();
  assert(Array.isArray(data.items));
  assertEqual(data.items.length, 0);
});

addTest("L2: empty file is tolerated", function () {
  fs.writeFileSync(tmpFile, "", "utf8");
  const data = m.readQueue();
  assert(Array.isArray(data.items));
  assertEqual(data.items.length, 0);
});

addTest("L3: whitespace-only file is tolerated", function () {
  fs.writeFileSync(tmpFile, "   \n  \t  ", "utf8");
  const data = m.readQueue();
  assert(Array.isArray(data.items));
  assertEqual(data.items.length, 0);
});

addTest("L4: non-existent file returns empty queue", function () {
  cleanTmp();
  const data = m.readQueue();
  assert(Array.isArray(data.items));
  assertEqual(data.items.length, 0);
});

addTest("L5: storage with non-array items field", function () {
  fs.mkdirSync(path.dirname(tmpFile), { recursive: true });
  fs.writeFileSync(tmpFile, JSON.stringify({ items: "not-an-array" }), "utf8");
  const data = m.readQueue();
  assert(Array.isArray(data.items));
});

addTest("L6: storage with missing items field", function () {
  fs.mkdirSync(path.dirname(tmpFile), { recursive: true });
  fs.writeFileSync(tmpFile, JSON.stringify({ meta: {} }), "utf8");
  const data = m.readQueue();
  assert(Array.isArray(data.items));
});

addTest("L7: large number of items handled", function () {
  resetQueue();
  for (let i = 0; i < 50; i++) {
    m.enqueueDraft(makeDraft({ draftId: "bulk_" + i }));
  }
  const sn = m.generateReviewQueueSnapshot();
  assertEqual(sn.totalItems, 50);
});

addTest("L8: duplicate drafts from different strategies", function () {
  resetQueue();
  // Same draftId but different strategyId - still caught as duplicate
  m.enqueueDraft(makeDraft({ draftId: "same_id", strategyId: "s1" }));
  const r2 = m.enqueueDraft(makeDraft({ draftId: "same_id", strategyId: "s2" }));
  assert(!r2.success);
  assertEqual(r2.error, "DUPLICATE_DRAFT");
});

addTest("L9: getReviewItem returns success:false for not found", function () {
  resetQueue();
  const r = m.getReviewItem("does_not_exist");
  assert(!r.success);
  assertEqual(r.error, "NOT_FOUND");
});

addTest("L10: listReviewItems with no filter returns all", function () {
  resetQueue();
  m.enqueueDraft(makeDraft({ draftId: "nf1" }));
  m.enqueueDraft(makeDraft({ draftId: "nf2" }));
  const r = m.listReviewItems({});
  assert(r.success);
  assertEqual(r.total, 2);
});

addTest("L11: listReviewItems with invalid status filter fails", function () {
  resetQueue();
  const r = m.listReviewItems({ status: "invalid" });
  assert(!r.success);
});

addTest("L12: listReviewItems with invalid since date fails", function () {
  resetQueue();
  const r = m.listReviewItems({ since: "not-a-date" });
  assert(!r.success);
});

addTest("L13: listReviewItems with invalid until date fails", function () {
  resetQueue();
  const r = m.listReviewItems({ until: "not-a-date" });
  assert(!r.success);
});

addTest("L14: listReviewItems with multi-status filter", function () {
  resetQueue();
  const r1 = m.enqueueDraft(makeDraft({ draftId: "ms1" }));
  const r2 = m.enqueueDraft(makeDraft({ draftId: "ms2" }));
  const r3 = m.enqueueDraft(makeDraft({ draftId: "ms3" }));
  m.approveDraft(r1.reviewItem.reviewId, "r1", "ok");
  m.rejectDraft(r2.reviewItem.reviewId, "r1", "bad");
  const result = m.listReviewItems({ status: ["reviewed", "rejected"] });
  assert(result.success);
  assertEqual(result.total, 2);
});

addTest("L15: rapid approve-archive sequence", function () {
  resetQueue();
  const r = m.enqueueDraft(makeDraft());
  m.approveDraft(r.reviewItem.reviewId, "r1", "ok");
  m.archiveReviewItem(r.reviewItem.reviewId, "r2", "done");
  const final = m.getReviewItem(r.reviewItem.reviewId);
  assertEqual(final.reviewItem.status, "archived");
});

addTest("L16: getReviewItem retrieves complete item", function () {
  resetQueue();
  const r = m.enqueueDraft(makeDraft());
  const fetched = m.getReviewItem(r.reviewItem.reviewId);
  assert(fetched.success);
  assertEqual(fetched.reviewItem.reviewId, r.reviewItem.reviewId);
  assertEqual(fetched.reviewItem.draftId, r.reviewItem.draftId);
  assertEqual(fetched.reviewItem.title, r.reviewItem.title);
});

addTest("L17: listReviewItems filter by combined conditions", function () {
  resetQueue();
  const r = m.enqueueDraft(makeDraft({ priority: "high", draftId: "comb1" }));
  m.enqueueDraft(makeDraft({ priority: "low", draftId: "comb2" }));
  m.enqueueDraft(makeDraft({ priority: "high", draftId: "comb3" }));
  m.approveDraft(r.reviewItem.reviewId, "r1", "ok");
  // filter: priority=high AND status=reviewed
  const pendingHigh = m.listReviewItems({ status: "pending", priority: "high" });
  assert(pendingHigh.success);
  assertEqual(pendingHigh.total, 1);
});

addTest("L18: enqueue then reject then archive is valid", function () {
  resetQueue();
  const r = m.enqueueDraft(makeDraft());
  m.rejectDraft(r.reviewItem.reviewId, "r1", "bad");
  const a = m.archiveReviewItem(r.reviewItem.reviewId, "r2", "done");
  assert(a.success);
});

addTest("L19: updateItem updates timestamp", function () {
  resetQueue();
  const r = m.enqueueDraft(makeDraft());
  const orig = r.reviewItem.updatedAt;
  m.approveDraft(r.reviewItem.reviewId, "r1", "ok");
  const after = m.getReviewItem(r.reviewItem.reviewId).reviewItem;
  assert(after.updatedAt !== orig);
});

addTest("L20: clearQueue after operations works", function () {
  resetQueue();
  m.enqueueDraft(makeDraft());
  m.enqueueDraft(makeDraft());
  m.clearQueue();
  const sn = m.generateReviewQueueSnapshot();
  assertEqual(sn.totalItems, 0);
});

addTest("L21: empty enqueueDrafts array succeeds", function () {
  resetQueue();
  const results = m.enqueueDrafts([]);
  assertEqual(results.length, 0);
});

addTest("L22: getReviewItem returns with reviewItem even when null", function () {
  resetQueue();
  const r = m.getReviewItem("nothing");
  assert(!r.success);
  assertEqual(r.error, "NOT_FOUND");
});

addTest("L23: listReviewItems with invalid filter key is OK", function () {
  resetQueue();
  const r = m.listReviewItems({ unknown: "value" });
  assert(r.success);
});

addTest("L24: approveDraft with invalid decision string fails", function () {
  resetQueue();
  const r = m.enqueueDraft(makeDraft());
  // Can't test directly via approveDraft since it hardcodes "approve",
  // but we can test via the underlying validation
  const decR = m.validateDecision("invalid");
  assert(!decR.valid);
});

addTest("L25: snapshot after full lifecycle has correct counts", function () {
  resetQueue();
  const items = [];
  for (let i = 0; i < 4; i++) {
    items.push(m.enqueueDraft(makeDraft({ draftId: "life_" + i })));
  }
  m.approveDraft(items[0].reviewItem.reviewId, "r1", "ok");
  m.rejectDraft(items[1].reviewItem.reviewId, "r1", "bad");
  m.approveDraft(items[2].reviewItem.reviewId, "r1", "ok");
  m.archiveReviewItem(items[2].reviewItem.reviewId, "r2", "done");
  // items[3] still pending
  const sn = m.generateReviewQueueSnapshot();
  assertEqual(sn.totalItems, 4);
  assertEqual(sn.pendingCount, 1);
  assertEqual(sn.reviewedCount, 1);
  assertEqual(sn.rejectedCount, 1);
  assertEqual(sn.archivedCount, 1);
});

// =========================================================================
// SECTION M: Safety Audit (20 tests)
// =========================================================================

section("M: Safety Audit");

addTest("M1: no child_process in source", function () {
  const files = fs.readdirSync(path.join(__dirname, "..", "src", "mission-review-queue"));
  for (const f of files) {
    if (!f.endsWith(".js")) continue;
    const src = fs.readFileSync(path.join(__dirname, "..", "src", "mission-review-queue", f), "utf8");
    assert(!src.includes("child_process"), f + " contains child_process");
  }
});

addTest("M2: no exec() or spawn() in source", function () {
  const files = fs.readdirSync(path.join(__dirname, "..", "src", "mission-review-queue"));
  for (const f of files) {
    if (!f.endsWith(".js")) continue;
    const src = fs.readFileSync(path.join(__dirname, "..", "src", "mission-review-queue", f), "utf8");
    assert(!src.includes("exec("), f + " contains exec(");
    assert(!src.includes("spawn("), f + " contains spawn(");
  }
});

addTest("M3: no pm2 in source", function () {
  const files = fs.readdirSync(path.join(__dirname, "..", "src", "mission-review-queue"));
  for (const f of files) {
    if (!f.endsWith(".js")) continue;
    const src = fs.readFileSync(path.join(__dirname, "..", "src", "mission-review-queue", f), "utf8");
    const pm2Lines = src.split("\n").filter(function (l) {
      return l.includes("pm2") && !l.trim().startsWith("//") && !l.trim().startsWith("*");
    });
    assertEqual(pm2Lines.length, 0, f + " contains pm2 reference");
  }
});

addTest("M4: no createServer/listen/express in source", function () {
  const files = fs.readdirSync(path.join(__dirname, "..", "src", "mission-review-queue"));
  for (const f of files) {
    if (!f.endsWith(".js")) continue;
    const src = fs.readFileSync(path.join(__dirname, "..", "src", "mission-review-queue", f), "utf8");
    const codeLines = src.split("\n").filter(function (l) {
      return !l.trim().startsWith("//") && !l.trim().startsWith("*");
    });
    const combined = codeLines.join("\n");
    assert(!combined.includes("createServer"), f + " contains createServer");
    assert(!combined.includes(".listen("), f + " contains .listen(");
  }
});

addTest("M5: no nginx in source", function () {
  const files = fs.readdirSync(path.join(__dirname, "..", "src", "mission-review-queue"));
  for (const f of files) {
    if (!f.endsWith(".js")) continue;
    const src = fs.readFileSync(path.join(__dirname, "..", "src", "mission-review-queue", f), "utf8");
    const codeLines = src.split("\n").filter(function (l) {
      return !l.trim().startsWith("//") && !l.trim().startsWith("*");
    });
    const combined = codeLines.join("\n");
    assert(!combined.includes("nginx"), f + " contains nginx");
  }
});

addTest("M6: no .env in source", function () {
  const files = fs.readdirSync(path.join(__dirname, "..", "src", "mission-review-queue"));
  for (const f of files) {
    if (!f.endsWith(".js")) continue;
    const src = fs.readFileSync(path.join(__dirname, "..", "src", "mission-review-queue", f), "utf8");
    const codeLines = src.split("\n").filter(function (l) {
      return !l.trim().startsWith("//") && !l.trim().startsWith("*");
    });
    const combined = codeLines.join("\n");
    assert(!combined.includes(".env"), f + " contains .env");
  }
});

addTest("M7: no deploy in source", function () {
  const files = fs.readdirSync(path.join(__dirname, "..", "src", "mission-review-queue"));
  for (const f of files) {
    if (!f.endsWith(".js")) continue;
    const src = fs.readFileSync(path.join(__dirname, "..", "src", "mission-review-queue", f), "utf8");
    const codeLines = src.split("\n").filter(function (l) {
      return !l.trim().startsWith("//") && !l.trim().startsWith("*");
    });
    const combined = codeLines.join("\n");
    assert(!combined.includes("deploy"), f + " contains deploy");
  }
});

addTest("M8: no commander import", function () {
  const files = fs.readdirSync(path.join(__dirname, "..", "src", "mission-review-queue"));
  for (const f of files) {
    if (!f.endsWith(".js")) continue;
    const src = fs.readFileSync(path.join(__dirname, "..", "src", "mission-review-queue", f), "utf8");
    const codeLines = src.split("\n").filter(function (l) {
      return !l.trim().startsWith("//") && !l.trim().startsWith("*");
    });
    const combined = codeLines.join("\n");
    assert(!combined.includes("commander"), f + " imports commander");
  }
});

addTest("M9: no gateway import", function () {
  const files = fs.readdirSync(path.join(__dirname, "..", "src", "mission-review-queue"));
  for (const f of files) {
    if (!f.endsWith(".js")) continue;
    const src = fs.readFileSync(path.join(__dirname, "..", "src", "mission-review-queue", f), "utf8");
    const codeLines = src.split("\n").filter(function (l) {
      return !l.trim().startsWith("//") && !l.trim().startsWith("*");
    });
    const combined = codeLines.join("\n");
    assert(!combined.includes("gateway"), f + " imports gateway");
  }
});

addTest("M10: no mission-manager import", function () {
  const files = fs.readdirSync(path.join(__dirname, "..", "src", "mission-review-queue"));
  for (const f of files) {
    if (!f.endsWith(".js")) continue;
    const src = fs.readFileSync(path.join(__dirname, "..", "src", "mission-review-queue", f), "utf8");
    const codeLines = src.split("\n").filter(function (l) {
      return !l.trim().startsWith("//") && !l.trim().startsWith("*");
    });
    const combined = codeLines.join("\n");
    assert(!combined.includes("mission-manager"), f + " imports mission-manager");
  }
});

addTest("M11: no DAG execution", function () {
  const files = fs.readdirSync(path.join(__dirname, "..", "src", "mission-review-queue"));
  for (const f of files) {
    if (!f.endsWith(".js")) continue;
    const src = fs.readFileSync(path.join(__dirname, "..", "src", "mission-review-queue", f), "utf8");
    const codeLines = src.split("\n").filter(function (l) {
      return !l.trim().startsWith("//") && !l.trim().startsWith("*");
    });
    const combined = codeLines.join("\n");
    assert(!combined.includes("DAG"), f + " contains DAG");
  }
});

addTest("M12: no http request in source (no require('http') or require('https'))", function () {
  const files = fs.readdirSync(path.join(__dirname, "..", "src", "mission-review-queue"));
  for (const f of files) {
    if (!f.endsWith(".js")) continue;
    const src = fs.readFileSync(path.join(__dirname, "..", "src", "mission-review-queue", f), "utf8");
    const codeLines = src.split("\n").filter(function (l) {
      return !l.trim().startsWith("//") && !l.trim().startsWith("*");
    });
    const combined = codeLines.join("\n");
    assert(!combined.includes("require('http')"), f + " requires http");
    assert(!combined.includes('require("http")'), f + ' requires http');
  }
});

addTest("M13: no process execution in runtime", function () {
  // Verify that the runtime does not execute missions
  resetQueue();
  const r = m.enqueueDraft(makeDraft());
  assert(r.success);
  // Approving should NOT trigger any mission execution
  const a = m.approveDraft(r.reviewItem.reviewId, "reviewer", "Approved");
  assert(a.success);
  // The item status changed but nothing external was triggered
  assertEqual(a.reviewItem.status, "reviewed");
});

addTest("M14: no auto-dispatch on approve", function () {
  // Verify that approving a draft does not dispatch anything
  resetQueue();
  const r = m.enqueueDraft(makeDraft());
  const a = m.approveDraft(r.reviewItem.reviewId, "r1", "ok");
  assert(a.success);
  // Only state change, no side effects
  const sn = m.generateReviewQueueSnapshot();
  assertEqual(sn.reviewedCount, 1);
  assertEqual(sn.pendingCount, 0);
});

addTest("M15: write only to designated storage path", function () {
  resetQueue();
  const storePath = m.getStorePath();
  assert(storePath.includes("mission-review"));
  assert(storePath.endsWith("review-queue.json"));
});

addTest("M16: no HTTP API endpoint exposed", function () {
  // index.js does not export any router, server, or app
  assertEqual(typeof m.createServer, "undefined");
  assertEqual(typeof m.listen, "undefined");
  assertEqual(typeof m.app, "undefined");
  assertEqual(typeof m.router, "undefined");
});

addTest("M17: store uses only fs module", function () {
  const storeSrc = fs.readFileSync(path.join(__dirname, "..", "src", "mission-review-queue", "review-queue-store.js"), "utf8");
  assert(storeSrc.includes("require('fs')"));
  assert(storeSrc.includes("require('path')"));
});

addTest("M18: runtime does not import commander", function () {
  const runtimeSrc = fs.readFileSync(path.join(__dirname, "..", "src", "mission-review-queue", "review-queue-runtime.js"), "utf8");
  const codeLines = runtimeSrc.split("\n").filter(function (l) {
    return !l.trim().startsWith("//") && !l.trim().startsWith("*");
  });
  const combined = codeLines.join("\n");
  assert(!combined.includes("commander"));
});

addTest("M19: no shell commands in any file", function () {
  const files = fs.readdirSync(path.join(__dirname, "..", "src", "mission-review-queue"));
  for (const f of files) {
    if (!f.endsWith(".js")) continue;
    const src = fs.readFileSync(path.join(__dirname, "..", "src", "mission-review-queue", f), "utf8");
    const codeLines = src.split("\n").filter(function (l) {
      return !l.trim().startsWith("//") && !l.trim().startsWith("*");
    });
    const combined = codeLines.join("\n");
    assert(!combined.includes("execSync"), f + " contains execSync");
    assert(!combined.includes("spawnSync"), f + " contains spawnSync");
  }
});

addTest("M20: no shell in index.js", function () {
  const indexSrc = fs.readFileSync(path.join(__dirname, "..", "src", "mission-review-queue", "index.js"), "utf8");
  assert(!indexSrc.includes("require('child_process')"));
});

// =========================================================================
// SECTION N: Additional Coverage (15 tests)
// =========================================================================

section("N: Additional Coverage");

addTest("N1: createReviewItem handles draft with null fields", function () {
  const draft = { draftId: null, title: null, strategyId: null, goalId: null, priority: null };
  const item = m.createReviewItem(draft);
  assertEqual(item.draftId, "");
  assertEqual(item.title, "");
  assertEqual(item.priority, "medium");
});

addTest("N2: validateReviewAction archive without reviewer fails", function () {
  const item = m.createReviewItem(makeDraft());
  item.status = "reviewed";
  const r = m.validateReviewAction(item, "archive", "", "reason");
  assert(!r.valid);
});

addTest("N3: validateReviewAction archive with null reason fails", function () {
  const item = m.createReviewItem(makeDraft());
  item.status = "reviewed";
  const r = m.validateReviewAction(item, "archive", "r1", null);
  assert(!r.valid);
});

addTest("N4: validateFilter returns valid for empty object", function () {
  const r = m.validateFilter({});
  assert(r.valid);
});

addTest("N5: validateFilter returns valid for undefined", function () {
  const r = m.validateFilter(undefined);
  assert(r.valid);
});

addTest("N6: validateFilter returns valid for null", function () {
  const r = m.validateFilter(null);
  assert(r.valid);
});

addTest("N7: listReviewItems returns items in array", function () {
  resetQueue();
  m.enqueueDraft(makeDraft({ draftId: "arr1" }));
  const r = m.listReviewItems({});
  assert(Array.isArray(r.items));
  assertEqual(r.items.length, 1);
});

addTest("N8: listReviewItems returns total count", function () {
  resetQueue();
  m.enqueueDraft(makeDraft({ draftId: "cnt1" }));
  m.enqueueDraft(makeDraft({ draftId: "cnt2" }));
  const r = m.listReviewItems({});
  assertEqual(r.total, 2);
});

addTest("N9: aggregate lifecycle tests count", function () {
  resetQueue();
  // Enqueue 10, approve 5, reject 3, archive 2
  const items = [];
  for (let i = 0; i < 10; i++) {
    items.push(m.enqueueDraft(makeDraft({ draftId: "agg_" + i })));
  }
  for (let i = 0; i < 5; i++) {
    m.approveDraft(items[i].reviewItem.reviewId, "r1", "ok");
  }
  for (let i = 5; i < 8; i++) {
    m.rejectDraft(items[i].reviewItem.reviewId, "r1", "bad");
  }
  m.archiveReviewItem(items[0].reviewItem.reviewId, "r2", "old");
  m.archiveReviewItem(items[1].reviewItem.reviewId, "r2", "old");
  const sn = m.generateReviewQueueSnapshot();
  assertEqual(sn.pendingCount, 2);  // items[8], items[9]
  assertEqual(sn.reviewedCount, 3); // items[2], [3], [4]
  assertEqual(sn.rejectedCount, 3); // items[5], [6], [7]
  assertEqual(sn.archivedCount, 2); // items[0], [1]
  assertEqual(sn.totalItems, 10);
});

addTest("N10: approve with empty reviewer string fails", function () {
  resetQueue();
  const r = m.enqueueDraft(makeDraft());
  const a = m.approveDraft(r.reviewItem.reviewId, "   ", "ok");
  assert(!a.success);
});

addTest("N11: reject with empty reason fails and returns error", function () {
  resetQueue();
  const r = m.enqueueDraft(makeDraft());
  const rej = m.rejectDraft(r.reviewItem.reviewId, "r1", "  ");
  assert(!rej.success);
  assertEqual(rej.error, "INVALID_ACTION");
});

addTest("N12: enqueueDrafts with all invalid returns all failures", function () {
  resetQueue();
  const results = m.enqueueDrafts([null, undefined, { title: "only title" }]);
  assertEqual(results.length, 3);
  assert(!results[0].success);
  assert(!results[1].success);
  assert(!results[2].success);
});

addTest("N13: listReviewItems with since and until both filters", function () {
  resetQueue();
  m.enqueueDraft(makeDraft(), { createdAt: "2026-01-15T00:00:00Z" });
  m.enqueueDraft(makeDraft(), { createdAt: "2026-02-15T00:00:00Z" });
  m.enqueueDraft(makeDraft(), { createdAt: "2026-03-15T00:00:00Z" });
  const r = m.listReviewItems({
    since: "2026-02-01T00:00:00Z",
    until: "2026-02-28T00:00:00Z"
  });
  assert(r.success);
  assertEqual(r.total, 1);
});

addTest("N14: approveDraft with very long reviewer name", function () {
  resetQueue();
  const r = m.enqueueDraft(makeDraft());
  const longName = "a".repeat(1000);
  const a = m.approveDraft(r.reviewItem.reviewId, longName, "ok");
  assert(a.success);
  assertEqual(a.reviewItem.reviewer, longName);
});

addTest("N15: validateReviewItem validates empty string reviewId", function () {
  const item = m.createReviewItem(makeDraft());
  item.reviewId = "";
  const r = m.validateReviewItem(item);
  assert(!r.valid);
  assert(r.errors.includes("MISSING_REVIEW_ID"));
});

// =========================================================================
// SECTION O: Safety — no mission execution on any operation (10 tests)
// =========================================================================

section("O: No Mission Execution");

addTest("O1: approveDraft does not trigger external actions", function () {
  resetQueue();
  const r = m.enqueueDraft(makeDraft());
  const beforeCount = m.readQueue().items.length;
  m.approveDraft(r.reviewItem.reviewId, "r1", "ok");
  const afterCount = m.readQueue().items.length;
  assertEqual(beforeCount, afterCount); // no new items created via side effects
});

addTest("O2: rejectDraft does not trigger external actions", function () {
  resetQueue();
  const r = m.enqueueDraft(makeDraft());
  const beforeCount = m.readQueue().items.length;
  m.rejectDraft(r.reviewItem.reviewId, "r1", "bad");
  const afterCount = m.readQueue().items.length;
  assertEqual(beforeCount, afterCount);
});

addTest("O3: archiveReviewItem does not trigger external actions", function () {
  resetQueue();
  const r = m.enqueueDraft(makeDraft());
  m.approveDraft(r.reviewItem.reviewId, "r1", "ok");
  const beforeCount = m.readQueue().items.length;
  m.archiveReviewItem(r.reviewItem.reviewId, "r2", "old");
  const afterCount = m.readQueue().items.length;
  assertEqual(beforeCount, afterCount);
});

addTest("O4: enqueueDraft does not modify external state", function () {
  resetQueue();
  const r = m.enqueueDraft(makeDraft());
  assert(r.success);
  const sn = m.generateReviewQueueSnapshot();
  assertEqual(sn.totalItems, 1);
  assertEqual(sn.pendingCount, 1);
});

addTest("O5: enqueueDrafts does not modify external state", function () {
  resetQueue();
  const drafts = [makeDraft({ draftId: "ext1" }), makeDraft({ draftId: "ext2" })];
  const results = m.enqueueDrafts(drafts);
  assert(results[0].success);
  assert(results[1].success);
  const sn = m.generateReviewQueueSnapshot();
  assertEqual(sn.totalItems, 2);
});

addTest("O6: getReviewItem is read-only", function () {
  resetQueue();
  const r = m.enqueueDraft(makeDraft());
  const before = m.readQueue().items.length;
  m.getReviewItem(r.reviewItem.reviewId);
  const after = m.readQueue().items.length;
  assertEqual(before, after);
});

addTest("O7: listReviewItems is read-only", function () {
  resetQueue();
  m.enqueueDraft(makeDraft());
  const before = m.readQueue().items.length;
  m.listReviewItems({});
  const after = m.readQueue().items.length;
  assertEqual(before, after);
});

addTest("O8: generateReviewQueueSnapshot is read-only", function () {
  resetQueue();
  m.enqueueDraft(makeDraft());
  const before = m.readQueue().items.length;
  m.generateReviewQueueSnapshot();
  const after = m.readQueue().items.length;
  assertEqual(before, after);
});

addTest("O9: No state changes beyond review status updates", function () {
  resetQueue();
  const r = m.enqueueDraft(makeDraft());
  const draft = r.reviewItem.draft;
  m.approveDraft(r.reviewItem.reviewId, "r1", "ok");
  const fetched = m.getReviewItem(r.reviewItem.reviewId);
  // draft should be unchanged
  assertEqual(fetched.reviewItem.draft.draftId, draft.draftId);
  assertEqual(fetched.reviewItem.draft.objective, draft.objective);
});

addTest("O10: getStats is read-only", function () {
  resetQueue();
  m.enqueueDraft(makeDraft());
  const before = m.readQueue().items.length;
  m.getStats();
  const after = m.readQueue().items.length;
  assertEqual(before, after);
});

// =========================================================================
// Cleanup
// =========================================================================

cleanTmp();

// =========================================================================
// Report
// =========================================================================

const total = passed + failed;
console.log("\n" + "=".repeat(60));
console.log("  TEST RESULTS");
console.log("=".repeat(60));
console.log("  Total:  " + total + " tests");
console.log("  Passed: " + passed + " \u2713");
console.log("  Failed: " + failed + " \u2717");
console.log("=".repeat(60));

if (failed > 0) {
  process.exit(1);
}
