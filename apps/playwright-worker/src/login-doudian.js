'use strict';

/**
 * 抖店后台登录模块
 * - 检查已有登录状态（storageState）
 * - 无登录状态时打开浏览器等待手动扫码
 * - 登录成功后自动导航到抖店后台管理页面
 * - 操作失败时截图保存到 logs/screenshots
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const readline = require('readline');

const DOUDIAN_URL = 'https://fxg.jinritemai.com';
// 抖店后台管理页面
const DOUDIAN_BACKEND_URL = process.env.DOUDIAN_BACKEND_URL ||
  'https://fxg.jinritemai.com/ffa/grs-new/qualification/list?type=9&btm_ppre=a2427.b193394.c0.d0&btm_pre=a2427.b18091.c0.d0&btm_show_id=db03f0cb-0d54-40f7-b49d-eb42fd357bd8';
const STORAGE_STATE_PATH = process.env.BROWSER_STATE_PATH || '/data/browser/storageState.json';
const SCREENSHOT_DIR = process.env.SCREENSHOT_DIR || '/logs/screenshots';

// 默认手机号（可被 --phone 参数覆盖）
const DEFAULT_PHONE = process.env.DOUDIAN_PHONE || '';

// 确保截图目录存在
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

/**
 * 检查 storageState 是否存在且有效
 */
function hasValidStorageState() {
  if (!fs.existsSync(STORAGE_STATE_PATH)) return false;
  try {
    const data = JSON.parse(fs.readFileSync(STORAGE_STATE_PATH, 'utf-8'));
    return Array.isArray(data.cookies) && data.cookies.length > 0;
  } catch {
    return false;
  }
}

/**
 * 截图并保存
 */
async function saveScreenshot(page, name) {
  const filename = `${name}_${Date.now()}.png`;
  const filepath = path.join(SCREENSHOT_DIR, filename);
  try {
    await page.screenshot({ path: filepath, fullPage: true });
    console.log(`[Playwright] 截图已保存: ${filepath}`);
  } catch (e) {
    console.error(`[Playwright] 截图失败: ${e.message}`);
  }
}

/**
 * 启动浏览器，复用或创建登录状态
 */
async function launchWithState(headless = true) {
  const hasState = hasValidStorageState();
  console.log(`[Playwright] 存储状态: ${hasState ? '有效，自动复用' : '无效，需要重新登录'}`);

  const browser = await chromium.launch({
    headless,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const contextOptions = {
    viewport: { width: 1280, height: 900 },
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  };

  if (hasState) {
    contextOptions.storageState = STORAGE_STATE_PATH;
  }

  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();

  return { browser, context, page, hasState };
}

/**
 * 检查当前页面是否已登录抖店
 */
async function isLoggedIn(page) {
  try {
    await page.goto(DOUDIAN_BACKEND_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const url = page.url();
    console.log(`[Playwright] 当前 URL: ${url}`);

    // 被重定向到登录页
    if (url.includes('login') || url.includes('passport') || url.includes('sso')) {
      // 页面可能还需要继续跳转到OAuth，等一下
      await page.waitForTimeout(3000);
      console.log(`[Playwright] 重定向后 URL: ${page.url()}`);
      return false;
    }

    // URL 没有跳转，进一步验证页面内容
    await page.waitForTimeout(3000);

    const pageTitle = await page.title().catch(() => '');
    const bodyText = await page.evaluate(() => document.body?.innerText?.substring(0, 500) || '').catch(() => '');
    console.log(`[Playwright] 页面标题: "${pageTitle}"`);
    console.log(`[Playwright] 页面文本(前500字): "${bodyText.substring(0, 200)}..."`);

    // 检查是否有登录相关的强特征
    if (bodyText.includes('扫码登录') || bodyText.includes('请登录') || bodyText.includes('账号密码登录')) {
      console.log('[Playwright] 页面包含登录相关文字，判定为未登录');
      return false;
    }

    // 检查页面是否为空白或无有效内容
    if (!bodyText || bodyText.trim().length < 50) {
      console.log('[Playwright] 页面内容为空或过少，判定为未登录');
      return false;
    }

    // 检查是否有后台管理页面的典型元素
    const hasBackendContent = await page.evaluate(() => {
      const selectors = ['商品', '订单', '数据中心', '店铺', '营销', '资产'];
      const text = document.body?.innerText || '';
      return selectors.some(s => text.includes(s));
    }).catch(() => false);

    if (!hasBackendContent) {
      console.log('[Playwright] 页面没有后台管理特征元素，判定为未登录');
      return false;
    }

    return true;
  } catch (e) {
    console.error(`[Playwright] 检查登录状态失败: ${e.message}`);
    return false;
  }
}

/**
 * 保存登录状态到文件
 */
async function saveLoginState(context) {
  try {
    const dir = path.dirname(STORAGE_STATE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    await context.storageState({ path: STORAGE_STATE_PATH });
    console.log(`[Playwright] 登录状态已保存: ${STORAGE_STATE_PATH}`);
  } catch (e) {
    console.error(`[Playwright] 保存登录状态失败: ${e.message}`);
  }
}

/**
 * 导航到抖店后台管理页面
 */
async function navigateToBackend(page) {
  console.log(`[Playwright] 正在导航到抖店后台...`);
  await page.goto(DOUDIAN_BACKEND_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  const url = page.url();
  console.log(`[Playwright] 后台 URL: ${url}`);
  await page.waitForTimeout(2000);
  return url;
}

/**
 * SMS 验证码登录流程（headless 友好）
 * 1. 打开抖店登录页
 * 2. 确保在手机登录 Tab
 * 3. 填入手机号 → 点击发送验证码
 * 4. 等待用户从 stdin 输入验证码
 * 5. 自动填入并提交
 */
async function smsLogin(page, phone) {
  // 1. 导航到登录页
  const LOGIN_URL = 'https://fxg.jinritemai.com/login/common';
  console.log('[SMS] 正在打开登录页...');
  await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);
  await saveScreenshot(page, 'sms_login_page');
  console.log(`[SMS] 当前 URL: ${page.url()}`);

  // 2. 确保在手机登录 tab
  const bodyText = await page.evaluate(() => document.body?.innerText?.substring(0, 500) || '');
  if (bodyText.includes('邮箱登录')) {
    // 已经在手机登录页面，无需切换
    console.log('[SMS] 当前已是手机登录页面');
  } else if (bodyText.includes('手机登录')) {
    // 点击手机登录 tab
    try {
      await page.evaluate(() => {
        const el = [...document.querySelectorAll('div, span, a, button')]
          .find(e => e.textContent?.trim() === '手机登录' && e.offsetParent !== null);
        if (el) el.click();
      });
      await page.waitForTimeout(1000);
      console.log('[SMS] 已切换到手机登录');
    } catch {
      console.log('[SMS] 未找到手机登录 tab，可能已在该页面');
    }
  }

  await saveScreenshot(page, 'sms_phone_tab');
  await page.waitForTimeout(1000);

  // 3. 查找手机号输入框并填入
  const phoneInput = await page.$('input[name="mobile"], input[type="tel"]');
  if (phoneInput) {
    await phoneInput.click({ clickCount: 3 });
    await phoneInput.fill('');
    await phoneInput.fill(phone);
    console.log('[SMS] 已填入手机号');
  } else {
    // 备选：找第一个可见 input
    const allInputs = await page.$$('input');
    let found = false;
    for (const input of allInputs) {
      const visible = await input.isVisible().catch(() => false);
      if (visible) {
        await input.click();
        await input.fill('');
        await input.fill(phone);
        found = true;
        console.log('[SMS] 已填入手机号（备选 input）');
        break;
      }
    }
    if (!found) throw new Error('未找到手机号输入框');
  }

  await page.waitForTimeout(500);
  await saveScreenshot(page, 'sms_phone_filled');

  // 4. 点击发送验证码
  let sendBtnFound = false;

  // 方法1: 找包含"发送验证码"文字的按钮
  const clicked = await page.evaluate(() => {
    const els = [...document.querySelectorAll('button, a, span, div')];
    for (const el of els) {
      const text = el.textContent?.trim();
      if (text === '发送验证码' && el.offsetParent !== null) {
        el.click();
        return true;
      }
    }
    return false;
  });

  if (clicked) {
    sendBtnFound = true;
    console.log('[SMS] 已点击发送验证码');
  } else {
    console.log('[SMS] 未找到发送验证码按钮，请手动发送');
  }

  await page.waitForTimeout(2000);
  await saveScreenshot(page, 'sms_code_sent');

  // 5. 等待用户输入验证码
  const code = await new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question('[SMS] 请输入收到的短信验证码: ', (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });

  if (!code) {
    throw new Error('未输入验证码');
  }

  console.log(`[SMS] 收到验证码: ${code.substring(0, 2)}****`);

  // 6.5 勾选用户协议
  const checkbox = await page.$('input[type="checkbox"]');
  if (checkbox) {
    const checked = await checkbox.isChecked();
    if (!checked) {
      await checkbox.click();
      console.log('[SMS] 已勾选用户协议');
    } else {
      console.log('[SMS] 用户协议已勾选');
    }
  } else {
    console.log('[SMS] 未找到协议复选框，跳过');
  }

  // 7. 找到验证码输入框并填入
  const codeInput = await page.$('input[name="mobilecaptcha"]');

  if (codeInput) {
    await codeInput.click({ clickCount: 3 });
    await codeInput.fill('');
    await page.waitForTimeout(200);
    // 用 type 逐字输入
    await codeInput.type(code, { delay: 100 });
    // 手动触发 input/change 事件
    await codeInput.evaluate(el => {
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    console.log(`[SMS] 已填入验证码: ${code}`);
    // 验证填入值
    const filledValue = await codeInput.inputValue();
    console.log(`[SMS] 验证码框实际值: "${filledValue}"`);
  } else {
    throw new Error('未找到验证码输入框 (input[name=mobilecaptcha])');
  }

  await page.waitForTimeout(500);
  await saveScreenshot(page, 'sms_code_filled');

  // 保存填入后的 HTML 用于调试
  const debugHtml = await page.content();
  const htmlPath = path.join(SCREENSHOT_DIR, `sms_code_filled_${Date.now()}.html`);
  fs.writeFileSync(htmlPath, debugHtml);
  console.log(`[SMS] HTML 已保存: ${htmlPath}`);

  // 7. 提交登录 - 先尝试按 Enter，再尝试点击按钮
  console.log('[SMS] 正在提交登录...');
  
  // 监听网络请求，看登录接口返回什么
  const loginResponsePromise = page.waitForResponse(
    resp => resp.url().includes('login') && resp.status() === 200,
    { timeout: 15000 }
  ).catch(() => null);

  // 方法1: 在验证码框里按 Enter
  await codeInput.press('Enter');
  console.log('[SMS] 已在验证码框按 Enter');

  // 等待 3 秒看是否跳转
  await page.waitForTimeout(3000);
  
  let loginResp = await loginResponsePromise;
  if (loginResp) {
    try {
      const respBody = await loginResp.text();
      console.log(`[SMS] 登录接口响应: ${respBody.substring(0, 500)}`);
    } catch {
      console.log(`[SMS] 登录接口状态: ${loginResp.status()}, URL: ${loginResp.url()}`);
    }
  }

  let checkUrl = page.url();
  let isLogin = checkUrl.includes('login') || checkUrl.includes('passport');

  // Enter 没生效，尝试点击按钮
  if (isLogin) {
    console.log('[SMS] Enter 未生效，尝试点击登录按钮...');
    const loginClicked = await page.evaluate(() => {
      const els = [...document.querySelectorAll('button, a, span, div')];
      for (const el of els) {
        const text = el.textContent?.trim();
        // 精确匹配"登录"按钮，排除包含"登录即代表同意"等
        if (text === '登录' && el.offsetParent !== null) {
          el.click();
          return true;
        }
      }
      return false;
    });
    console.log(`[SMS] 点击登录按钮: ${loginClicked ? '成功' : '未找到'}`);
  }

  // 8. 等待登录结果
  console.log('[SMS] 等待登录结果（最多 30 秒）...');
  await page.waitForTimeout(5000);

  let checkUrl2 = page.url();
  let stillOnLogin = checkUrl2.includes('login') || checkUrl2.includes('passport');

  if (stillOnLogin) {
    // 可能登录失败，等久一点
    await page.waitForTimeout(10000);
  }

  await saveScreenshot(page, 'sms_login_result');

  const finalUrl = page.url();
  const finalIsLogin = finalUrl.includes('login') || finalUrl.includes('passport');

  if (finalIsLogin) {
    // 检查页面是否有错误提示 - 打印更多页面信息
    const pageDebug = await page.evaluate(() => {
      const body = document.body?.innerText || '';
      return {
        url: window.location.href,
        title: document.title,
        bodySnippet: body.substring(0, 1000),
      };
    });
    console.log(`[SMS] 登录失败 - 页面调试信息: ${JSON.stringify(pageDebug)}`);

    // 保存失败页面的 HTML
    const failHtml = await page.content();
    const failHtmlPath = path.join(SCREENSHOT_DIR, `sms_login_fail_${Date.now()}.html`);
    fs.writeFileSync(failHtmlPath, failHtml);
    console.log(`[SMS] 失败页面 HTML: ${failHtmlPath}`);

    throw new Error(`登录失败，当前 URL: ${finalUrl}`);
  }

  console.log(`[SMS] ✅ 登录成功！跳转至: ${finalUrl}`);
  return true;
}

/**
 * 主入口 - 检查并确保登录状态
 * @param {boolean} interactive 是否允许交互（弹出浏览器窗口）
 * @param {object} options 额外选项
 */
async function ensureLoggedIn(interactive = false, options = {}) {
  const { sms, phone } = options;
  const { browser, context, page, hasState } = await launchWithState(interactive);

  try {
    const loggedIn = await isLoggedIn(page);

    if (loggedIn) {
      console.log('[Playwright] ✅ 已登录，正在进入抖店后台...');
      const backendUrl = await navigateToBackend(page);
      await saveLoginState(context);
      await saveScreenshot(page, 'backend_loaded');
      console.log(`[Playwright] ✅ 已进入抖店后台: ${backendUrl}`);
      return { browser, context, page, status: 'logged_in' };
    }

    if (!interactive && !sms) {
      console.log('[Playwright] ❌ 未登录，需要交互模式重新登录');
      await saveScreenshot(page, 'login_required');
      await browser.close();
      return { browser: null, context: null, page: null, status: 'need_login' };
    }

    // SMS 短信验证码登录模式
    if (sms) {
      console.log('[Playwright] 使用短信验证码登录...');
      if (!phone) {
        throw new Error('短信登录需要手机号，请通过 --phone <手机号> 参数或 DOUDIAN_PHONE 环境变量提供');
      }
      await smsLogin(page, phone);
      await saveLoginState(context);
      const backendUrl = await navigateToBackend(page);
      await saveScreenshot(page, 'sms_login_success');
      console.log(`[Playwright] ✅ 已进入抖店后台: ${backendUrl}`);
      return { browser, context, page, status: 'login_success' };
    }

    // 交互模式：导航到后台URL，等待重定向到登录页，然后让用户手动操作
    console.log('[Playwright] 请在浏览器中完成登录...');

    // 先访问后台URL，触发登录重定向
    console.log('[Playwright] 正在访问抖店后台，等待页面加载...');
    await page.goto(DOUDIAN_BACKEND_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    let currentUrl = page.url();
    console.log(`[Playwright] 当前页面: ${currentUrl}`);

    // 截图当前页面状态
    await saveScreenshot(page, 'login_page');

    // 如果页面还在后台URL但内容空白，说明JS未加载完，等一下
    if (currentUrl === DOUDIAN_BACKEND_URL) {
      await page.waitForTimeout(3000);
      currentUrl = page.url();
    }

    console.log('[Playwright] 浏览器已打开，请查看页面并完成登录操作');

    // 尝试自动切换到扫码模式
    try {
      // 等待登录表单加载
      await page.waitForSelector('input, .account-center-input-row, [class*="login"]', { timeout: 10000 });

      // 方法1: 点击抖音图标（抖音登录=OAuth扫码登录）
      const douyinClicked = await page.evaluate(() => {
        const el = document.querySelector('span.icon.douyin');
        if (el) {
          el.click();
          return true;
        }
        // 备选：找包含"抖音"文字的按钮
        const allBtns = document.querySelectorAll('button, a, span, div');
        for (const btn of allBtns) {
          if (btn.textContent?.includes('抖音') || btn.className?.includes('douyin')) {
            btn.click();
            return true;
          }
        }
        return false;
      });

      if (douyinClicked) {
        console.log('[Playwright] 点击抖音登录图标成功');
        // 等待OAuth页面加载和二维码渲染
        await page.waitForTimeout(5000);
        await saveScreenshot(page, 'douyin_login');

        // 检查是否真的到了OAuth页面
        const oauthUrl = page.url();
        console.log(`[Playwright] OAuth页面URL: ${oauthUrl}`);
      } else {
        // 方法2: 点击二维码切换按钮
        const qrClicked = await page.evaluate(() => {
          const el = document.querySelector('.account-center-switch-button, [class*="switch"][class*="code"]');
          if (el) { el.click(); return true; }
          return false;
        });
        if (qrClicked) {
          console.log('[Playwright] 点击二维码切换按钮成功');
          await page.waitForTimeout(3000);
          await saveScreenshot(page, 'qr_mode');
        }
      }
    } catch (e) {
      console.log(`[Playwright] 自动切换扫码失败: ${e.message}`);
    }

    console.log('[Playwright] 提示：如果页面显示手机号登录，请点击"抖音"图标或右上角的二维码图标切换到扫码登录');
    console.log('[Playwright] 等待登录完成（最多 180 秒）...');

    // 等待跳转到非登录页面（登录成功后会被重定向回来）
    // 使用轮询方式避免waitForFunction的timeout问题
    const maxWaitMs = 180000;
    const checkInterval = 2000;
    const startTime = Date.now();
    let loggedInUrl = null;

    while (Date.now() - startTime < maxWaitMs) {
      const href = page.url();
      const isBackend = href.includes('/ffa/') || href.includes('/grs-new/');
      const isLoginPage = href.includes('login') || href.includes('passport') || href.includes('sso') || href.includes('open.douyin.com');

      if (isBackend && !isLoginPage) {
        loggedInUrl = href;
        break;
      }

      // 每10秒截图一次，方便用户确认状态
      if ((Date.now() - startTime) % 10000 < checkInterval) {
        await saveScreenshot(page, `waiting_${Math.floor((Date.now() - startTime) / 1000)}s`);
      }

      await page.waitForTimeout(checkInterval);
    }

    if (!loggedInUrl) {
      throw new Error('等待登录超时，180秒内未完成扫码登录');
    }

    console.log('[Playwright] ✅ 登录成功！正在进入后台...');
    await saveLoginState(context);

    // 登录成功后自动导航到后台
    const backendUrl = await navigateToBackend(page);
    await saveScreenshot(page, 'login_success');

    console.log(`[Playwright] ✅ 已进入抖店后台: ${backendUrl}`);
    return { browser, context, page, status: 'login_success' };
  } catch (e) {
    console.error(`[Playwright] 操作失败: ${e.message}`);
    await saveScreenshot(page, 'error');
    await browser.close();
    return { browser: null, context: null, page: null, status: 'error', error: e.message };
  }
}

// 直接运行此脚本时，执行登录检查
if (require.main === module) {
  const args = process.argv.slice(2);
  const interactive = args.includes('--interactive');
  const sms = args.includes('--sms');
  const phoneIdx = args.indexOf('--phone');
  const phone = phoneIdx !== -1 && args[phoneIdx + 1] ? args[phoneIdx + 1] : DEFAULT_PHONE;

  console.log(`[Playwright] 启动登录检查，交互模式: ${interactive}, 短信模式: ${sms}${phone ? ', 手机号: ' + phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2') : ''}`);

  ensureLoggedIn(interactive, { sms, phone })
    .then(async ({ browser, status }) => {
      console.log(`[Playwright] 最终状态: ${status}`);
      if (browser) await browser.close();
      process.exit(status === 'error' ? 1 : 0);
    })
    .catch((e) => {
      console.error('[Playwright] 致命错误:', e);
      process.exit(1);
    });
}

module.exports = { ensureLoggedIn, isLoggedIn, saveLoginState, launchWithState, navigateToBackend };
