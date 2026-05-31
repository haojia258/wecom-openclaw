'use strict';

/**
 * /ai任务 - OpenClaw Enterprise OS Beta 1.0 任务管理
 *
 * 子命令:
 *   /ai任务 创建 <自然语言描述>     创建新任务并入队
 *   /ai任务 派发 <taskId>            派发任务给 AI Worker (WorkBuddy Runtime)
 *   /ai任务 状态 [taskId]            查看任务状态（不传 taskId 则显示列表摘要）
 *   /ai任务 列表 [N]                 列出最近 N 条任务（默认10）
 *   /ai任务 审查 <taskId>            接收产物并执行审查流水线
 *   /ai任务 批准 <taskId>            批准任务
 *   /ai任务 拒绝 <taskId>            拒绝任务
 *   /ai任务 回滚 <taskId>            规划回滚
 *   /ai任务 取消 <taskId>            取消任务（保留 artifact）
 *   /ai任务 关闭 <taskId>            关闭任务
 *   /ai任务 帮助                    显示帮助
 *
 * 别名: /aitask, /AI任务, /ai-task
 *
 * Beta 1.0: WorkBuddy Runtime 生产可用。REVIEW_ONLY / Gate Protected。
 */

const path = require('path');
const fs = require('fs');
const runtimeCore = require('../orchestrator/runtime-core');
const { listTasks, listAllTasks } = require('../orchestrator/task-queue');
const { readArtifact, listArtifacts, saveArtifact, getArtifactDir } = require('../orchestrator/artifact-store');
const { listAssignees } = require('../orchestrator/worker-dispatcher');

// 延迟加载 openai-worker (Phase2-A)
let openaiWorker = null;
try { openaiWorker = require('../orchestrator/workers/openai-worker'); } catch (e) { /* 可选依赖 */ }

// 延迟加载 deepseek-worker (P12.4)
let deepseekWorker = null;
try { deepseekWorker = require('../orchestrator/workers/deepseek-worker'); } catch (e) { /* 可选依赖 */ }

// 延迟加载 doubao-worker (P12.5)
let doubaoWorker = null;
try { doubaoWorker = require('../orchestrator/workers/doubao-worker'); } catch (e) { /* 可选依赖 */ }

// 延迟加载 workbuddy-worker (P12.4)
let workbuddyWorker = null;
try { workbuddyWorker = require('../orchestrator/workers/workbuddy-worker'); } catch (e) { /* 可选依赖 */ }
try { doubaoWorker = require('../orchestrator/workers/doubao-worker'); } catch (e) { /* 可选依赖 */ }

const desc = 'AI任务管理: 创建/派发/审查/批准任务';

const HELP_TEXT =
  '🤖 OpenClaw Enterprise OS Beta 1.0\n' +
  '\n' +
  '子命令:\n' +
  '  /ai任务 创建 <描述>       创建新任务\n' +
  '  /ai任务 派发 <taskId>     派发给 AI Worker\n' +
  '  /ai任务 状态 [taskId]     查看状态（不传=摘要）\n' +
  '  /ai任务 列表 [N]          最近 N 条（默认10）\n' +
  '  /ai任务 审查 <taskId>     接收产物 + 安全审查\n' +
  '  /ai任务 批准 <taskId>     批准执行\n' +
  '  /ai任务 拒绝 <taskId>     拒绝任务\n' +
  '  /ai任务 回滚 <taskId>     规划回滚\n' +
  '  /ai任务 取消 <taskId>     取消任务\n' +
  '  /ai任务 关闭 <taskId>     关闭任务\n' +
  '\n' +
  'AI Workers: Codex(gpt-4o) | WorkBuddy(claude) | DeepSeek | 豆包\n' +
  '状态流: 排队→规划→派发→接收产物→审查→批准/拒绝→关闭\n' +
  '\n' +
  '⚠️  Beta 1.0 — REVIEW_ONLY / Human Approval Required / Runtime Gate Protected';

/**
 * @param {object} ctx     - 上下文 { FromUserName, mock? }
 * @param {string} [args]  - 子命令及参数
 * @returns {string} 回复文本
 */
async function execute(ctx, args) {
  args = (args || '').trim();

  if (!args) {
    return handleSummary();
  }

  // 解析子命令和参数
  const parts = args.split(/\s+/);
  const subCmd = parts[0];
  const subArgs = parts.slice(1).join(' ');

  switch (subCmd) {
    case '创建':
    case 'create':
    case 'new':
    case 'c':
      return handleCreate(subArgs);

    case '派发':
    case 'dispatch':
    case 'd':
      return handleDispatch(subArgs);

    case '状态':
    case 'status':
    case 's':
      return handleStatus(subArgs);

    case '列表':
    case 'list':
    case 'l':
      return handleList(subArgs);

    case '审查':
    case 'review':
    case 'r':
      return handleReview(subArgs);

    case '批准':
    case 'approve':
    case 'yes':
      return handleApprove(subArgs);

    case '拒绝':
    case 'reject':
    case 'no':
      return handleReject(subArgs);

    case '回滚':
    case 'rollback':
    case 'rb':
      return handleRollback(subArgs);

    case '取消':
    case 'cancel':
      return handleCancel(subArgs);

    case '关闭':
    case 'close':
    case 'x':
      return handleClose(subArgs);

    case '帮助':
    case 'help':
    case 'h':
    case '?':
      return HELP_TEXT;

    default:
      // 可能是直接输入 taskId 或自然语言
      if (subCmd.match(/^task-[a-z0-9]+-[a-z0-9]+$/)) {
        // 看起来像 taskId → 查看状态
        return handleStatus(subCmd);
      }
      // 否则当作创建意图
      return handleCreate(args);
  }
}

// ────────────────────────────────────────────
// 创建任务
// ────────────────────────────────────────────
function handleCreate(userRequest) {
  if (!userRequest || userRequest.trim().length === 0) {
    return '❌ 请提供任务描述\n\n示例:\n  /ai任务 创建 生成运营分析报告\n  /ai任务 创建 修复投流ROI计算bug';
  }

  try {
    const result = runtimeCore.createRuntimeTask({ userRequest: userRequest.trim() });
    const task = result.task;

    const assigneeLabel = {
      codex: 'Codex (GPT-4o)',
      workbuddy: 'WorkBuddy (Claude)',
      deepseek: 'DeepSeek',
      doubao: '豆包 (Doubao-Pro)',
    };

    const lines = [
      '✅ 任务已创建',
      '',
      'Task ID: ' + task.taskId,
      '状态:    📥 排队中',
      '指派:    ' + (assigneeLabel[task.assignee] || task.assignee),
      '请求:    ' + task.userRequest,
      '',
      '📌 下一步: /ai任务 派发 ' + task.taskId,
    ];

    if (result.plan) {
      lines.push('');
      lines.push('📋 自动规划:');
      lines.push('  ' + (result.plan.summary || '已完成分解'));
    }

    return lines.join('\n');
  } catch (e) {
    return '❌ 创建任务失败: ' + e.message;
  }
}

// ────────────────────────────────────────────
// 派发任务
// ────────────────────────────────────────────
function handleDispatch(taskId) {
  // Dispatch is now handled asynchronously via handleDispatchAsync
  return handleDispatchAsync(taskId);
}

async function handleDispatchAsync(taskId) {
  if (!taskId) {
    return '❌ 请提供 taskId\n\n示例: /ai任务 派发 task-xxx';
  }

  try {
    // 1. 派发前先规划
    let task;
    try {
      const planned = runtimeCore.planTask(taskId);
      task = planned;
    } catch (e) {
      if (!e.message.includes('Cannot plan')) throw e;
    }

    // 2. 派发任务（状态 → dispatched）
    const result = runtimeCore.dispatchTask(taskId);
    task = result.task;

    // 3. 如果 assignee 是 codex，调用真实 OpenAI Worker
    if (task.assignee === 'codex' && openaiWorker) {
      try {
        const artifact = await openaiWorker.executeOpenAIWorker(task);

        if (artifact.error) {
          return [
            '🚀 任务已派发（Codex/OpenAI）',
            '',
            'Task ID:  ' + taskId,
            '⚠️ AI Worker 调用失败：' + artifact.error,
            '',
            '任务保持 dispatched 状态，可重试：/ai任务 派发 ' + taskId,
          ].join('\n');
        }

        // 4. 将产物直接写入 artifact 目录（bypass saveArtifact type 限制）
        var artifactDir = getArtifactDir(taskId);
        if (artifact.outputText) {
          fs.writeFileSync(path.join(artifactDir, 'output.txt'), artifact.outputText, 'utf-8');
        }
        if (artifact.model) {
          fs.writeFileSync(path.join(artifactDir, 'model.txt'), artifact.model, 'utf-8');
        }

        // 5. 接收产物（状态 → artifact_received → review_pending）
        runtimeCore.receiveArtifact(taskId, {
          review: artifact.outputText
            ? artifact.outputText.substring(0, 200) + '...'
            : 'AI Worker 已完成任务，等待审查',
          model: artifact.model,
          safetyNote: artifact.safetyNote || '',
        });

        return [
          '✅ 任务已派发（Codex/OpenAI 真实调用）',
          '',
          'Task ID:  ' + taskId,
          'Model:    ' + (artifact.model || 'gpt-4o'),
          '产物:    output.txt 已写入 artifact-store',
          '',
          '📌 下一步: /ai任务 审查 ' + taskId,
        ].join('\n');
      } catch (e) {
        return [
          '🚀 任务已派发（Codex/OpenAI）',
          '',
          'Task ID:  ' + taskId,
          '⚠️ AI Worker 异常：' + e.message,
          '',
          '任务保持 dispatched 状态，可重试：/ai任务 派发 ' + taskId,
        ].join('\n');
      }
    }

    // 3b. assignee 是 deepseek → 调用真实 DeepSeek Runtime (P12.4)
    if (task.assignee === 'deepseek' && deepseekWorker) {
      try {
        var deepseekArtifact = await deepseekWorker.executeDeepSeekWorker(task);

        if (deepseekArtifact.error) {
          return [
            '🚀 任务已派发（DeepSeek Runtime）',
            '',
            'Task ID:  ' + taskId,
            '⚠️ DeepSeek Worker 调用失败：' + deepseekArtifact.error,
            '',
            '任务保持 dispatched 状态，可重试：/ai任务 派发 ' + taskId,
          ].join('\n');
        }

        // 写入 artifact
        var artifactDir2 = getArtifactDir(taskId);
        if (deepseekArtifact.outputText) {
          fs.writeFileSync(path.join(artifactDir2, 'deepseek-output.md'), deepseekArtifact.outputText, 'utf-8');
        }
        // 写入 runtime-meta.json
        var runtimeMeta = {
          worker: 'deepseek',
          model: deepseekArtifact.model || 'deepseek-chat',
          latency_ms: deepseekArtifact.latency,
          usage: deepseekArtifact.usage || null,
          generated_at: new Date().toISOString(),
          safety_note: deepseekArtifact.safetyNote || 'REVIEW_ONLY__NO_AUTO_APPLY',
        };
        fs.writeFileSync(path.join(artifactDir2, 'runtime-meta.json'), JSON.stringify(runtimeMeta, null, 2), 'utf-8');

        // 接收产物 → 自动进入 review_pending
        runtimeCore.receiveArtifact(taskId, {
          review: deepseekArtifact.outputText
            ? deepseekArtifact.outputText.substring(0, 200) + '...'
            : 'DeepSeek Runtime 已完成任务，等待审查',
          model: deepseekArtifact.model || 'deepseek-chat',
          safetyNote: deepseekArtifact.safetyNote || 'REVIEW_ONLY__NO_AUTO_APPLY',
        });

        return [
          '✅ 任务已派发（DeepSeek Runtime）',
          '',
          'Task ID:  ' + taskId,
          'Model:    ' + (deepseekArtifact.model || 'deepseek-chat'),
          '延迟:     ' + (deepseekArtifact.latency || '?') + 'ms',
          '产物:    deepseek-output.md + runtime-meta.json',
          '',
          '📌 下一步: /ai任务 审查 ' + taskId,
        ].join('\n');
      } catch (e) {
        return [
          '🚀 任务已派发（DeepSeek Runtime）',
          '',
          'Task ID:  ' + taskId,
          '⚠️ DeepSeek Worker 异常：' + e.message,
          '',
          '任务保持 dispatched 状态，可重试：/ai任务 派发 ' + taskId,
        ].join('\n');
      }
    }

    // 3c. assignee 是 doubao → 调用真实 Doubao Runtime (P12.5)
    if (task.assignee === 'doubao' && doubaoWorker) {
      try {
        var doubaoArtifact = await doubaoWorker.executeDoubaoWorker(task);

        var artifactDir3 = getArtifactDir(taskId);

        // 生成 doubao-output.md
        var outputLines = [
          '# Doubao Runtime Output',
          '',
          '| Field      | Value                      |',
          '| ---------- | -------------------------- |',
          '| taskId     | ' + taskId + '             |',
          '| workerId   | doubao-runtime             |',
          '| provider   | doubao                     |',
          '| model      | ' + (doubaoArtifact.model || 'doubao-pro') + '     |',
          '| latencyMs  | ' + (doubaoArtifact.latencyMs || '?') + '     |',
          '| safetyNote | REVIEW_ONLY__NO_AUTO_APPLY |',
          '',
          '## Output',
          '',
          doubaoArtifact.outputText || '(no output)',
        ];
        fs.writeFileSync(path.join(artifactDir3, 'doubao-output.md'), outputLines.join('\n'), 'utf-8');

        // 生成 runtime-meta.json
        var doubaoMeta = {
          taskId: taskId,
          workerId: 'doubao-runtime',
          provider: 'doubao',
          model: doubaoArtifact.model || 'doubao-pro',
          latencyMs: doubaoArtifact.latencyMs,
          status: doubaoArtifact.ok ? 'success' : 'failed',
          safetyNote: 'REVIEW_ONLY__NO_AUTO_APPLY',
        };
        fs.writeFileSync(path.join(artifactDir3, 'runtime-meta.json'), JSON.stringify(doubaoMeta, null, 2), 'utf-8');

        if (doubaoArtifact.error || !doubaoArtifact.ok) {
          return [
            '🚀 任务已派发（Doubao Runtime）',
            '',
            'Task ID:  ' + taskId,
            '⚠️ Doubao Worker 失败：' + (doubaoArtifact.error || 'unknown'),
            '',
            '任务保持 dispatched 状态，可重试：/ai任务 派发 ' + taskId,
          ].join('\n');
        }

        runtimeCore.receiveArtifact(taskId, {
          review: doubaoArtifact.outputText
            ? doubaoArtifact.outputText.substring(0, 200) + '...'
            : 'Doubao Runtime 已完成任务，等待审查',
          model: doubaoArtifact.model || 'doubao-pro',
          safetyNote: 'REVIEW_ONLY__NO_AUTO_APPLY',
        });

        return [
          '✅ 任务已派发（Doubao Runtime）',
          '',
          'Task ID:  ' + taskId,
          'Model:    ' + (doubaoArtifact.model || 'doubao-pro'),
          '延迟:     ' + (doubaoArtifact.latencyMs || '?') + 'ms',
          '产物:    doubao-output.md + runtime-meta.json',
          '',
          '📌 下一步: /ai任务 审查 ' + taskId,
        ].join('\n');
      } catch (e) {
        return [
          '🚀 任务已派发（Doubao Runtime）',
          '',
          'Task ID:  ' + taskId,
          '⚠️ Doubao Worker 异常：' + e.message,
          '',
          '任务保持 dispatched 状态，可重试：/ai任务 派发 ' + taskId,
        ].join('\n');
      }
    }

    // 3d. assignee 是 workbuddy → 调用 WorkBuddy Runtime (P12.4)
    if (task.assignee === 'workbuddy' && workbuddyWorker) {
      try {
        var wbArtifact = await workbuddyWorker.executeWorkBuddyWorker(task);

        var artifactDir4 = getArtifactDir(taskId);

        if (wbArtifact.ok && wbArtifact.outputText) {
          fs.writeFileSync(path.join(artifactDir4, 'workbuddy-output.md'), wbArtifact.outputText, 'utf-8');
        }
        var wbMeta = {
          taskId: taskId, workerId: 'workbuddy-runtime', provider: 'workbuddy',
          model: wbArtifact.model || 'deepseek-chat', latencyMs: wbArtifact.latencyMs,
          status: wbArtifact.ok ? 'success' : 'failed',
          safetyNote: 'REVIEW_ONLY__NO_AUTO_APPLY',
        };
        fs.writeFileSync(path.join(artifactDir4, 'runtime-meta.json'), JSON.stringify(wbMeta, null, 2), 'utf-8');

        if (!wbArtifact.ok) {
          return [
            '🚀 任务已派发（WorkBuddy Runtime）',
            '',
            'Task ID:  ' + taskId,
            '⚠️ WorkBuddy Worker 失败：' + (wbArtifact.error || 'unknown'),
            '',
            '任务保持 dispatched 状态，可重试：/ai任务 派发 ' + taskId,
          ].join('\n');
        }

        runtimeCore.receiveArtifact(taskId, {
          review: (wbArtifact.outputText || '').substring(0, 200) + '...',
          model: wbArtifact.model || 'deepseek-chat',
          safetyNote: 'REVIEW_ONLY__NO_AUTO_APPLY',
        });

        return [
          '✅ 任务已派发（WorkBuddy Runtime）',
          '',
          'Task ID:  ' + taskId,
          'Model:    ' + (wbArtifact.model || 'deepseek-chat'),
          '延迟:     ' + (wbArtifact.latencyMs || '?') + 'ms',
          '产物:    workbuddy-output.md + runtime-meta.json',
          '',
          '📌 下一步: /ai任务 审查 ' + taskId,
        ].join('\n');
      } catch (e) {
        return [
          '🚀 任务已派发（WorkBuddy Runtime）',
          '',
          'Task ID:  ' + taskId,
          '⚠️ WorkBuddy Worker 异常：' + e.message,
          '',
          '任务保持 dispatched 状态，可重试：/ai任务 派发 ' + taskId,
        ].join('\n');
      }
    }

    // 7. 其他 assignee → 保持 mock 行为
    const dispatch = result.dispatch;
    const payload = dispatch.payload;

    const lines = [
      '🚀 任务已派发（Mock）',
      '',
      'Task ID:   ' + taskId,
      'Assignee:  ' + dispatch.assigneeName + ' (' + payload.provider + ')',
      'Model:     ' + payload.model,
      '能力:      ' + payload.capabilities.join(', '),
      '',
      '── Dispatch Payload ──',
      payload.instruction,
      '',
      '📌 下一步: 等待 AI Worker 返回产物后执行 /ai任务 审查 ' + taskId,
    ];

    if (payload._note) {
      lines.push('');
      lines.push('⚠️  ' + payload._note);
    }

    return lines.join('\n');
  } catch (e) {
    return '❌ 派发任务失败: ' + e.message;
  }
}

// ────────────────────────────────────────────
// 查看状态
// ────────────────────────────────────────────
function handleStatus(taskId) {
  // 不传 taskId → 列表摘要
  if (!taskId) {
    return handleSummary();
  }

  try {
    const status = runtimeCore.getTaskStatus(taskId);
    if (status.error) {
      return '❌ ' + status.error;
    }

    const formatted = runtimeCore.formatStatusForWecom(status);

    // 附加工件信息
    const artifacts = listArtifacts(taskId);
    let extra = '';
    if (artifacts.length > 0) {
      extra = '\n\n📁 产物: ' + artifacts.join(', ');
    }

    return formatted + extra;
  } catch (e) {
    return '❌ 查看状态失败: ' + e.message;
  }
}

// ────────────────────────────────────────────
// 任务摘要
// ────────────────────────────────────────────
function handleSummary() {
  try {
    const tasks = listTasks(10);

    if (tasks.length === 0) {
      return '📭 暂无任务\n\n使用 /ai任务 创建 <描述> 来创建第一个任务。';
    }

    const statusIcon = {
      queued: '📥', planned: '📋', dispatched: '🚀',
      artifact_received: '📦', review_pending: '🔍',
      approved: '✅', rejected: '❌',
      rollback_required: '🔄', closed: '🏁',
    };

    const lines = [
      '🤖 AI 任务列表 (最近 ' + tasks.length + ' 条)',
      '',
    ];

    tasks.forEach(function(t) {
      const icon = statusIcon[t.status] || '❓';
      const assigneeShort = {
        codex: 'Codex', workbuddy: 'WB',
        deepseek: 'DS', doubao: '豆包',
      };
      const a = assigneeShort[t.assignee] || t.assignee || '?';
      const req = (t.userRequest || '').substring(0, 30) + ((t.userRequest || '').length > 30 ? '...' : '');
      lines.push(icon + ' `' + t.taskId + '` ' + a + ' ' + req);
    });

    lines.push('');
    lines.push('查看详情: /ai任务 状态 <taskId>');

    return lines.join('\n');
  } catch (e) {
    return '❌ 获取任务列表失败: ' + e.message;
  }
}

// ────────────────────────────────────────────
// 列出任务
// ────────────────────────────────────────────
function handleList(argN) {
  const n = parseInt(argN) || 10;
  try {
    const tasks = listTasks(Math.min(n, 50));

    if (tasks.length === 0) {
      return '📭 暂无任务';
    }

    const statusIcon = {
      queued: '📥', planned: '📋', dispatched: '🚀',
      artifact_received: '📦', review_pending: '🔍',
      approved: '✅', rejected: '❌',
      rollback_required: '🔄', closed: '🏁',
    };

    const lines = ['🤖 AI 任务列表 (' + tasks.length + ' 条)', ''];

    tasks.forEach(function(t) {
      const icon = statusIcon[t.status] || '❓';
      const a = (t.assignee || '?').substring(0, 8);
      const req = (t.userRequest || '').substring(0, 25);
      lines.push(
        icon + ' [' + t.status.substring(0, 4) + '] ' +
        '`' + t.taskId + '` ' + a + ' ' + req
      );
    });

    return lines.join('\n');
  } catch (e) {
    return '❌ 获取任务列表失败: ' + e.message;
  }
}

// ────────────────────────────────────────────
// 审查任务（接收产物 + 审查）
// ────────────────────────────────────────────
function handleReview(taskId) {
  if (!taskId) {
    return '❌ 请提供 taskId\n\n示例: /ai任务 审查 task-xxx';
  }

  try {
    // Step 1: 接收产物（如果还没有）
    let task;
    try {
      const artifactResult = runtimeCore.receiveArtifact(taskId, {
        review: 'AI Worker 已完成任务，等待审查',
      });
      task = artifactResult.task;
    } catch (e) {
      if (!e.message.includes('Cannot receive artifact')) throw e;
    }

    // Step 2: 执行审查流水线
    const reviewResult = runtimeCore.reviewTask(taskId);
    const review = reviewResult.review;

    const lines = [
      '🔍 审查完成',
      '',
      'Task ID: ' + taskId,
      '总体风险: ' + review.overallRisk.toUpperCase(),
      '建议: ' + (review.recommendation === 'approve'
        ? '✅ 通过，可批准'
        : review.recommendation === 'reject'
          ? '❌ 拒绝，需回滚'
          : '⚠️ 需人工审核'),
      '',
    ];

    if (review.violations && review.violations.length > 0) {
      lines.push('🚫 违规项:');
      review.violations.forEach(function(v, i) {
        lines.push('  ' + (i + 1) + '. ' + v);
      });
      lines.push('');
    }

    review.results.forEach(function(r) {
      if (r.error) {
        lines.push('⚠️ ' + r.source + ': ' + r.error);
      } else if (r.score !== undefined) {
        lines.push('📊 ' + r.source + ': 风险分=' + r.score + ', 等级=' + r.level);
      }
    });

    lines.push('');
    if (review.safe) {
      lines.push('✅ 审查通过 → /ai任务 批准 ' + taskId);
    } else {
      lines.push('⚠️  发现问题 → /ai任务 拒绝 ' + taskId + ' 或人工判断');
    }

    if (review._note) {
      lines.push('');
      lines.push('💡 ' + review._note);
    }

    return lines.join('\n');
  } catch (e) {
    return '❌ 审查失败: ' + e.message;
  }
}

// ────────────────────────────────────────────
// 批准任务
// ────────────────────────────────────────────
function handleApprove(taskId) {
  if (!taskId) {
    return '❌ 请提供 taskId\n\n示例: /ai任务 批准 task-xxx';
  }

  try {
    const task = runtimeCore.approveTask(taskId);

    const lines = [
      '✅ 任务已批准',
      '',
      'Task ID: ' + taskId,
      '状态:    ✅ 已批准',
      '',
      '📌 下一步: /ai任务 关闭 ' + taskId,
    ];

    return lines.join('\n');
  } catch (e) {
    return '❌ 批准失败: ' + e.message;
  }
}

// ────────────────────────────────────────────
// 拒绝任务
// ────────────────────────────────────────────
function handleReject(taskId) {
  if (!taskId) {
    return '❌ 请提供 taskId\n\n示例: /ai任务 拒绝 task-xxx';
  }

  try {
    const task = runtimeCore.rejectTask(taskId);

    const lines = [
      '❌ 任务已拒绝',
      '',
      'Task ID: ' + taskId,
      '状态:    ❌ 已拒绝',
      '',
      '📌 下一步: /ai任务 回滚 ' + taskId,
    ];

    return lines.join('\n');
  } catch (e) {
    return '❌ 拒绝失败: ' + e.message;
  }
}

// ────────────────────────────────────────────
// 回滚规划
// ────────────────────────────────────────────
function handleRollback(taskId) {
  if (!taskId) {
    return '❌ 请提供 taskId\n\n示例: /ai任务 回滚 task-xxx';
  }

  try {
    const result = runtimeCore.planRollback(taskId);

    const lines = [
      '🔄 回滚计划已生成',
      '',
      'Task ID: ' + taskId,
      '状态:    🔄 需回滚',
      '',
    ];

    if (result.rollbackPlan) {
      const planStr = typeof result.rollbackPlan === 'string'
        ? result.rollbackPlan
        : JSON.stringify(result.rollbackPlan, null, 2);

      lines.push('── 回滚计划 ──');
      lines.push(planStr);
      lines.push('');
    }

    lines.push('📌 下一步: /ai任务 关闭 ' + taskId);

    return lines.join('\n');
  } catch (e) {
    return '❌ 回滚规划失败: ' + e.message;
  }
}

// ────────────────────────────────────────────
// 关闭任务
// ────────────────────────────────────────────
function handleCancel(taskId) {
  if (!taskId) return '❌ 缺少 taskId\n用法: /ai任务 取消 <taskId>';
  taskId = taskId.trim();
  try {
    const task = runtimeCore.cancelTask(taskId);
    return '✅ **任务已取消**\n\nTask ID: ' + taskId + '\n状态: cancelled\n\n⚠️ Artifact 保留未删除。';
  } catch (e) {
    return '❌ 取消失败\n\n' + e.message;
  }
}

function handleClose(taskId) {
  if (!taskId) {
    return '❌ 请提供 taskId\n\n示例: /ai任务 关闭 task-xxx';
  }

  try {
    const task = runtimeCore.closeTask(taskId);

    return [
      '🏁 任务已关闭',
      '',
      'Task ID: ' + taskId,
      '状态:    🏁 已关闭',
      '请求:    ' + (task.userRequest || '(无)'),
      '指派:    ' + (task.assignee || '?'),
      '',
      '✅ 任务生命周期完成。',
    ].join('\n');
  } catch (e) {
    return '❌ 关闭失败: ' + e.message;
  }
}

module.exports = { execute, desc };
