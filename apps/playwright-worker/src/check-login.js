'use strict';

/**
 * 抖店登录状态检测脚本
 * - 读取 storageState.json 复用登录态
 * - 打开抖店后台首页，判断登录是否仍然有效
 * - 失败时截图保存，并记录日志
 *
 * 判断优先级：
 *   1. URL 跳转到登录域 → 失败
 *   2. 页面出现后台导航元素 → 成功（最强信号）
 *   3. 页面出现登录强特征短语（扫码登录/请登录/账号密码登录）→ 失败
 *   4. 都没匹配 → 失败并记录页面文本供排查
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const DOUDIAN_URL = 'https://fxg.jinritemai.com';
// 抖店后台管理页面（用于检测登录是否真正有效）
const DOUDIAN_BACKEND_URL = process.env.DOUDIAN_BACKEND_URL ||
  'https://fxg.jinritemai.com/ffa/grs-new/qualification/list?type=9&btm_ppre=a2427.b193394.c0.d0&btm_pre=a2427.b18091.c0.d0&btm_show_id=db03f0cb-0d54-40f7-b49d-eb42fd357bd8';
const STORAGE_STATE_PATH = process.env.BROWSER_STATE_PATH ||
  path.join(__dirname, '..', '..', '..', 'data', 'browser', 'storageState.json');
const SCREENSHOT_DIR = process.env.SCREENSHOT_DIR ||
  path.join(__dirname, '..', '..', '..', 'logs', 'screenshots');
const LOG_FILE = process.env.LOGIN_CHECK_LOG ||
  path.join(__dirname, '..', '..', '..', 'logs', 'login-check.log');

// 确保目录存在
if (!fs.existsSync(path.dirname(LOG_FILE))) {
  fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
}
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

// URL 判断：跳转到这些域说明登录失效
const FAIL_URL_KEYWORDS = ['passport', 'sso', '/login', '/auth'];

// 成功判断：后台导航元素（selector），命中任一即视为已登录
const SUCCESS_SELECTORS = [
  'text=订单管理', 'text=商品管理', 'text=数据中心', 'text=店铺设置',
  'text=订单', 'text=商品', 'text=数据', 'text=店铺',
  // 抖店常见的导航 sidebar / tab
  '[class*="nav"] >> text=订单',
  '[class*="menu"] >> text=商品',
  '[class*="sidebar"] >> text=数据',
  '[class*="tab"] >> text=店铺',
];

// 失败强特征：只有在登录页才会出现的高置信短语
const FAIL_PAGE_PHRASES = ['扫码登录', '请登录', '账号密码登录', '验证码登录', '短信登录'];

/**
 * 写入日志
 */
function writeLog(message) {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${message}\n`;
  fs.appendFileSync(LOG_FILE, line, 'utf-8');
}

/**
 * 截图并返回路径
 */
async function takeScreenshot(page, prefix) {
  const screenshotPath = path.join(SCREENSHOT_DIR, `${prefix}-${Date.now()}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
  writeLog(`截图已保存: ${screenshotPath}`);
  return screenshotPath;
}

/**
 * 失败退出
 */
async function failExit(browser, page, reason) {
  const msg = `[FAIL] 抖店登录已失效，需要重新登录 (${reason})`;
  console.log(msg);
  writeLog(msg);
  if (page) await takeScreenshot(page, 'login-expired');
  if (browser) await browser.close().catch(() => {});
  process.exit(1);
}

/**
 * 主检测逻辑
 */
async function checkLogin() {
  writeLog('开始检测抖店登录状态');

  // 1. 检查 storageState 文件是否存在
  if (!fs.existsSync(STORAGE_STATE_PATH)) {
    failExit(null, null, `storageState 文件不存在: ${STORAGE_STATE_PATH}`);
    return;
  }

  let browser;
  try {
    // 2. 启动 chromium，复用 storageState
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const context = await browser.newContext({
      storageState: STORAGE_STATE_PATH,
      viewport: { width: 1280, height: 900 },
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });

    const page = await context.newPage();

    // 3. 打开抖店后台首页
    try {
      await page.goto(DOUDIAN_BACKEND_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    } catch (e) {
      failExit(browser, page, `页面打开失败: ${e.message}`);
      return;
    }

    // 等待页面充分渲染
    await page.waitForTimeout(3000);

    // 4. 判断 URL
    const url = page.url();
    writeLog(`当前 URL: ${url}`);

    // 检查 URL 失败关键词
    for (const kw of FAIL_URL_KEYWORDS) {
      if (url.toLowerCase().includes(kw)) {
        failExit(browser, page, `URL 包含 "${kw}" → ${url}`);
        return;
      }
    }

    // 检查域名是否还在抖店
    if (!url.includes('fxg.jinritemai.com') && !url.includes('jinritemai.com')) {
      failExit(browser, page, `URL 已离开抖店域名: ${url}`);
      return;
    }

    // 5. 优先检查成功元素（后台导航），命中即成功
    writeLog('检查后台导航元素...');
    for (const sel of SUCCESS_SELECTORS) {
      try {
        const el = await page.$(sel);
        if (el) {
          const visible = await el.isVisible().catch(() => false);
          if (visible) {
            writeLog(`成功命中: ${sel}`);
            console.log('[OK] 抖店登录状态有效');
            writeLog('[OK] 抖店登录状态有效');
            await browser.close();
            process.exit(0);
          }
        }
      } catch {
        // selector 不匹配，继续下一个
      }
    }

    // 6. 检查失败强特征短语
    writeLog('检查登录页强特征...');
    const bodyText = await page.textContent('body').catch(() => '');
    for (const phrase of FAIL_PAGE_PHRASES) {
      if (bodyText.includes(phrase)) {
        failExit(browser, page, `页面包含 "${phrase}"`);
        return;
      }
    }

    // 7. 都没匹配，记录页面文本后判定失败
    writeLog(`未匹配成功/失败特征，页面文本片段: ${bodyText.substring(0, 500)}`);
    failExit(browser, page, '未检测到后台导航元素，也无法确认登录页');
  } catch (e) {
    failExit(browser, null, `异常: ${e.message}`);
  }
}

checkLogin();
