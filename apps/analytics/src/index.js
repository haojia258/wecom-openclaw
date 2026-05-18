'use strict';

require('dotenv').config({ path: '../../.env' });

const express = require('express');
const cron = require('node-cron');
const { generateAndPushReport } = require('./daily-report');

const app = express();
const PORT = process.env.ANALYTICS_PORT || 3003;
const REPORT_CRON = process.env.REPORT_CRON || '0 21 * * *'; // 默认每天 21:00

app.use(express.json());

// ─── 健康检查 ───────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'analytics', time: new Date().toISOString() });
});

// ─── 手动触发日报 ───────────────────────────────────────────────────
app.post('/report/generate', async (req, res) => {
  console.log('[Analytics] 手动触发日报生成...');
  try {
    const result = await generateAndPushReport();
    res.json({ success: true, ...result });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ─── 获取最新日报（仅返回文本）──────────────────────────────────────
app.get('/report/latest', async (req, res) => {
  try {
    const result = await generateAndPushReport();
    res.json({ report: result.report, data: result.data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── 定时任务：每天自动生成日报 ────────────────────────────────────
if (cron.validate(REPORT_CRON)) {
  cron.schedule(REPORT_CRON, async () => {
    console.log('[Analytics] 定时触发日报生成...');
    try {
      await generateAndPushReport();
    } catch (e) {
      console.error('[Analytics] 定时日报失败:', e.message);
    }
  });
  console.log(`[Analytics] 定时任务已注册: ${REPORT_CRON}`);
} else {
  console.warn(`[Analytics] 无效的 cron 表达式: ${REPORT_CRON}`);
}

app.listen(PORT, () => {
  console.log(`[Analytics] 启动成功，端口: ${PORT}`);
  console.log(`[Analytics] 日报定时: ${REPORT_CRON}`);
});
