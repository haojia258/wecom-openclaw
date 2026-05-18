'use strict';

/**
 * 抖店后台数据读取 MVP
 * - 复用 storageState 登录态
 * - 读取运营核心数据：今日订单、GMV、待发货、退款售后
 * - 输出 JSON 格式结果
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

// --- 配置 ---
const DOUDIAN_BACKEND_URL = process.env.DOUDIAN_BACKEND_URL ||
  'https://fxg.jinritemai.com/ffa/grs-new/';
const STORAGE_STATE_PATH = process.env.BROWSER_STATE_PATH || (process.platform === 'win32' ? 'C:\\data\\browser\\storageState.json' : '/data/browser/storageState.json');
const SCREENSHOT_DIR = process.env.SCREENSHOT_DIR || (process.platform === 'win32' ? 'C:\\data\\browser\\screenshots' : '/logs/screenshots');

// 确保截图目录存在
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

/**
 * 启动 headless 浏览器并复用登录态
 */
async function launchBrowser() {
  if (!fs.existsSync(STORAGE_STATE_PATH)) {
    throw new Error(`storageState 文件不存在: ${STORAGE_STATE_PATH}`);
  }

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const context = await browser.newContext({
    storageState: STORAGE_STATE_PATH,
    viewport: { width: 1280, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });

  const page = await context.newPage();
  return { browser, context, page };
}

/**
 * 截图
 */
async function takeScreenshot(page, label) {
  const filename = `${label}_${Date.now()}.png`;
  const filepath = path.join(SCREENSHOT_DIR, filename);
  await page.screenshot({ path: filepath, fullPage: true });
  console.log(`[Dashboard] 截图: ${filepath}`);
  return filepath;
}

/**
 * 从页面文本中提取指标（正则匹配）
 */
function extractMetric(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const value = match[1].replace(/[,\s¥元]/g, '');
      const num = parseFloat(value);
      return isNaN(num) ? match[1] : num;
    }
  }
  return null;
}

/**
 * 尝试从 DOM 中精确读取数据
 */
async function scrapeMetrics(page) {
  const metrics = {
    todayOrders: null,
    todayGMV: null,
    pendingShipment: null,
    refundCount: null,
  };

  try {
    // 等待页面完全加载（网络请求完成）
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(3000);

    const rawText = await page.evaluate(() => document.body?.innerText || '');

    // 今日订单数
    metrics.todayOrders = extractMetric(rawText, [
      /今日(?:订单|新增订单)[^\d]*(\d+)/,
      /今日[^\d]*(\d+)\s*单/,
    ]);

    // 今日 GMV
    metrics.todayGMV = extractMetric(rawText, [
      /今日(?:成交额|GMV|支付金额)[^\d¥]*¥?([\d,.]+)/,
      /¥\s*([\d,.]+)\s*(?:元)?/,
    ]);

    // 待发货
    metrics.pendingShipment = extractMetric(rawText, [
      /待发货[^\d]*(\d+)/,
      /待处理[^\d]*(\d+)/,
    ]);

    // 退款/售后
    metrics.refundCount = extractMetric(rawText, [
      /(?:退款|售后|售后处理)[^\d]*(\d+)/,
    ]);

    return metrics;
  } catch (e) {
    console.error(`[Dashboard] 指标提取异常: ${e.message}`);
    return metrics;
  }
}

/**
 * 主函数
 */
async function main() {
  const result = {
    ok: false,
    url: '',
    title: '',
    metrics: { todayOrders: null, todayGMV: null, pendingShipment: null, refundCount: null },
    rawTextSample: '',
    screenshot: '',
    keywords: [],
  };

  const { browser, page } = await launchBrowser();

  try {
    console.log('[Dashboard] 正在打开抖店后台...');
    await page.goto(DOUDIAN_BACKEND_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(5000);

    result.url = page.url();
    result.title = await page.title();

    // 截图
    result.screenshot = await takeScreenshot(page, 'dashboard');

    // 检测关键词
    const bodyText = await page.evaluate(() => document.body?.innerText || '');
    result.rawTextSample = bodyText.substring(0, 1000);

    // 保存完整文本和HTML供分析
    const ts = Date.now();
    const textPath = path.join(SCREENSHOT_DIR, `dashboard_text_${ts}.txt`);
    fs.writeFileSync(textPath, bodyText, 'utf8');
    console.log(`[Dashboard] 页面文本已保存: ${textPath}`);

    const htmlPath = path.join(SCREENSHOT_DIR, `dashboard_html_${ts}.html`);
    const htmlContent = await page.content();
    fs.writeFileSync(htmlPath, htmlContent, 'utf8');
    console.log(`[Dashboard] 页面HTML已保存: ${htmlPath}`);

    const keywordList = ['订单', '商品', '数据中心', 'GMV', '待发货', '退款', '售后', '资产', '店铺'];
    result.keywords = keywordList.filter(kw => bodyText.includes(kw));

    const isBackend = !result.url.includes('login') && !result.url.includes('passport') && result.keywords.length > 0;
    result.ok = isBackend;

    // 提取指标
    if (isBackend) {
      result.metrics = await scrapeMetrics(page);

      // 如果关键指标为空，尝试进入电商罗盘
      if (!result.metrics.todayOrders && !result.metrics.todayGMV) {
        console.log('[Dashboard] 首页未找到指标，尝试进入电商罗盘...');
        try {
          await page.goto('https://compass.jinritemai.com/shop', { waitUntil: 'domcontentloaded', timeout: 30000 });
          await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
          await page.waitForTimeout(5000);
          await takeScreenshot(page, 'compass');

          const compassText = await page.evaluate(() => document.body?.innerText || '');
          console.log(`[Dashboard] 电商罗盘文本(前500字): ${compassText.substring(0, 500)}`);

          // 从电商罗盘再次提取
          const compassMetrics = await scrapeMetrics(page);
          // 只覆盖 null 值
          for (const key of Object.keys(result.metrics)) {
            if (!result.metrics[key] && compassMetrics[key]) {
              result.metrics[key] = compassMetrics[key];
            }
          }
        } catch (e) {
          console.log(`[Dashboard] 进入电商罗盘失败: ${e.message}`);
        }
      }
    }

    // 输出结果
    console.log('\n========== 抖店后台数据 ==========');
    console.log(`URL:           ${result.url}`);
    console.log(`页面标题:      ${result.title}`);
    console.log(`进入后台:      ${isBackend ? '是' : '否'}`);
    console.log(`可见关键词:    ${result.keywords.join(', ') || '无'}`);
    console.log(`截图路径:      ${result.screenshot}`);
    console.log(`\n指标:`);
    console.log(`  今日订单:   ${result.metrics.todayOrders ?? '未提取到'}`);
    console.log(`  今日GMV:    ${result.metrics.todayGMV ?? '未提取到'}`);
    console.log(`  待发货:     ${result.metrics.pendingShipment ?? '未提取到'}`);
    console.log(`  退款/售后:  ${result.metrics.refundCount ?? '未提取到'}`);
    console.log('\nJSON 输出:');
    console.log(JSON.stringify({
      ok: result.ok,
      url: result.url,
      title: result.title,
      metrics: result.metrics,
      rawTextSample: result.rawTextSample,
    }, null, 2));
    console.log('===================================\n');

  } catch (e) {
    result.ok = false;
    result.error = e.message;
    console.error(`[Dashboard] 错误: ${e.message}`);
    try { await takeScreenshot(page, 'dashboard_error'); } catch (_) {}
  } finally {
    await browser.close();
  }

  return result;
}

main().catch(e => {
  console.error('[Dashboard] 致命错误:', e);
  process.exit(1);
});
