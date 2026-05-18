#!/usr/bin/env node
/**
 * fetch-orders.js v4
 * 抖店运营数据采集 — 电商罗盘（极速版）
 *
 * v3 → v4 优化:
 * - 删除订单页面探测（已知 SPA 限制，纯浪费 ~15s）
 * - waitPage 从 12 cycle 减到 3 cycle（~9s → ~6s）
 * - tab 切换等待缩短（5s+3s → 2s+2s）
 * - 生产模式跳过 text/html/screenshot 保存（~2s）
 * - 增加网络拦截，尝试从 XHR 获取结构化 JSON
 * - cookie 新鲜度检查：5分钟内免登录验证
 *
 * 目标: 43s → ~15s
 *
 * 用法:
 *   DISPLAY=:99 HEADLESS=false node src/fetch-orders.js
 *   DEBUG=true node src/fetch-orders.js  # 保留截图和页面内容
 */

const { launchPersistentBrowser, saveScreenshot, writeDoudianJSON, genOpSummary, log, now, today, parseValue } = require('./lib');
const path = require('path');
const fs = require('fs');

// --- Config ---
const COMPASS_URL = 'https://compass.jinritemai.com/shop';
const HOME_URL = 'https://fxg.jinritemai.com/ffa/grs-new/';
const DEBUG = process.env.DEBUG === 'true';
const LOGIN_CACHE_TTL = 5 * 60 * 1000; // 5分钟内免验证

// --- Cookie 新鲜度 ---
let loginCache = { valid: null, ts: 0 };
const LOGIN_CACHE_FILE = path.join(__dirname, '..', '..', '..', 'logs', 'doudian', '.login_cache.json');

function loadLoginCache() {
  try {
    if (fs.existsSync(LOGIN_CACHE_FILE)) {
      loginCache = JSON.parse(fs.readFileSync(LOGIN_CACHE_FILE, 'utf-8'));
    }
  } catch {}
}

function saveLoginCache(valid) {
  loginCache = { valid, ts: Date.now() };
  try {
    fs.writeFileSync(LOGIN_CACHE_FILE, JSON.stringify(loginCache));
  } catch {}
}

// --- 指标提取工具 ---
function extract(lines, names) {
  for (let i = 0; i < lines.length; i++) {
    for (const n of names) {
      if (!lines[i].includes(n)) continue;
      let realVal = null, yesterdayVal = null;
      for (let j = i + 1; j < Math.min(i + 8, lines.length); j++) {
        const l = lines[j].trim();
        if (!l) continue;
        const nextIndicators = ['成交金额', '用户支付金额', '结算金额', '成交订单数',
          '商品曝光人数', '商品点击人数', '客单价', '成交人数',
          '退款金额', '退款率', '退款订单数', '商家体验分'];
        if (nextIndicators.some(k => lines[j].includes(k) && lines[j] !== lines[i])) break;
        if (l === '昨日') { yesterdayVal = parseValue(lines[j + 1] || ''); break; }
        if (/^(同行基准|同行中间值|配置|查看)/.test(l) || l.startsWith('查看')) continue;
        const v = parseValue(l);
        if (v !== null && realVal === null) realVal = v;
      }
      return { value: realVal, yesterday: yesterdayVal };
    }
  }
  return null;
}

function matchFirst(text, patterns) {
  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      const val = parseValue(m[1] !== undefined ? m[1] : m[0]);
      return val !== null ? val : m[1];
    }
  }
  return null;
}

// --- 点击 tab ---
async function clickTab(page, tabText) {
  const clicked = await page.evaluate((text) => {
    const els = [...document.querySelectorAll('*')];
    const el = els.find(e => e.textContent?.trim() === text && e.offsetParent !== null);
    if (el) { el.click(); return true; }
    return false;
  }, tabText);
  if (clicked) log('fetch-orders', 'INFO', `点击 tab: "${tabText}"`);
  return clicked;
}

// --- 等待页面加载（优化版: 3 cycle） ---
async function waitPage(page, maxWaitMs = 12000) {
  let loaded = false;
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    try { await page.waitForLoadState('networkidle', { timeout: 8000 }); } catch {}
    await page.waitForTimeout(2000);
    const txt = await page.evaluate(() => document.body?.innerText?.substring(0, 500) || '');
    if (txt.includes('经营概况') || txt.includes('交易') || txt.includes('成交') || txt.includes('数据概览')) {
      loaded = true; break;
    }
  }
  return loaded;
}

// --- 网络拦截：捕获罗盘 XHR 响应 ---
function setupAPIIntercept(page) {
  const apiData = [];

  page.on('response', async (res) => {
    const url = res.url();
    const ct = res.headers()['content-type'] || '';
    if (ct.includes('json') && url.includes('compass')) {
      try {
        const body = await res.json().catch(() => null);
        if (body) {
          apiData.push({ url, body });
        }
      } catch {}
    }
  });

  return apiData;
}

// --- 从拦截的 API 响应中提取指标 ---
function extractFromAPI(apiData) {
  for (const item of apiData) {
    const body = item.body;
    if (!body || !body.data) continue;
    const d = body.data;

    // 尝试从不同的 API 响应结构中提取
    if (d.settleAmount !== undefined || d.settle_amount !== undefined) {
      return {
        source: 'api_intercept',
        url: item.url,
        settlementGMV: d.settleAmount || d.settle_amount || null,
        payOrders: d.orderCount || d.order_count || null,
        exposureCount: d.exposureUserCount || d.exposure_user_count || null,
      };
    }
  }
  return null;
}

// --- 保存页面内容（仅 DEBUG 模式） ---
async function savePageContent(page, label) {
  if (!DEBUG) return { textPath: null, htmlPath: null, textLength: 0 };

  const ts = Date.now();
  const text = await page.evaluate(() => document.body?.innerText || '').catch(() => '');
  const html = await page.content().catch(() => '');

  const dir = path.join(__dirname, '..', '..', '..', 'logs', 'screenshots');
  fs.mkdirSync(dir, { recursive: true });

  const textPath = path.join(dir, `${label}_text_${ts}.txt`);
  const htmlPath = path.join(dir, `${label}_html_${ts}.html`);
  fs.writeFileSync(textPath, text, 'utf-8');
  fs.writeFileSync(htmlPath, html, 'utf-8');

  return { textPath, htmlPath, textLength: text.length };
}

// ========== 主函数 ==========
async function main() {
  log('fetch-orders', 'INFO', '=== fetch-orders v4 启动 ===');
  const startTime = Date.now();

  loadLoginCache();

  const browserContext = await launchPersistentBrowser();
  const page = browserContext.pages()[0] || await browserContext.newPage();

  // ====== 1. 验证登录态（带缓存） ======
  const cacheAge = Date.now() - loginCache.ts;
  if (loginCache.valid === true && cacheAge < LOGIN_CACHE_TTL) {
    log('fetch-orders', 'OK', `登录态缓存有效 (${Math.round(cacheAge / 1000)}s前验证)`);
  } else {
    try {
      log('fetch-orders', 'INFO', '验证登录态...');
      await page.goto(HOME_URL, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(2000);

      const bodyText = await page.evaluate(() => document.body?.innerText || '');
      const hasDashInd = ['商品管理', '订单管理', '数据中心', '售后管理', '抖店工作台'].some(k => bodyText.includes(k));
      const hasLoginInd = ['发送验证码', '手机登录', '邮箱登录'].some(k => bodyText.includes(k));

      if (hasLoginInd && !hasDashInd) {
        log('fetch-orders', 'ERROR', 'Cookies 已过期! 请运行 login-only.js');
        saveLoginCache(false);
        writeDoudianJSON('orders', { type: 'orders', timestamp: now(), date: today(), error: 'login_required', note: '请运行 login-only.js' });
        await browserContext.close().catch(() => {});
        process.exit(1);
        return;
      }

      saveLoginCache(true);
      log('fetch-orders', 'OK', '登录态有效');
    } catch (e) {
      log('fetch-orders', 'WARN', `登录态检测异常: ${e.message}`);
    }
  }

  // ====== 2. 电商罗盘（核心数据源） ======
  const results = { compass: null, apiIntercept: null };
  const metrics = {};

  try {
    log('fetch-orders', 'INFO', `导航到电商罗盘: ${COMPASS_URL}`);

    // 设置网络拦截（在导航前）
    const apiData = setupAPIIntercept(page);

    await page.goto(COMPASS_URL, { waitUntil: 'domcontentloaded', timeout: 20000 });
    const loaded = await waitPage(page);

    if (!loaded) {
      log('fetch-orders', 'WARN', '罗盘加载超时，尝试继续提取...');
    }

    // 先尝试从拦截的 API 响应中获取数据
    const apiResult = extractFromAPI(apiData);
    if (apiResult) {
      log('fetch-orders', 'OK', '从 XHR 响应获取到结构化数据');
      results.apiIntercept = apiResult;
    }

    // 无论 API 拦截是否成功，都从页面文本提取（保底）
    await savePageContent(page, 'compass');
    if (DEBUG) await saveScreenshot(page, 'compass', 'main');

    // 点击"近7天"
    await clickTab(page, '近7天');
    await page.waitForTimeout(2000);

    const fullText7 = await page.evaluate(() => document.body?.innerText || '');
    const lines7 = fullText7.split('\n').map(l => l.trim()).filter(Boolean);

    const settlement7 = extract(lines7, ['结算金额']);
    if (settlement7) metrics.settlementGMV7d = settlement7.value;
    const payOrders7 = extract(lines7, ['成交订单数']);
    if (payOrders7) metrics.payOrders7d = payOrders7.value;
    const exposure7 = extract(lines7, ['商品曝光人数']);
    if (exposure7) metrics.exposureCount7d = exposure7.value;

    log('fetch-orders', 'INFO', `近7天: GMV=${metrics.settlementGMV7d ?? 'N/A'} 订单=${metrics.payOrders7d ?? 'N/A'}`);

    // 回到近1天
    await clickTab(page, '近1天');
    await page.waitForTimeout(2000);

    const fullText = await page.evaluate(() => document.body?.innerText || '');
    const lines = fullText.split('\n').map(l => l.trim()).filter(Boolean);

    const settlement = extract(lines, ['结算金额']);
    if (settlement) metrics.settlementGMV = settlement.value;
    const payOrders = extract(lines, ['成交订单数']);
    if (payOrders) metrics.payOrders = payOrders.value;
    const exposure = extract(lines, ['商品曝光人数']);
    if (exposure) metrics.exposureCount = exposure.value;

    // 体验分、流量从7天数据取
    const score = extract(lines7, ['商家体验分']);
    if (score) metrics.experienceScore = score.value;

    metrics.totalTraffic = matchFirst(fullText7, [/全店曝光次数\s*(\d+)/, /全店流量\s*(\d+)/]);
    metrics.visitorCount = matchFirst(fullText7, [/访客数\s*(\d+)/]);

    results.compass = { ok: true, url: page.url() };

    log('fetch-orders', 'OK', `罗盘数据: GMV=${metrics.settlementGMV ?? 'N/A'} 订单=${metrics.payOrders ?? 'N/A'} 体验分=${metrics.experienceScore ?? 'N/A'}`);
  } catch (e) {
    log('fetch-orders', 'ERROR', `罗盘采集失败: ${e.message}`);
    results.compass = { ok: false, error: e.message };
  }

  // ====== 3. 组装输出（精简版） ======
  const output = {
    type: 'orders',
    version: 4,
    timestamp: now(),
    date: today(),
    duration_ms: Date.now() - startTime,
    loginStatus: 'valid',

    metrics: {
      settlementGMV: metrics.settlementGMV ?? null,
      settlementGMV7d: metrics.settlementGMV7d ?? null,
      payOrders: metrics.payOrders ?? null,
      payOrders7d: metrics.payOrders7d ?? null,
      exposureCount: metrics.exposureCount ?? null,
      exposureCount7d: metrics.exposureCount7d ?? null,
      experienceScore: metrics.experienceScore ?? null,
      totalTraffic: metrics.totalTraffic ?? null,
      visitorCount: metrics.visitorCount ?? null,
    },

    sources: {
      compass: results.compass?.ok ?? false,
      apiIntercept: results.apiIntercept ? true : false,
    },
  };

  writeDoudianJSON('orders', output);

  // 控制台报告
  const report = [
    '\n========== 抖店运营数据 v4 ==========',
    `时间: ${output.date}`,
    `耗时: ${output.duration_ms}ms`,
    '',
    '[指标]',
  ];

  const labels = {
    settlementGMV: '今日结算金额', settlementGMV7d: '近7天结算金额', payOrders: '今日订单数',
    payOrders7d: '近7天订单数', exposureCount: '今日曝光人数',
    exposureCount7d: '近7天曝光人数', experienceScore: '商家体验分',
    totalTraffic: '全店曝光次数', visitorCount: '访客数',
  };

  for (const [k, v] of Object.entries(output.metrics)) {
    const lbl = labels[k] || k;
    if (v != null) {
      const display = k.includes('GMV') || k.includes('settlement')
        ? '\u00a5' + Number(v).toFixed(2) : String(v);
      report.push(`  ${lbl}: ${display}`);
    } else {
      report.push(`  ${lbl}: N/A`);
    }
  }

  report.push('');
  report.push(`[数据源] 罗盘: ${results.compass?.ok ? '成功' : '失败'} | API拦截: ${results.apiIntercept ? '成功' : '未命中'}`);
  report.push('==========================================\n');

  console.log(report.join('\n'));

  // 企业微信摘要
  const wecomData = {
    date: output.date,
    gmv: output.metrics.settlementGMV7d ? Math.round(output.metrics.settlementGMV7d * 100) : undefined,
    orders: output.metrics.payOrders7d,
    note: [
      output.metrics.experienceScore != null ? `体验分${output.metrics.experienceScore}` : '',
      output.metrics.exposureCount7d != null ? `7天曝光${output.metrics.exposureCount7d}` : '',
      output.metrics.settlementGMV7d != null ? `7天GMV \u00a5${output.metrics.settlementGMV7d.toFixed(2)}` : '',
      '数据来源: 电商罗盘',
    ].filter(Boolean).join(' | '),
  };

  console.log('=== 企业微信摘要 ===');
  console.log(genOpSummary(wecomData));

  await browserContext.close().catch(() => {});
  log('fetch-orders', 'OK', `v4 完成，总耗时 ${Date.now() - startTime}ms`);
}

main().catch(err => {
  log('fetch-orders', 'ERROR', `Fatal: ${err.message}`);
  console.error(err.stack);
  process.exit(1);
});
