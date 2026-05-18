#!/usr/bin/env node
const { launchPersistentBrowser, saveScreenshot, writeDoudianJSON, log, now, today } = require('./lib');

const ACTIVITY_URL = 'https://fxg.jinritemai.com/ffa/merchant/campaign_square';
const DEBUG = process.env.DEBUG === 'true';

async function main() {
  log('check-activity', 'INFO', '=== check-activity v5.1 启动 ===');
  const startTime = Date.now();

  const browserContext = await launchPersistentBrowser();
  const page = browserContext.pages()[0] || await browserContext.newPage();

  await page.goto(ACTIVITY_URL, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(6000);

  if (DEBUG) await saveScreenshot(page, 'check-activity', 'activity');

  const activities = await page.evaluate(() => {
    const results = [];

    function isValidActivityName(name) {
      if (!name || name.length < 5 || name.length > 100) return false;
      const uiElements = [
        'AI助手', '常用', '商品创建', '商家中心', '流量', '订单发货',
        '售后', '商品', '店铺', '用户', '资金', '应用', '展开导航',
        '活动广场', '待办事项', '营销活动托管', '活动列表', '已报名管理',
        '预防营销破价须知', '营销叠加规则', '全部活动', '可报活动',
        '收藏活动', '活动类型', '展开所有筛选',
        '去投广告', '推广管理', '广告数据', '资金管理',
        '更多玩法建设中', '查看更多玩法',
      ];
      if (uiElements.some(el => name.indexOf(el) >= 0)) return false;
      return true;
    }

    function parseCard(cardEl) {
      const text = (cardEl.innerText || '').trim();
      if (!text || text.length < 20) return null;
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      let name = null;
      for (const line of lines) {
        if (line.length >= 5 && line.length <= 100 && isValidActivityName(line)) {
          name = line;
          break;
        }
      }
      if (!name) return null;

      let deadline = null;
      let dateRange = null;
      const datePatterns = [
        /(\d{1,2}\/\d{1,2})\s*~\s*(\d{1,2}\/\d{1,2})/,
        /(\d{4}-\d{2}-\d{2})\s*[-~]\s*(\d{4}-\d{2}-\d{2})/,
        /(\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}).*/,
      ];
      for (const pattern of datePatterns) {
        const match = text.match(pattern);
        if (match) {
          if (pattern.source.indexOf('~') >= 0) {
            dateRange = match[0];
            deadline = match[2];
          } else {
            deadline = match[0];
          }
          break;
        }
      }

      let status = 'unknown';
      if (text.indexOf('已结束') >= 0 || text.indexOf('报名结束') >= 0) status = 'closed';
      else if (text.indexOf('立即报名') >= 0 || text.indexOf('去报名') >= 0) status = 'available';
      else if (text.indexOf('生效中') >= 0 || text.indexOf('进行中') >= 0) status = 'open';
      else if (text.indexOf('已报名') >= 0) status = 'signed-up';

      return { name, signupStatus: status, deadline: deadline || null, dateRange: dateRange || null, action: 'dry-run' };
    }

    const contentArea = document.querySelector('.app-content') 
                     || document.querySelector('[class*="content"]')
                     || document.querySelector('main')
                     || document.body;

    if (!contentArea) return results;

    const cardSelectors = [
      '[class*="campaign-item"]',
      '[class*="activity-item"]',
      '[class*="card-item"]',
      'table tbody tr',
      '.list-item',
      '[class*="list"] > [class*="item"]',
    ];

    for (const sel of cardSelectors) {
      const cards = contentArea.querySelectorAll(sel);
      if (cards.length > 1) {
        cards.forEach(card => {
          const act = parseCard(card);
          if (act && isValidActivityName(act.name)) {
            results.push(act);
          }
        });
        if (results.length > 0) break;
      }
    }

    if (results.length === 0) {
      const allEls = contentArea.querySelectorAll('div, li, tr');
      allEls.forEach(el => {
        const t = (el.innerText || '');
        if ((t.indexOf('立即报名') >= 0 || t.indexOf('生效中') >= 0 || t.indexOf('已报名') >= 0)
            && t.length > 30 && t.length < 500) {
          const act = parseCard(el);
          if (act && isValidActivityName(act.name)) {
            const alreadyExists = results.some(r => r.name === act.name);
            if (!alreadyExists) results.push(act);
          }
        }
      });
    }

    return results;
  });

  // 去重 + 过滤过期
  const seen = new Set();
  const nowDate = new Date();
  const currentYear = nowDate.getFullYear();

  const uniqueActivities = activities.filter(a => {
    if (!a.name || seen.has(a.name)) return false;
    seen.add(a.name);
    return true;
  });

  const activeActivities = uniqueActivities.filter(a => {
    if (!a.deadline) return true;
    const yearMatch = a.deadline.match(/(\d{4})/);
    if (yearMatch) {
      const year = parseInt(yearMatch[1]);
      if (year < currentYear) return false;
    }
    return true;
  });

  const output = {
    type: 'check-activity',
    version: 5.1,
    timestamp: now(),
    date: today(),
    duration_ms: Date.now() - startTime,
    loginStatus: 'valid',
    activities: activeActivities,
    summary: {
      availableActivities: activeActivities.filter(a => a.signupStatus === 'available').length,
      totalActivities: activeActivities.length,
      filteredExpired: uniqueActivities.length - activeActivities.length,
    },
  };

  writeDoudianJSON('check-activity', output);

  console.log('\n========== 活动检测 v5.1 ==========');
  console.log('发现活动: ' + activeActivities.length + ' (过滤过期: ' + (uniqueActivities.length - activeActivities.length) + ')');
  activeActivities.forEach(a => {
    console.log('  - ' + a.name);
    console.log('    状态: ' + a.signupStatus + ' | 截止: ' + (a.deadline || '未知'));
    if (a.dateRange) console.log('    时间: ' + a.dateRange);
  });
  console.log('===================================\n');

  await browserContext.close().catch(() => {});
  log('check-activity', 'OK', 'v5.1 完成，耗时 ' + (Date.now() - startTime) + 'ms');
}

main().catch(err => {
  log('check-activity', 'ERROR', 'Fatal: ' + err.message);
  process.exit(1);
});
