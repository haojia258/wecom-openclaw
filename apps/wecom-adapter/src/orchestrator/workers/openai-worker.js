'use strict';

/**
 * openai-worker.js — Phase2-A OpenAI/Codex 真实 Worker
 *
 * 使用 Node.js 内置 https 模块调用 OpenAI API (gpt-4o)
 * 不改变 Runtime Core，不自动 apply，不自动 merge
 *
 * 环境变量:
 *   OPENAI_API_KEY — OpenAI API Key (从 .env 读取)
 *
 * 安全约束:
 *   - 禁止打印/日志 API Key
 *   - 禁止将 key 写入 audit/artifact
 *   - 禁止将 prompt 原文写入日志 (只写 hash)
 */

const crypto = require('crypto');
const https = require('https');
const path = require('path');
const fs = require('fs');

// 延迟加载 dotenv (如果可用)
try {
  const dotenv = require('dotenv');
  dotenv.config({ path: path.join(__dirname, '..', '..', '..', '.env') });
} catch (e) {
  // dotenv 未安装，依赖外部已加载的环境变量
}

const DEFAULT_MODEL = 'gpt-4o';
const DEFAULT_TEMPERATURE = 0.7;
const DEFAULT_MAX_TOKENS = 4096;
const API_TIMEOUT_MS = 60 * 1000; // 60 秒超时
const API_VERSION = 'v1';
const API_HOST = 'api.openai.com';

/**
 * 计算字符串 hash (用于安全日志记录)
 * @param {string} text
 * @returns {string} sha256 hex 前 12 位
 */
function hashText(text) {
  if (!text) return 'none';
  return crypto.createHash('sha256').update(text).digest('hex').substring(0, 12);
}

/**
 * 调用 OpenAI Chat Completions API
 *
 * @param {object}  opts
 * @param {string}  opts.taskId        - 任务 ID
 * @param {string}  opts.prompt        - 用户提示词 (dispatch payload)
 * @param {string}  [opts.model]      - 模型 (默认 gpt-4o)
 * @param {number}  [opts.temperature] - 温度 (默认 0.7)
 * @param {number}  [opts.maxTokens]   - 最大 token (默认 4096)
 * @returns {Promise<object>} { taskId, assignee, model, promptHash, outputText, createdAt, safetyNote }
 */
function callOpenAI(opts) {
  const taskId = opts.taskId || 'unknown';
  const prompt = (opts.prompt || '').trim();
  const model = opts.model || DEFAULT_MODEL;
  const temperature = typeof opts.temperature === 'number' ? opts.temperature : DEFAULT_TEMPERATURE;
  const maxTokens = typeof opts.maxTokens === 'number' ? opts.maxTokens : DEFAULT_MAX_TOKENS;

  const promptHash = hashText(prompt);

  return new Promise(function (resolve, reject) {
    const apiKey = process.env.OPENAI_API_KEY;

    // 1. 检查 API Key
    if (!apiKey) {
      return reject(new Error('未配置 OPENAI_API_KEY，任务保持 dispatched 状态'));
    }

    // 2. 构建请求体
    const requestBody = JSON.stringify({
      model: model,
      messages: [
        { role: 'system', content: 'You are a helpful AI assistant specialized in software development and DevOps.' },
        { role: 'user', content: prompt },
      ],
      temperature: temperature,
      max_tokens: maxTokens,
    });

    // 3. 构建请求选项
    const options = {
      hostname: API_HOST,
      path: '/' + API_VERSION + '/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey,
        'Content-Length': Buffer.byteLength(requestBody),
      },
      timeout: API_TIMEOUT_MS,
    };

    // 4. 发起 HTTPS 请求
    const req = https.request(options, function (res) {
      let data = '';

      res.on('data', function (chunk) {
        data += chunk;
      });

      res.on('end', function () {
        try {
          const parsed = JSON.parse(data);

          // 4a. API 返回错误
          if (parsed.error) {
            return reject(new Error('OpenAI API 错误: ' + (parsed.error.message || '未知错误')));
          }

          // 4b. 提取输出文本
          const outputText = parsed.choices && parsed.choices[0] && parsed.choices[0].message
            ? parsed.choices[0].message.content
            : '';

          if (!outputText) {
            return reject(new Error('OpenAI API 返回空输出'));
          }

          // 4c. 构建产物
          const artifact = {
            taskId: taskId,
            assignee: 'codex',
            model: model,
            promptHash: promptHash,
            outputText: outputText,
            createdAt: new Date().toISOString(),
            safetyNote: 'REVIEW_ONLY__NO_AUTO_APPLY',
          };

          resolve(artifact);
        } catch (e) {
          reject(new Error('解析 OpenAI API 响应失败: ' + e.message));
        }
      });
    });

    req.on('error', function (e) {
      reject(new Error('OpenAI API 请求失败: ' + e.message));
    });

    req.on('timeout', function () {
      req.destroy();
      reject(new Error('OpenAI API 请求超时 (' + (API_TIMEOUT_MS / 1000) + 's)'));
    });

    req.write(requestBody);
    req.end();
  });
}

/**
 * 执行 OpenAI Worker
 *
 * @param {object} task - 任务对象 { taskId, userRequest, assignee, ... }
 * @returns {Promise<object>} artifact 或 { error, taskId }
 */
function executeOpenAIWorker(task) {
  const taskId = task.taskId || 'unknown';

  return callOpenAI({
    taskId: taskId,
    prompt: buildPrompt(task),
    model: getModelForTask(task),
  }).then(function (artifact) {
    return artifact;
  }).catch(function (e) {
    // 优雅错误处理：不泄露 key，返回错误摘要
    return {
      error: e.message,
      taskId: taskId,
      assignee: 'codex',
      model: getModelForTask(task),
      promptHash: hashText(buildPrompt(task)),
      outputText: '',
      createdAt: new Date().toISOString(),
      safetyNote: 'ERROR__NO_OUTPUT',
    };
  });
}

/**
 * 根据任务获取模型
 * @param {object} task
 * @returns {string}
 */
function getModelForTask(task) {
  // 可以从 task.model 读取，默认 gpt-4o
  return (task.model && task.model.indexOf('gpt') >= 0) ? task.model : DEFAULT_MODEL;
}

/**
 * 构建发送给 OpenAI 的 prompt
 * @param {object} task
 * @returns {string}
 */
function buildPrompt(task) {
  var lines = [];
  lines.push('=== AI Orchestrator Runtime v0.5 Task ===');
  lines.push('');
  lines.push('Task ID: ' + task.taskId);
  lines.push('Assignee: Codex (' + getModelForTask(task) + ')');
  lines.push('');

  if (task.userRequest) {
    lines.push('--- User Request ---');
    lines.push(task.userRequest);
    lines.push('');
  }

  // 附加 dispatch payload (如果有)
  if (task.dispatchPayload && task.dispatchPayload.instruction) {
    lines.push('--- Dispatch Instruction ---');
    lines.push(task.dispatchPayload.instruction.substring(0, 2000));
    lines.push('');
  }

  lines.push('--- Safety Rules ---');
  lines.push('1. REVIEW_ONLY: DO NOT auto-apply any patch.');
  lines.push('2. Output must be in markdown format.');
  lines.push('3. If generating code, include explanation.');
  lines.push('4. No credential or API key in output.');
  lines.push('');
  lines.push('Begin your response:');

  return lines.join('\n');
}

// ========== 导出 ==========
module.exports = {
  executeOpenAIWorker: executeOpenAIWorker,
  callOpenAI: callOpenAI,
  buildPrompt: buildPrompt,
  hashText: hashText,
};
