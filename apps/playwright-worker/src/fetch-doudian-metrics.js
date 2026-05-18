#!/usr/bin/env node
/**
 * fetch-doudian-metrics.js
 * Hybrid: Playwright for compass/罗盘, Doudian API for orders/refunds.
 * Merges all data into one output JSON.
 * Reuses storageState for Playwright login.
 * Saves screenshot/text/html for compass page only.
 */

const { log, outputJSON, saveArtifact, parseValue, extract, now, today, getSubDir,
  launchPersistentBrowser, setupNetworkInterceptor, saveScreenshot, writeDoudianJSON,
  STORAGE_PROFILE, DOWNLOADS_DIR
} = require('./lib');
const path = require('path');
const fs = require('fs');

const STORAGE_STATE = process.env.DOUDIAN_STORAGE_STATE || path.join('C:', 'data', 'browser', 'storageState.json');
const COMPASS_URL = 'https://compass.jinritemai.com/shop';

// === Try to load doudian-api lib (for orders/refunds via API) ===
let doudianLib = null;
let doudianApiAvailable = false;
try {
  const libPath = path.resolve(__dirname, '..', '..', 'doudian-api', 'src', 'lib.js');
  if (fs.existsSync(libPath)) {
    doudianLib = require(libPath);
    doudianApiAvailable = doudianLib.isConfigured();
    if (doudianApiAvailable) {
      log('fetch-metrics', 'INFO', 'Doudian API lib loaded and configured');
    } else {
      log('fetch-metrics', 'WARN', 'Doudian API lib loaded but NOT configured (missing credentials)');
    }
  } else {
    log('fetch-metrics', 'WARN', `Doudian API lib not found at ${libPath}`);
  }
} catch (err) {
  log('fetch-metrics', 'WARN', `Doudian API lib load failed: ${err.message}`);
}

// === Check if Playwright is available ===
let usePlaywright = true;
try {
  require('playwright');
} catch {
  usePlaywright = false;
  log('fetch-metrics', 'WARN', 'Playwright not installed, skipping compass scrape');
}

async function launchBrowser() {
  if (!usePlaywright) return null;
  const { chromium } = require('playwright');

  // 优先使用 persistent context (人工辅助模式)
  const usePersistent = process.env.USE_PERSISTENT !== 'false';
  if (usePersistent) {
    try {
      const context = await launchPersistentBrowser({
        profileDir: process.env.BROWSER_PROFILE_DIR || STORAGE_PROFILE,
      });
      log('fetch-metrics', 'INFO', '使用 persistent context (headed模式)');
      return context; // 返回 context 而非 browser
    } catch (err) {
      log('fetch-metrics', 'WARN', `Persistent context 启动失败，降级到普通模式: ${err.message}`);
    }
  }

  // 降级：普通 launch
  const storagePath = path.resolve(STORAGE_STATE);
  const opts = { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] };
  if (fs.existsSync(storagePath)) {
    opts.storageState = storagePath;
    log('fetch-metrics', 'INFO', `Using storageState: ${storagePath}`);
  }
  return chromium.launch(opts);
}

async function scrapeCompass(browserOrContext) {
  const result = { source: 'compass', status: 'pending', metrics: {} };
  if (!browserOrContext) {
    result.status = 'skipped';
    result.note = 'Playwright not available';
    return result;
  }

  // browserOrContext 可能是 Browser 或 BrowserContext
  const isContext = browserOrContext.pages !== undefined;
  const context = isContext ? browserOrContext : await browserOrContext.newContext();
  const page = isContext ? (await browserOrContext.pages())[0] || await browserOrContext.newPage() : await context.newPage();

  // 安装网络监听
  const captured = setupNetworkInterceptor(page, 'fetch-metrics');

  try {
    log('fetch-metrics', 'INFO', `Navigating to ${COMPASS_URL}`);
    await page.goto(COMPASS_URL, { waitUntil: 'networkidle', timeout: 30000 });

    for (let i = 0; i < 12; i++) {
      await page.waitForTimeout(3000);
      const text = await page.innerText('body').catch(() => '');
      if (text.includes('经营概况') || text.includes('GMV')) break;
    }

    const text = await page.innerText('body').catch(() => '');
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

    // 使用新的截图函数
    const ssPath = await saveScreenshot(page, 'compass', 'main');
    saveArtifact('fetch-metrics', 'compass', 'text', text);
    saveArtifact('fetch-metrics', 'compass', 'html', await page.content().catch(() => ''));

    const gmv = extract(lines, 'GMV') || extract(lines, '成交额') || { value: null, yesterday: null };
    const orders = extract(lines, '支付订单') || extract(lines, '订单') || { value: null, yesterday: null };
    const visitors = extract(lines, '访客') || { value: null, yesterday: null };
    const score = extract(lines, '体验分') || extract(lines, '体验') || { value: null, yesterday: null };
    const traffic = extract(lines, '流量') || { value: null, yesterday: null };

    result.metrics = {
      todayGMV: gmv.value ?? 0,
      yesterdayGMV: gmv.yesterday ?? 0,
      settlementGMV: 0,
      payOrders: orders.value ?? 0,
      visitorCount: visitors.value ?? 0,
      experienceScore: score.value ?? 0,
      totalTraffic: traffic.value ?? visitors.value ?? 0,
    };
    result.status = 'ok';
    result.screenshot = ssPath;
    result.networkCaptured = captured.length;
  } catch (err) {
    result.status = 'error';
    result.error = err.message;
    log('fetch-metrics', 'ERROR', `Compass scrape failed: ${err.message}`);
  } finally {
    if (!isContext) {
      await page.close().catch(() => {});
      await context.close().catch(() => {});
    }
  }
  return result;
}

// === Fetch orders + refunds via Doudian API (or read cached JSON) ===
async function fetchOrdersViaAPI() {
  if (!doudianLib) return { mode: 'no-lib', orders: [], total: 0 };
  if (!doudianApiAvailable) return { mode: 'not-configured', orders: [], total: 0 };

  try {
    const res = await doudianLib.callAPI('order.list', {
      page: 1, page_size: 50,
      start_time: Math.floor((Date.now() - 7 * 86400000) / 1000),
      end_time: Math.floor(Date.now() / 1000),
    });
    if (!res.success) {
      return { mode: 'api-error', error: res.err_msg, orders: [], total: 0 };
    }
    const orders = res.data?.orders || res.data?.list || [];
    return { mode: 'api', orders, total: res.data?.total || orders.length };
  } catch (err) {
    return { mode: 'api-exception', error: err.message, orders: [], total: 0 };
  }
}

async function fetchRefundsViaAPI() {
  if (!doudianLib) return { mode: 'no-lib', refunds: [], total: 0 };
  if (!doudianApiAvailable) return { mode: 'not-configured', refunds: [], total: 0 };

  try {
    const res = await doudianLib.callAPI('refund.list', {
      page: 1, page_size: 50,
      start_time: Math.floor((Date.now() - 7 * 86400000) / 1000),
      end_time: Math.floor(Date.now() / 1000),
    });
    if (!res.success) {
      return { mode: 'api-error', error: res.err_msg, refunds: [], total: 0 };
    }
    const refunds = res.data?.refunds || res.data?.list || [];
    return { mode: 'api', refunds, total: res.data?.total || refunds.length };
  } catch (err) {
    return { mode: 'api-exception', error: err.message, refunds: [], total: 0 };
  }
}

function readCachedOrders() {
  if (!doudianLib) return { mode: 'no-lib', orders: [], total: 0 };
  try {
    const data = doudianLib.loadLatestJSON('orders');
    if (data && data.orders) {
      return { mode: 'cached-json', orders: data.orders, total: data.total || data.orders.length };
    }
  } catch {}
  return { mode: 'no-cache', orders: [], total: 0 };
}

function readCachedRefunds() {
  if (!doudianLib) return { mode: 'no-lib', refunds: [], total: 0 };
  try {
    const data = doudianLib.loadLatestJSON('aftersales');
    if (data && data.aftersales) {
      return { mode: 'cached-json', refunds: data.aftersales, total: data.total || data.aftersales.length };
    }
  } catch {}
  return { mode: 'no-cache', refunds: [], total: 0 };
}

async function getOrders() {
  // Try API first, fall back to cached JSON
  const apiResult = await fetchOrdersViaAPI();
  if (apiResult.mode === 'api' && apiResult.orders.length) return apiResult;
  log('fetch-metrics', 'WARN', `API orders failed (${apiResult.mode}), trying cached JSON`);
  return readCachedOrders();
}

async function getRefunds() {
  const apiResult = await fetchRefundsViaAPI();
  if (apiResult.mode === 'api' && apiResult.refunds.length) return apiResult;
  log('fetch-metrics', 'WARN', `API refunds failed (${apiResult.mode}), trying cached JSON`);
  return readCachedRefunds();
}

// === Main ===
async function main() {
  log('fetch-metrics', 'INFO', 'Starting Doudian metrics fetch (hybrid: Playwright + API)...');
  const startTime = Date.now();

  // 1. Playwright: scrape compass
  let browserOrContext = null;
  if (usePlaywright) {
    try {
      browserOrContext = await launchBrowser();
    } catch (err) {
      log('fetch-metrics', 'WARN', `Browser launch failed: ${err.message}`);
      browserOrContext = null;
    }
  }

  // 判断是否是 persistent context
  const isPersistentContext = browserOrContext && browserOrContext.pages !== undefined;

  const compassResult = await scrapeCompass(browserOrContext);

  // 正确关闭
  if (browserOrContext) {
    await browserOrContext.close().catch(() => {});
  }

  // 2. API: fetch orders + refunds
  const [ordersResult, refundsResult] = await Promise.all([
    getOrders(),
    getRefunds(),
  ]);

  // 3. Merge into summary
  const compassMetrics = compassResult.metrics || {};
  const orders = ordersResult.orders || [];
  const refunds = refundsResult.refunds || [];

  const apiGMV = orders.reduce((s, o) => s + (o.pay_amount || o.payAmount || 0), 0);
  const refundAmount = refunds.reduce((s, r) => s + (r.refund_amount || r.refundAmount || 0), 0);
  const pendingShip = orders.filter(o => {
    const st = o.order_status || o.orderStatus || '';
    return st.includes('待发货') || st === '2';
  }).length;

  const output = {
    type: 'doudian-metrics',
    timestamp: now(),
    date: today(),
    duration_ms: Date.now() - startTime,
    mode: {
      playwright: usePlaywright && browserOrContext ? (isPersistentContext ? 'persistent-headed' : 'live-headless') : 'skipped',
      api: ordersResult.mode,
      apiRefunds: refundsResult.mode,
    },
    compass: compassResult,
    orders: {
      mode: ordersResult.mode,
      total: ordersResult.total,
      count: orders.length,
      pendingShip,
      sample: orders.slice(0, 3),
    },
    refunds: {
      mode: refundsResult.mode,
      total: refundsResult.total,
      count: refunds.length,
      refundAmount,
      sample: refunds.slice(0, 3),
    },
    summary: {
      todayGMV: compassMetrics.todayGMV ?? apiGMV ?? 0,
      yesterdayGMV: compassMetrics.yesterdayGMV ?? 0,
      apiGMV,
      payOrders: compassMetrics.payOrders ?? orders.length ?? 0,
      pendingShip,
      refundCount: refunds.length,
      refundAmount,
      experienceScore: compassMetrics.experienceScore ?? 0,
      visitorCount: compassMetrics.visitorCount ?? 0,
      totalTraffic: compassMetrics.totalTraffic ?? 0,
    },
    apiNote: doudianApiAvailable
      ? 'Doudian API configured — orders/refunds via API'
      : 'Doudian API NOT configured — set DOUDIAN_APP_KEY/SECRET/ACCESS_TOKEN in .env',
    humanAssistedNote: isPersistentContext
      ? '使用人工辅助模式 (persistent headed browser)，登录态保存在 storage/browser-profile/'
      : '使用 headless 模式，设置 USE_PERSISTENT=false 可切换到人工辅助模式',
  };

  outputJSON('fetch-metrics', output);
  writeDoudianJSON('fetch-metrics', output);
  log('fetch-metrics', 'OK', `Done in ${Date.now() - startTime}ms`);
  console.log(JSON.stringify(output, null, 2));
}

main().catch(err => {
  log('fetch-metrics', 'ERROR', `Fatal: ${err.message}`);
  process.exit(1);
});
