#!/usr/bin/env node
/**
 * check-risk.js v3
 * 风险巡检 — 登录有效性、验证码、违规/处罚/保证金/资质预警
 * v3: 修复 false-positive "违规提醒"（侧边栏菜单干扰）
 * Dry-run only，不执行任何修复操作
 *
 * 用法:
 *   DISPLAY=:99 HEADLESS=false node src/check-risk.js
 *   DEBUG=true node src/check-risk.js
 *   node src/check-risk.js --login-only   # 仅检测登录态
 */

const { launchPersistentBrowser, saveScreenshot, writeDoudianJSON, log, now, today } = require('./lib');
const path = require('path');
const fs = require('fs');

const DASHBOARD_URL = 'https://fxg.jinritemai.com/ffa/g/product/list';
const RISK_URL = 'https://fxg.jinritemai.com/ffa/g/risk-notice';
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
    log('check-risk', 'OK', `登录态缓存有效 (${Math.round(cacheAge / 1000)}s前)`);
    return true;
  }
  try {
    await page.goto(DASHBOARD_URL, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(3000);
    const bodyText = await page.evaluate(() => document.body?.innerText || '');
    const hasLoginInd = ['发送验证码', '手机登录', '邮箱登录'].some(k => bodyText.includes(k));
    const hasDashInd = ['商品管理', '商品列表', '出售中'].some(k => bodyText.includes(k));
    if (hasLoginInd && !hasDashInd) {
      log('check-risk', 'ERROR', 'Cookies 已过期! 请运行 login-only.js');
      saveLoginCache(false);
      return false;
    }
    saveLoginCache(true);
    log('check-risk', 'OK', '登录态有效');
    return true;
  } catch (e) {
    log('check-risk', 'WARN', `登录检测异常: ${e.message}`);
    return false;
  }
}

/**
 * 等待页面加载稳定
 */
async function waitPage(page, maxWaitMs = 10000) {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    try { await page.waitForLoadState('networkidle', { timeout: 6000 }); } catch {}
    await page.waitForTimeout(2000);
    const txt = await page.evaluate(() => document.body?.innerText?.substring(0, 500) || '');
    if (txt.includes('商品') || txt.includes('风险') || txt.includes('违规')) return true;
  }
  return false;
}

/**
 * v3: 更精准的违规检测
 * 策略：
 *   1. 先尝试定位内容区 DOM，排除侧边栏
 *   2. 检测具体的违规记录（有违规类型 + 时间 + 处置方式才算真实违规）
 *   3. 仅关键词命中但无具体内容时，标记为 warn 而非 error
 */
async function detectViolations(page, fullText) {
  // 在页面上下文中执行更精准的检测
  const result = await page.evaluate(() => {
    const violations = [];

    // 辅助：获取"主要内容区"文字（排除侧边栏/导航）
    function getMainContentText() {
      // 尝试找内容区容器
      const selectors = [
        '.content-area', '.main-content', '.page-content',
        '[class*="content"]', 'main', '.app-content',
      ];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el) return el.innerText || '';
      }
      // fallback: 排除侧边栏文字
      const sidebar = document.querySelector('.sidebar, [class*="sidebar"], [class*="nav"], [class*="menu"]');
      const sidebarText = sidebar ? sidebar.innerText : '';
      const bodyText = document.body.innerText || '';
      // 简单去侧边栏：如果侧边栏文字较短，从 body 中"减掉"它
      if (sidebarText.length < 500) {
        return bodyText.replace(sidebarText, '');
      }
      return bodyText;
    }

    const mainText = getMainContentText();

    // 真实违规指示词（需要同时出现才认定）
    const realViolationPatterns = [
      /违规[：:].{0,30}(商品|直播|短视频|达人)/,
      /扣除\d+分/,
      /累计扣分\s*\d+/,
      /店铺清退/,
      /节点处罚/,
      /禁止营业/,
    ];

    // 违规提示词（仅提示，不一定是当前违规）
    const warningPatterns = [
      '违规提醒',
      '违规预警',
      '注意违规',
    ];

    let hasRealViolation = false;
    let hasWarning = false;

    for (const pattern of realViolationPatterns) {
      if (pattern.test(mainText)) {
        hasRealViolation = true;
        violations.push({
          type: 'violation-detail',
          severity: 'error',
          detail: `检测到具体违规内容: ${mainText.match(pattern)?.[0] || pattern.source}`,
          source: 'main-content',
        });
      }
    }

    // 检查是否有违规记录列表（table 中有违规相关行）
    const tables = document.querySelectorAll('table tbody tr');
    let violationRowCount = 0;
    tables.forEach(tr => {
      const rowText = tr.innerText || '';
      if (rowText.includes('违规') && (rowText.includes('扣分') || rowText.includes('处罚') || rowText.includes('禁售'))) {
        violationRowCount++;
        violations.push({
          type: 'violation-record',
          severity: 'error',
          detail: `违规记录: ${rowText.substring(0, 100)}`,
          source: 'table-row',
        });
      }
    });

    // 如果没有真实违规记录，但侧边栏有"违规提醒"菜单，不算违规
    if (!hasRealViolation && violationRowCount === 0) {
      // 仅全页包含"违规"关键词，可能是菜单项
      const bodyText = document.body.innerText || '';
      if (bodyText.includes('违规提醒') && !bodyText.includes('扣除') && !bodyText.includes('处罚')) {
        return { violations: [], riskLevel: 'low', hasWarning: false, hasRealViolation: false };
      }
    }

    // 有违规记录
    if (violations.length > 0) {
      return { violations, riskLevel: 'high', hasRealViolation: true };
    }

    return { violations: [], riskLevel: 'low', hasRealViolation: false };
  });

  return result;
}

async function checkRisk(page) {
  const risks = [];
  let riskLevel = 'low';

  try {
    await page.goto(RISK_URL, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
    await waitPage(page);

    if (DEBUG) await saveScreenshot(page, 'check-risk', 'risk');

    const fullText = await page.evaluate(() => document.body?.innerText || '');
    const url = page.url();

    // v3: 使用更精准的违规检测
    const violationResult = await detectViolations(page, fullText);

    // 合并违规检测结果
    if (violationResult.violations.length > 0) {
      risks.push(...violationResult.violations);
      riskLevel = violationResult.riskLevel;
    }

    // 处罚/扣分检测（保留原有逻辑，作为补充）
    if (fullText.includes('处罚') || fullText.includes('扣分')) {
      // 进一步确认：是否有具体处罚内容
      const hasSpecificPenalty = /处罚[：:].{0,50}/.test(fullText) || /扣\s*\d+\s*分/.test(fullText);
      if (hasSpecificPenalty) {
        risks.push({ type: 'penalty', severity: 'error', detail: '检测到具体处罚/扣分记录' });
        riskLevel = 'high';
      }
    }

    // 保证金检测
    if (fullText.includes('保证金不足') || fullText.includes('保证金预警')) {
      risks.push({ type: 'margin', severity: 'error', detail: '保证金不足或预警' });
      riskLevel = 'high';
    } else if (fullText.includes('保证金')) {
      // 仅出现"保证金"关键词，可能是菜单项，需要更多确认
      const mainText = await page.evaluate(() => {
        const el = document.querySelector('.content-area, main, .page-content');
        return el ? el.innerText : document.body.innerText;
      });
      if (mainText.includes('保证金不足') || mainText.includes('请补缴')) {
        risks.push({ type: 'margin', severity: 'error', detail: '保证金不足' });
        riskLevel = 'high';
      } else if (mainText.includes('保证金') && (mainText.includes('缴纳') || mainText.includes('补缴'))) {
        risks.push({ type: 'margin', severity: 'warn', detail: '检测到保证金相关提醒' });
        if (riskLevel !== 'high') riskLevel = 'medium';
      }
    }

    // 资质检测
    if (fullText.includes('资质到期') || fullText.includes('资质即将到期')) {
      risks.push({ type: 'qualification', severity: 'error', detail: '资质即将到期' });
      riskLevel = 'high';
    } else if (fullText.includes('资质')) {
      const mainText = await page.evaluate(() => {
        const el = document.querySelector('.content-area, main, .page-content');
        return el ? el.innerText : '';
      });
      if (mainText.includes('资质') && (mainText.includes('到期') || mainText.includes('审核失败'))) {
        risks.push({ type: 'qualification', severity: 'warn', detail: '检测到资质提醒' });
        if (riskLevel !== 'high') riskLevel = 'medium';
      }
    }

    // 验证码检测（当前页面）
    const hasCaptcha = fullText.includes('验证码') || fullText.includes('滑块') || url.includes('captcha');

    return { risks, riskLevel, hasCaptcha, pageUrl: url, violationDetail: violationResult };
  } catch (e) {
    return { risks, riskLevel: 'unknown', error: e.message };
  }
}

async function main() {
  const args = process.argv.slice(2);
  const loginOnly = args.includes('--login-only');

  log('check-risk', 'INFO', `=== check-risk v3 启动 (loginOnly=${loginOnly}) ===`);
  const startTime = Date.now();

  loadLoginCache();

  const browserContext = await launchPersistentBrowser();
  const page = browserContext.pages()[0] || await browserContext.newPage();

  const loggedIn = await checkLogin(page);

  if (!loggedIn) {
    writeDoudianJSON('check-risk', {
      type: 'check-risk', timestamp: now(), date: today(),
      loginValid: false, error: 'login_required', note: '请运行 login-only.js',
    });
    await browserContext.close().catch(() => {});
    process.exit(1);
  }

  if (loginOnly) {
    const output = {
      type: 'check-login', version: 3,
      timestamp: now(), date: today(),
      duration_ms: Date.now() - startTime,
      loginValid: true,
    };
    writeDoudianJSON('check-risk', output);
    console.log(JSON.stringify(output, null, 2));
    await browserContext.close().catch(() => {});
    return;
  }

  const riskResult = await checkRisk(page);

  const output = {
    type: 'check-risk',
    version: 3,
    timestamp: now(),
    date: today(),
    duration_ms: Date.now() - startTime,
    loginValid: true,
    risks: riskResult.risks,
    riskLevel: riskResult.riskLevel,
    hasCaptcha: riskResult.hasCaptcha || false,
    summary: {
      riskCount: riskResult.risks.length,
      hasError: riskResult.risks.some(r => r.severity === 'error'),
    },
  };

  writeDoudianJSON('check-risk', output);

  console.log('\n========== 风险巡检 v3 ==========');
  console.log(`风险等级: ${riskResult.riskLevel}%`);
  console.log(`风险数: ${riskResult.risks.length}`);
  riskResult.risks.forEach(r => console.log(`  [${r.severity}] ${r.type}: ${r.detail}`));
  if (riskResult.hasCaptcha) console.log('  [WARN] 当前需要验证码');
  console.log('==================================\n');

  await browserContext.close().catch(() => {});
  log('check-risk', 'OK', `v3 完成，耗时 ${Date.now() - startTime}ms`);
}

main().catch(err => {
  log('check-risk', 'ERROR', `Fatal: ${err.message}`);
  process.exit(1);
});
