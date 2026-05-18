'use strict';

require('dotenv').config({ path: '../../.env' });

const express = require('express');
const { ensureLoggedIn } = require('./login-doudian');

const app = express();
const PORT = process.env.PLAYWRIGHT_PORT || 3002;

app.use(express.json());

// ─── 健康检查 ───────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'playwright-worker', time: new Date().toISOString() });
});

// ─── 检查登录状态 ───────────────────────────────────────────────────
app.get('/login/check', async (req, res) => {
  console.log('[Worker] 开始检查登录状态...');
  try {
    const result = await ensureLoggedIn(false);
    res.json({
      status: result.status,
      loggedIn: result.status === 'logged_in',
      time: new Date().toISOString(),
    });
  } catch (e) {
    res.status(500).json({ status: 'error', error: e.message });
  }
});

// ─── 触发交互登录（需要 headful 环境）──────────────────────────────
app.post('/login/interactive', async (req, res) => {
  console.log('[Worker] 启动交互登录...');
  res.json({ status: 'started', message: '交互登录已启动，请查看服务器日志或 VNC' });

  // 异步执行，不阻塞响应
  ensureLoggedIn(true).then(({ status }) => {
    console.log(`[Worker] 交互登录完成: ${status}`);
  });
});

// ─── 通用任务接口（占位，后续扩展）────────────────────────────────
app.post('/task', async (req, res) => {
  const { action } = req.body || {};
  console.log(`[Worker] 收到任务: ${action}`);

  // MVP 阶段只支持登录检查
  const supportedActions = ['check_login'];
  if (!supportedActions.includes(action)) {
    return res.status(400).json({
      error: `不支持的操作: ${action}`,
      supported: supportedActions,
    });
  }

  if (action === 'check_login') {
    const result = await ensureLoggedIn(false);
    return res.json({ action, result: result.status });
  }
});

app.listen(PORT, () => {
  console.log(`[Playwright Worker] 启动成功，端口: ${PORT}`);
});
