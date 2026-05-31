'use strict';

/**
 * workbuddy-worker.js — WorkBuddy Runtime Worker
 *
 * WorkBuddy 使用 DeepSeek V4 Pro API，侧重 ops/test/deploy 审计。
 * 使用 provider-worker.js 统一 HTTP Client。
 *
 * REVIEW_ONLY__NO_AUTO_APPLY — 产物仅供审查。
 */

var providerWorker = require('./provider-worker');

var WORKBUDDY_HOST = process.env.WORKBUDDY_BASE_URL || 'https://api.deepseek.com';
var WORKBUDDY_MODEL = process.env.WORKBUDDY_MODEL || process.env.DEEPSEEK_MODEL || 'deepseek-chat';
var WORKBUDDY_PROVIDER = 'workbuddy';
var WORKER_ID = 'workbuddy-runtime';

/**
 * 执行 WorkBuddy Worker 任务
 * @param {object} task - { taskId, description, assignee, ... }
 * @returns {Promise<object>} { ok, workerId, provider, model, latencyMs, outputText, safetyNote, error }
 */
async function executeWorkBuddyWorker(task) {
  var t0 = Date.now();

  var systemPrompt = [
    'You are WorkBuddy, an AI operations & testing assistant.',
    'Your role: review code, run tests, validate deployments, audit changes.',
    'Rules:',
    '- NEVER execute deploy, merge, or production write operations',
    '- Always flag security concerns (.env, secrets, nginx)',
    '- Output structured review with pass/fail/risk assessment',
    '- Mark all output as REVIEW_ONLY',
    '',
    'Task: ' + (task.description || task.userRequest || task.taskId),
  ].join('\n');

  try {
    var result = await providerWorker.callChatCompletions({
      provider: WORKBUDDY_PROVIDER,
      host: WORKBUDDY_HOST,
      model: WORKBUDDY_MODEL,
      apiKey: process.env.DEEPSEEK_API_KEY,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: task.description || task.userRequest || 'Review this task for safety and quality.' },
      ],
      maxTokens: 2048,
      temperature: 0.3,
      timeoutMs: 120000,
    });

    if (result.error) {
      return {
        ok: false,
        workerId: WORKER_ID,
        provider: WORKBUDDY_PROVIDER,
        model: WORKBUDDY_MODEL,
        latencyMs: Date.now() - t0,
        outputText: null,
        safetyNote: 'REVIEW_ONLY__NO_AUTO_APPLY',
        error: result.error,
      };
    }

    return {
      ok: true,
      workerId: WORKER_ID,
      provider: WORKBUDDY_PROVIDER,
      model: result.model || WORKBUDDY_MODEL,
      latencyMs: result.latency || (Date.now() - t0),
      outputText: result.content || '',
      usage: result.usage || null,
      safetyNote: 'REVIEW_ONLY__NO_AUTO_APPLY',
      error: null,
    };
  } catch (e) {
    return {
      ok: false,
      workerId: WORKER_ID,
      provider: WORKBUDDY_PROVIDER,
      model: WORKBUDDY_MODEL,
      latencyMs: Date.now() - t0,
      outputText: null,
      safetyNote: 'REVIEW_ONLY__NO_AUTO_APPLY',
      error: e.message,
    };
  }
}

module.exports = {
  executeWorkBuddyWorker: executeWorkBuddyWorker,
  WORKBUDDY_MODEL: WORKBUDDY_MODEL,
  WORKBUDDY_HOST: WORKBUDDY_HOST,
};
