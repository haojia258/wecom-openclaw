#!/usr/bin/env node
/**
 * check-products.js v3
 * 商品巡检 — 商品状态、库存预警、违规提醒
 * v3: 修复 false-positive "违规提醒"（侧边栏菜单干扰）
 * 与 fetch-orders.js v4 保持一致：launchPersistentBrowser + 登录缓存
 *
 * 用法:
 *   DISPLAY=:99 HEADLESS=false node src/check-products.js
 *   DEBUG=true node src/check-products.js
 */

const { launchPersistentBrowser, saveScreenshot, writeDoudianJSON, log, now, today, parseValue } = require('./lib');
const path = require('path');
const fs = require('fs');

const PRODUCT_URL = 'https://fxg.jinritemai.com/ffa/g/product/list';
const DEBUG = process.env.DEBUG === 'true';
const LOGIN_CACHE_TTL = 5 * 60 * 1000;

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
  try { fs.writeFileSync(LOGIN_CACHE_FILE, JSON.stringify(loginCache)); } catch {}
}

async function checkLogin(page) {
  const cacheAge = Date.now() - loginCache.ts;
  if (loginCache.valid === true && cacheAge < LOGIN_CACHE_TTL) {
    log('check-products', 'OK', `登录态缓存有效 (${Math.round(cacheAge / 1000)}s前)`);
    return true;
  }

  try {
    await page.goto('https://fxg.jinritemai.com/ffa/g/product/list', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(3000);
    const bodyText = await page.evaluate(() => document.body?.innerText || '');
    const hasLoginInd = ['发送验证码', '手机登录', '邮箱登录'].some(k => bodyText.includes(k));
    const hasDashInd = ['商品管理', '商品列表', '出售中', '已下架'].some(k => bodyText.includes(k));
    if (hasLoginInd && !hasDashInd) {
      log('check-products', 'ERROR', 'Cookies 已过期! 请运行 login-only.js');
      saveLoginCache(false);
      return false;
    }
    saveLoginCache(true);
    log('check-products', 'OK', '登录态有效');
    return true;
  } catch (e) {
    log('check-products', 'WARN', `登录检测异常: ${e.message}`);
    return false;
  }
}

async function waitPage(page, maxWaitMs = 10000) {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    try { await page.waitForLoadState('networkidle', { timeout: 6000 }); } catch {}
    await page.waitForTimeout(2000);
    const txt = await page.evaluate(() => document.body?.innerText?.substring(0, 500) || '');
    if (txt.includes('商品') || txt.includes('出售中') || txt.includes('库存')) return true;
  }
  return false;
}

/**
 * v3: 更精准的违规检测
 * 只检测商品列表中真实的违规记录，排除侧边栏菜单干扰
 */
async function detectProductViolations(page) {
  return await page.evaluate(() => {
    const issues = [];

    // 获取主要内容区（排除侧边栏/导航）
    function getMainText() {
      const selectors = [
        '.app-content', '.content-area', 'main',
        '[class*="content"]', '.page-content',
      ];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el) return el.innerText || '';
      }
      return document.body.innerText || '';
    }

    const mainText = getMainText();

    // 检测商品表格中的违规状态列
    const productRows = document.querySelectorAll('table tbody tr, [class*="product-item"], [class*="goods-item"]');
    let violationCount = 0;

    productRows.forEach(row => {
      const rowText = row.innerText || '';
      // 商品行包含"违规"且有具体状态描述
      if (rowText.includes('违规') && (rowText.includes('禁售') || rowText.includes('处罚') || rowText.includes('下架'))) {
        violationCount++;
        issues.push({
          type: 'product-violation',
          severity: 'error',
          detail: `商品违规: ${rowText.substring(0, 80)}`,
        });
      }
    });

    // 检测页面中是否有"违规提醒"通知区（非侧边栏）
    const notificationSelectors = ['.notice', '.notification', '.alert', '[class*="notice"]', '[class*="alert"]'];
    let hasNotice = false;
    notificationSelectors.forEach(sel => {
      document.querySelectorAll(sel).forEach(el => {
        const t = el.innerText || '';
        if (t.includes('违规') && !t.includes('首页') && !t.includes('菜单')) {
          hasNotice = true;
          issues.push({
            type: 'violation-notice',
            severity: 'warn',
            detail: `违规提醒: ${t.substring(0, 80)}`,
          });
        }
      });
    });

    // 仅全页含"违规"但以上内容都没有 => 可能是侧边栏菜单
    if (issues.length === 0 && mainText.includes('违规提醒')) {
      // 进一步检查：侧边栏文字通常较短且不包含具体违规内容
      const hasSpecificViolation = /违规[：:].{5,}|扣除\d+分|累计扣分/.test(mainText);
      if (!hasSpecificViolation) {
        // 疑似侧边栏干扰，不报违规
        return { issues: [], hasViolation: false, falsePositiveBlocked: true };
      }
    }

    return { issues, hasViolation: issues.length > 0, violationCount };
  });
}

async function main() {
  log('check-products', 'INFO', '=== check-products v3 启动 ===');
  const startTime = Date.now();

  loadLoginCache();

  const browserContext = await launchPersistentBrowser();
  const page = browserContext.pages()[0] || await browserContext.newPage();

  const loggedIn = await checkLogin(page);
  if (!loggedIn) {
    writeDoudianJSON('check-products', {
      type: 'check-products', timestamp: now(), date: today(),
      error: 'login_required', note: '请运行 login-only.js',
    });
    await browserContext.close().catch(() => {});
    process.exit(1);
  }

  // 导航到商品列表页
  await page.goto(PRODUCT_URL, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await waitPage(page);

  if (DEBUG) await saveScreenshot(page, 'check-products', 'products');

  const fullText = await page.evaluate(() => document.body?.innerText || '');
  const lines = fullText.split('\n').map(l => l.trim()).filter(Boolean);

  // 提取商品信息
  const products = [];
  const issues = [];

  // 关键词检测（保留作为补充，但优先级低于 DOM 检测）
  if (fullText.includes('已下架') || fullText.includes('售罄')) {
    issues.push({ type: 'off-shelf', severity: 'warn', detail: '检测到下架/售罄商品' });
  }
  if (fullText.includes('库存不足') || fullText.includes('库存预警')) {
    issues.push({ type: 'stock-low', severity: 'warn', detail: '检测到库存不足商品' });
  }

  // v3: 使用更精准的违规检测（DOM 级别）
  const violationResult = await detectProductViolations(page);
  if (violationResult.issues.length > 0) {
    issues.push(...violationResult.issues);
  }

  // 价格异常检测（仅当页面有明确的"价格异常"标签时）
  const hasPriceAnomaly = await page.evaluate(() => {
    const labels = document.querySelectorAll('[class*="tag"], [class*="label"], .status-label');
    for (const el of labels) {
      const t = el.innerText || '';
      if (t.includes('价格异常') || t.includes('价格违规')) return true;
    }
    return false;
  });
  if (hasPriceAnomaly) {
    issues.push({ type: 'price-anomaly', severity: 'warn', detail: '检测到价格异常商品' });
  }

  // 尝试解析商品列表（查找包含"桶"的行）
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('桶') && (line.includes('装') || /\d+/.test(line))) {
      const name = line;
      const stockLine = lines[i + 1] || '';
      const stock = parseValue(stockLine) ?? null;
      products.push({
        name,
        stock: stock ?? '未知',
        status: fullText.includes('售罄') ? 'sold-out' : 'on-sale',
      });
    }
  }

  const output = {
    type: 'check-products',
    version: 3,
    timestamp: now(),
    date: today(),
    duration_ms: Date.now() - startTime,
    loginStatus: 'valid',
    products,
    issues,
    summary: {
      totalProducts: products.length,
      issueCount: issues.length,
      hasError: issues.some(i => i.severity === 'error'),
      falsePositiveBlocked: violationResult.falsePositiveBlocked || false,
    },
  };

  writeDoudianJSON('check-products', output);

  console.log('\n========== 商品巡检 v3 ==========');
  console.log(`商品数: ${products.length}`);
  console.log(`问题数: ${issues.length}`);
  issues.forEach(i => console.log(`  [${i.severity}] ${i.type}: ${i.detail}`));
  if (violationResult.falsePositiveBlocked) {
    console.log('  [INFO] 已排除侧边栏误报');
  }
  console.log('===================================\n');

  await browserContext.close().catch(() => {});
  log('check-products', 'OK', `v3 完成，耗时 ${Date.now() - startTime}ms`);
}

main().catch(err => {
  log('check-products', 'ERROR', `Fatal: ${err.message}`);
  process.exit(1);
});
