/**
 * index.js
 * P9.5.4 Mission Draft Review Queue — Barrel export.
 *
 * Exports all public API symbols:
 *   - types: REVIEW_STATUS, REVIEW_DECISION, ALLOWED_TRANSITIONS, PRIORITY_LEVELS, createReviewId, createReviewItem, isValidTransition, isTerminalStatus
 *   - validator: VALIDATION_ERRORS, validateReviewItem, validateDraftForEnqueue, validateDecision, validateStatus, validatePriority, validateReviewAction, validateFilter
 *   - store: setStorePath, getStorePath, readQueue, clearQueue
 *   - runtime: enqueueDraft, enqueueDrafts, getReviewItem, listReviewItems, approveDraft, rejectDraft, archiveReviewItem, generateReviewQueueSnapshot, getStats
 */

var types = require('./review-queue-types');
var validator = require('./review-queue-validator');
var store = require('./review-queue-store');
var runtime = require('./review-queue-runtime');

var index = {
  // --- Types ---
  REVIEW_STATUS: types.REVIEW_STATUS,
  REVIEW_STATUS_VALUES: types.REVIEW_STATUS_VALUES,
  REVIEW_DECISION: types.REVIEW_DECISION,
  REVIEW_DECISION_VALUES: types.REVIEW_DECISION_VALUES,
  ALLOWED_TRANSITIONS: types.ALLOWED_TRANSITIONS,
  DECISION_TO_STATUS: types.DECISION_TO_STATUS,
  PRIORITY_LEVELS: types.PRIORITY_LEVELS,
  createReviewId: types.createReviewId,
  createDraftId: types.createDraftId,
  createReviewItem: types.createReviewItem,
  isValidTransition: types.isValidTransition,
  isTerminalStatus: types.isTerminalStatus,

  // --- Validator ---
  VALIDATION_ERRORS: validator.VALIDATION_ERRORS,
  validateReviewItem: validator.validateReviewItem,
  validateDraftForEnqueue: validator.validateDraftForEnqueue,
  validateDecision: validator.validateDecision,
  validateStatus: validator.validateStatus,
  validatePriority: validator.validatePriority,
  validateReviewAction: validator.validateReviewAction,
  validateFilter: validator.validateFilter,

  // --- Store (testing / reset) ---
  setStorePath: store.setStorePath,
  getStorePath: store.getStorePath,
  readQueue: store.readQueue,
  clearQueue: runtime.clearQueue,

  // --- Runtime (primary API) ---
  enqueueDraft: runtime.enqueueDraft,
  enqueueDrafts: runtime.enqueueDrafts,
  getReviewItem: runtime.getReviewItem,
  listReviewItems: runtime.listReviewItems,
  approveDraft: runtime.approveDraft,
  rejectDraft: runtime.rejectDraft,
  archiveReviewItem: runtime.archiveReviewItem,
  generateReviewQueueSnapshot: runtime.generateReviewQueueSnapshot,
  getStats: runtime.getStats
};

module.exports = index;
