'use strict';

/**
 * deepseek-agent.js - DeepSeek Code Review Agent
 *
 * Mirrors codex-agent / workbuddy-agent export pattern:
 * - Default: plan-only mode (returns review plan, zero side effects)
 * - confirm:review: calls DeepSeek API for real review
 * - No API key: degrades to local rule review
 * - Read-only: only fetches PR diff, no writes
 *
 * Security:
 * - All GitHub access via github-pr-reader.js (read-only)
 * - No merge, no deploy, no code writing
 * - Output sanitization handled by agent-dispatcher (sanitizeOutput)
 */

const { getPRInfo, getPRDiff, getPRFiles, getPROverview } = require('./github-pr-reader');
const { updateTask } = require('../orchestrator/v2/task-store');

var REVIEW_KEYWORD = 'confirm:review';
var DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
var DEEPSEEK_API_URL = process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com';
var DEEPSEEK_MODEL = process.env.DEEPSEEK_REVIEW_MODEL || 'deepseek-chat';

var REVIEW_PROMPT = [
  'You are a senior code reviewer.',
  'Review the following PR diff for:',
  '1. Security issues (injection, XSS, insecure dependencies)',
  '2. Code quality (readability, maintainability, duplication)',
  '3. Consistency with project conventions',
  '4. Potential bugs or edge cases',
  '5. Performance concerns',
  '',
  'Output format:',
  '- use Chinese for comments',
  '- categorize findings as: [严重], [警告], [建议]',
  '- be specific with file:line references',
  '- if no issues found, say "✅ 未发现明显问题"',
].join('\n');

function isReviewRequest(content) {
  if (!content || typeof content !== 'string') return false;
  return content.toLowerCase().indexOf(REVIEW_KEYWORD.toLowerCase()) !== -1;
}

function stripConfirmKeyword(content) {
  if (!content) return content;
  var regex = new RegExp(REVIEW_KEYWORD, 'gi');
  return content.replace(regex, '').replace(/\s{2,}/g, ' ').trim();
}

function extractPRNumber(content) {
  if (!content || typeof content !== 'string') return null;
  var match = content.match(/PR\s*#?\s*(\d+)/i);
  if (match) return parseInt(match[1], 10);
  match = content.match(/#(\d+)/);
  if (match) return parseInt(match[1], 10);
  return null;
}

function generateReviewPlan(content) {
  var prNumber = extractPRNumber(content);
  var timestamp = new Date().toISOString();
  var sections = [
    '=== DeepSeek Review Plan ===',
    'Time: ' + timestamp,
    'Task: ' + content,
    '',
  ];
  if (prNumber) {
    sections.push('Target PR: #' + prNumber);
    sections.push('PR URL: https://github.com/haojia258/wecom-openclaw/pull/' + prNumber);
    sections.push('');
  }
  sections.push('Review Steps:');
  sections.push('1. Fetch PR metadata via GitHub API');
  sections.push('2. Fetch PR diff (read-only)');
  sections.push('3. Send diff to DeepSeek API for review');
  sections.push('4. Return structured review report');
  sections.push('');
  sections.push('Security Constraints:');
  sections.push('- Read-only: no merge, no deploy, no code writes');
  sections.push('- API key protected (degrades to local rules if missing)');
  sections.push('- Output sanitized (API keys redacted)');
  sections.push('');
  sections.push('To execute, append: ' + REVIEW_KEYWORD);
  return sections.join('\n');
}

function mockPlanOnly(content) {
  return {
    plan: [
      '[DeepSeek] Review Plan: "' + content + '"',
      '[DeepSeek] PR diff 获取就绪',
      '[DeepSeek] plan-only 模式: 仅返回审查计划，等待确认',
      '[DeepSeek] 添加 \'confirm:review\' 以执行审查',
    ].join('\n'),
    estimatedTime: '~1 分钟'
  };
}

function localRuleReview(prInfo, files) {
  var findings = [];
  var severity = [];

  if (!prInfo) {
    findings.push('[警告] 无法获取 PR 信息（可能需要 GITHUB_TOKEN）');
  } else {
    if (prInfo.changed_files > 20) {
      findings.push('[建议] PR 变更文件较多（' + prInfo.changed_files + ' 个），建议拆分');
    }
    if ((prInfo.additions || 0) + (prInfo.deletions || 0) > 500) {
      findings.push('[建议] PR 变更行数较大（+' + (prInfo.additions || 0) + '/-' + (prInfo.deletions || 0) + '），建议拆分');
    }
  }

  if (files && files.length > 0) {
    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      if (f.filename && f.filename.indexOf('.env') !== -1) {
        findings.push('[严重] 检测到 .env 文件变更: ' + f.filename);
        severity.push('critical');
      }
      if (f.filename && f.filename.indexOf('nginx') !== -1) {
        findings.push('[警告] 检测到 nginx 配置变更: ' + f.filename);
        severity.push('high');
      }
      if (f.patch && f.patch.indexOf('sudo') !== -1) {
        findings.push('[严重] 检测到 sudo 命令: ' + f.filename);
        severity.push('critical');
      }
      if (f.patch && f.patch.indexOf('API_KEY') !== -1) {
        findings.push('[警告] 检测到可能的 API Key 硬编码: ' + f.filename);
        severity.push('high');
      }
      if (f.patch && f.patch.indexOf('deploy') !== -1) {
        findings.push('[警告] 检测到 deploy 关键词: ' + f.filename);
        severity.push('medium');
      }
    }
  }

  if (findings.length === 0) {
    findings.push('✅ 本地规则审查未发现明显问题');
  }

  return {
    source: 'local-rules',
    findings: findings,
    severity: severity,
  };
}

async function callDeepSeekAPI(prInfo, files, diff) {
  if (!DEEPSEEK_API_KEY) {
    return { degraded: true, result: localRuleReview(prInfo, files) };
  }

  var diffPreview = diff ? diff.substring(0, 8000) : '(no diff available)';
  var fileList = files ? files.map(function(f) { return '- ' + f.filename + ' (' + f.status + ')'; }).join('\n') : '(no file list)';

  return new Promise(function(resolve) {
    var https = require('https');
    var payload = JSON.stringify({
      model: DEEPSEEK_MODEL,
      messages: [
        { role: 'system', content: REVIEW_PROMPT },
        { role: 'user', content: 'PR Info:\n' + JSON.stringify(prInfo, null, 2) + '\n\nFiles:\n' + fileList + '\n\nDiff preview:\n```\n' + diffPreview + '\n```' }
      ],
      temperature: 0.3,
      max_tokens: 2000,
    });

    var options = {
      hostname: 'api.deepseek.com',
      path: '/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + DEEPSEEK_API_KEY,
        'Content-Length': Buffer.byteLength(payload),
      },
      timeout: 30000,
    };

    var req = https.request(options, function(res) {
      var data = '';
      res.on('data', function(chunk) { data += chunk; });
      res.on('end', function() {
        try {
          var parsed = JSON.parse(data);
          if (parsed.choices && parsed.choices[0] && parsed.choices[0].message) {
            resolve({ degraded: false, review: parsed.choices[0].message.content });
          } else {
            resolve({ degraded: true, result: localRuleReview(prInfo, files), apiError: data.substring(0, 200) });
          }
        } catch (e) {
          resolve({ degraded: true, result: localRuleReview(prInfo, files), apiError: e.message });
        }
      });
    });

    req.on('error', function(err) {
      resolve({ degraded: true, result: localRuleReview(prInfo, files), apiError: err.message });
    });

    req.on('timeout', function() {
      req.destroy();
      resolve({ degraded: true, result: localRuleReview(prInfo, files), apiError: 'timeout' });
    });

    req.write(payload);
    req.end();
  });
}

async function execute(params) {
  var content = params.content;
  var taskId = params.taskId;
  var reviewContent = stripConfirmKeyword(content || '');
  var prNumber = extractPRNumber(reviewContent || content);

  if (isReviewRequest(content) && prNumber) {
    var prInfo = null;
    var files = [];
    var diff = '';
    var errors = [];

    try { var r1 = await getPRInfo(prNumber); prInfo = r1; } catch (e) { errors.push('getPRInfo: ' + e.message); }
    try { var r2 = await getPRFiles(prNumber); files = r2; } catch (e) { errors.push('getPRFiles: ' + e.message); }
    try { var r3 = await getPRDiff(prNumber); diff = r3.diff || ''; } catch (e) { errors.push('getPRDiff: ' + e.message); }

    var reviewResult = await callDeepSeekAPI(prInfo, files, diff);

    var reportSections = [];
    reportSections.push('=== DeepSeek Review Report ===');
    reportSections.push('Task ID: ' + taskId);
    reportSections.push('Time: ' + new Date().toISOString());
    reportSections.push('PR: #' + prNumber);
    if (prInfo) {
      reportSections.push('Title: ' + prInfo.title);
      reportSections.push('State: ' + prInfo.state);
      reportSections.push('Changed files: ' + prInfo.changed_files);
    }
    reportSections.push('');

    if (reviewResult.degraded) {
      reportSections.push('--- Mode: Local Rule Review (DeepSeek API unavailable) ---');
      if (reviewResult.apiError) {
        reportSections.push('[API Error: ' + reviewResult.apiError + ']');
        reportSections.push('');
      }
      var local = reviewResult.result;
      if (local.findings) {
        for (var i = 0; i < local.findings.length; i++) {
          reportSections.push(local.findings[i]);
        }
      }
    } else {
      reportSections.push('--- DeepSeek AI Review ---');
      reportSections.push(reviewResult.review || '（无审查输出）');
    }

    if (errors.length > 0) {
      reportSections.push('');
      reportSections.push('--- Errors ---');
      for (var e = 0; e < errors.length; e++) {
        reportSections.push(errors[e]);
      }
    }

    reportSections.push('');
    reportSections.push('=== Summary ===');
    reportSections.push('PR: #' + prNumber);
    reportSections.push('Source: ' + (reviewResult.degraded ? 'Local Rules (degraded)' : 'DeepSeek AI'));
    reportSections.push('Files reviewed: ' + (files ? files.length : 0));

    var report = reportSections.join('\n');

    try {
      updateTask(taskId, {
        status: 'completed',
        result: JSON.stringify({ report: report, prNumber: prNumber, degraded: reviewResult.degraded }),
      });
    } catch (_) {}

    return {
      success: true,
      task_id: taskId,
      result: {
        plan: report,
        estimatedTime: 'N/A',
        mode: 'review-executed',
      },
    };
  } else {
    var plan = generateReviewPlan(content);
    return {
      success: true,
      task_id: taskId,
      result: {
        plan: plan,
        estimatedTime: '~1 分钟',
        mode: 'plan-only',
      },
    };
  }
}

module.exports = {
  execute: execute,
  isReviewRequest: isReviewRequest,
  stripConfirmKeyword: stripConfirmKeyword,
  generateReviewPlan: generateReviewPlan,
  mockPlanOnly: mockPlanOnly,
  REVIEW_KEYWORD: REVIEW_KEYWORD,
  extractPRNumber: extractPRNumber,
  localRuleReview: localRuleReview,
};
