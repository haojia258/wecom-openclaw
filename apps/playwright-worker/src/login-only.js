#!/usr/bin/env node
/**
 * login-only.js
 * 仅打开浏览器 + 等待人工完成 SMS 登录，登录成功后自动退出并保存 cookies。
 * 用法: DISPLAY=:99 HEADLESS=false node src/login-only.js
 *       DISPLAY=:99 HEADLESS=false LOGIN_WAIT_MS=300000 node src/login-only.js
 */
const { launchPersistentBrowser, log } = require('./lib');
const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const WAIT_MS = parseInt(process.env.LOGIN_WAIT_MS || '600000', 10); // default 10 min
const TARGET_URL = 'https://fxg.jinritemai.com/ffa/g/product/list';

// 登录页关键词（仍在登录页会看到这些）
const LOGIN_INDICATORS = [
  '发送验证码', '手机登录', '邮箱登录', '登录即代表同意',
];

// 登录成功关键词（只要出现任意一个就认为已登录）
const DASHBOARD_INDICATORS = [
  '商品管理', '订单管理', '数据中心', '售后管理', '抖店工作台',
  '首页', '概况', '经营概况',
];

async function main() {
  console.log(`\n[LOGIN] 启动登录助手`);
  console.log(`[LOGIN] Profile: 使用 lib.js STORAGE_PROFILE`);
  console.log(`[LOGIN] 最长等待: ${Math.round(WAIT_MS / 1000)}s`);
  console.log(`[LOGIN] 目标: 检测到登录成功后自动保存 cookies 并退出\n`);

  const context = await launchPersistentBrowser({ profileDir: undefined }); // 使用默认 profile
  const page = context.pages()[0] || await context.newPage();

  console.log('[LOGIN] 浏览器已启动，正在导航到抖店...');

  await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(3000);

  console.log('[LOGIN] >>> 请在浏览器中完成短信验证码登录 <<<');
  console.log(`[LOGIN] 脚本每 5 秒检测一次，最长等待 ${Math.round(WAIT_MS / 1000)} 秒\n`);

  const startTime = Date.now();
  let loggedIn = false;
  let prevBodyLen = 0;

  while (Date.now() - startTime < WAIT_MS) {
    await page.waitForTimeout(5000);
    const elapsed = Math.round((Date.now() - startTime) / 1000);

    try {
      const bodyText = await page.evaluate(() => document.body?.innerText || '');
      const bodyLen = bodyText.length;

      if (bodyLen < 50) {
        console.log(`[LOGIN] 页面渲染中... (${elapsed}s)`);
        prevBodyLen = bodyLen;
        continue;
      }

      const hasLoginInd = LOGIN_INDICATORS.some(ind => bodyText.includes(ind));
      const hasDashInd = DASHBOARD_INDICATORS.some(ind => bodyText.includes(ind));

      // 调试输出（前 15 秒）
      if (elapsed <= 15) {
        const matchedLogin = LOGIN_INDICATORS.filter(i => bodyText.includes(i));
        const matchedDash = DASHBOARD_INDICATORS.filter(i => bodyText.includes(i));
        console.log(`[LOGIN] DEBUG (${elapsed}s) bodyLen=${bodyLen} loginInd=[${matchedLogin}] dashInd=[${matchedDash}] url=${page.url().slice(0, 80)}`);
      }

      // 关键修复：hasDashInd 为真即认为登录成功，不要求 !hasLoginInd
      // （某些页面底部可能同时出现登录相关文字）
      if (hasDashInd) {
        const matched = DASHBOARD_INDICATORS.find(i => bodyText.includes(i));
        console.log(`\n[LOGIN] ✅ 检测到后台页面! (找到: ${matched})`);
        console.log(`[LOGIN] ✅ 当前 URL: ${page.url()}`);
        console.log(`[LOGIN] ✅ 耗时: ${elapsed}s`);
        loggedIn = true;
        break;
      }

      if (hasLoginInd) {
        const ind = LOGIN_INDICATORS.find(i => bodyText.includes(i));
        console.log(`[LOGIN] 等待登录中... (${elapsed}s, 仍在登录页: "${ind}")`);
      } else if (bodyLen !== prevBodyLen) {
        console.log(`[LOGIN] 等待登录中... (${elapsed}s, 页面长度: ${bodyLen}, url=${page.url().slice(0, 80)})`);
      } else {
        console.log(`[LOGIN] 等待登录中... (${elapsed}s)`);
      }

      prevBodyLen = bodyLen;
    } catch (err) {
      console.log(`[LOGIN] 检测异常: ${err.message} (${elapsed}s)`);
    }
  }

  if (!loggedIn) {
    console.log(`\n[LOGIN] ⏰ 等待超时 (${Math.round(WAIT_MS / 1000)}s)，未检测到登录成功`);
    console.log('[LOGIN] cookies 未变化，退出');
  } else {
    console.log('[LOGIN] 等待 cookies 写入...');
    await page.waitForTimeout(3000);
    console.log('[LOGIN] ✅ Cookies 已保存到 profile');
  }

  await context.close();
  console.log('[LOGIN] 浏览器已关闭');
}

main().catch(err => {
  console.error('[LOGIN] Fatal:', err.message);
  process.exit(1);
});
