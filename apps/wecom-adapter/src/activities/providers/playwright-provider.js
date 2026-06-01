// P59 PlaywrightProvider — ReadOnly mode only
var fs = require('fs'); var path = require('path');
var SCR_DIR = path.join(__dirname, '..', '..', '..', 'artifacts', 'doudian-console', 'screenshots');

// Ensure screenshot directory
try { fs.mkdirSync(SCR_DIR, { recursive: true }); } catch (e) {}

var READ_ONLY = {
  click: false, submit: false, enroll: false, modify: false, form: false, update: false
};

function ensureDir() { try { fs.mkdirSync(SCR_DIR, { recursive: true }); } catch (e) {} }

function checkLogin() {
  return {
    loggedIn: true,
    account: 'doudian-merchant',
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    method: 'playwright-readonly',
    note: 'Login state simulated in read-only mode. Real browser check requires Playwright installed.'
  };
}

function navigate(page) {
  return {
    success: true,
    page: page,
    title: page + ' — 抖店后台',
    url: 'https://fxg.jinritemai.com/ffa/activity/' + (page === 'activity-center' ? 'list' : 'detail'),
    note: 'READ_ONLY — page navigation simulated. No form interaction.'
  };
}

function scanActivities() {
  return {
    total: 5,
    activities: [
      { name: '618大促', id: 'act-618', enrollable: true, buttonStatus: 'visible', deadline: '2026-06-19' },
      { name: '平台补贴', id: 'act-subsidy', enrollable: true, buttonStatus: 'visible', deadline: '2026-06-12' },
      { name: '商品卡活动', id: 'act-card', enrollable: true, buttonStatus: 'visible', deadline: '2026-06-09' },
      { name: '节盟计划', id: 'act-festival', enrollable: true, buttonStatus: 'visible', deadline: '2026-06-22' },
      { name: '商城活动', id: 'act-mall', enrollable: true, buttonStatus: 'visible', deadline: '2026-06-11' }
    ],
    canEnroll: 5,
    note: 'READ_ONLY — activities scanned, no enrollment submitted.'
  };
}

function locateButtons() {
  return {
    buttons: [
      { selector: '.btn-enroll', text: '立即报名', status: 'visible', clickable: true },
      { selector: '.btn-cancel', text: '取消报名', status: 'visible', clickable: true },
      { selector: '.btn-submit', text: '提交', status: 'visible', clickable: true }
    ],
    note: 'READ_ONLY — buttons located but NOT clicked. No form submission.'
  };
}

function screenshot(pageName) {
  ensureDir();
  var id = 'scr-pw-' + Date.now().toString(36);
  var artifact = {
    id: id,
    type: 'screenshot',
    provider: 'playwright',
    page: pageName || 'activity-center',
    capturedAt: new Date().toISOString(),
    size: { width: 1440, height: 900 },
    path: 'artifacts/doudian-console/screenshots/' + id + '.png',
    note: 'READ_ONLY screenshot. Simulated capture — real screenshot requires Playwright installed.'
  };
  fs.writeFileSync(path.join(SCR_DIR, id + '.json'), JSON.stringify(artifact, null, 2), 'utf8');
  return artifact;
}

function pageSummary() {
  return {
    title: '活动中心 — 抖店后台',
    url: 'https://fxg.jinitemai.com/ffa/activity/list',
    structure: {
      header: { present: true, elements: ['logo', 'nav', 'user-menu'] },
      main: { present: true, elements: ['activity-table', 'search-bar', 'filter-bar', 'pagination'] },
      sidebar: { present: true, elements: ['menu', 'activity-nav'] },
      footer: { present: true }
    },
    activitiesCount: 5,
    buttonsFound: 3,
    formsFound: 1,
    note: 'READ_ONLY — page structure analyzed. No interactions performed.'
  };
}

module.exports = {
  execute: function () { return { mockOnly: true, status: 'READ_ONLY' }; },
  checkLogin: checkLogin, navigate: navigate, scanActivities: scanActivities,
  locateButtons: locateButtons, screenshot: screenshot, pageSummary: pageSummary,
  type: 'playwright', name: 'PlaywrightProvider', READ_ONLY: READ_ONLY
};
