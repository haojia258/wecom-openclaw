#!/usr/bin/env node
const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const ctx = await chromium.launchPersistentContext('/opt/wecom-openclaw/storage/browser-profile', {
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    viewport: { width: 1440, height: 900 },
  });
  const page = ctx.pages()[0] || await ctx.newPage();

  const apiResponses = [];
  page.on('response', async (res) => {
    const url = res.url();
    const ct = res.headers()['content-type'] || '';
    if (ct.includes('json') && (url.includes('jinritemai') || url.includes('api') || url.includes('order'))) {
      try {
        const body = await res.json().catch(() => null);
        if (body) {
          apiResponses.push({
            url: url.substring(0, 150),
            status: res.status(),
            code: body.code,
            has_data: !!body.data,
            data_keys: body.data ? Object.keys(body.data).slice(0, 10) : [],
          });
        }
      } catch {}
    }
  });

  console.log('[1] nav to order-manage...');
  await page.goto('https://fxg.jinritemai.com/ffa/forder/order-manage', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(5000);

  console.log('[2] page URL:', page.url());

  const frames = page.frames();
  console.log('[3] Frames count:', frames.length);
  for (const f of frames) {
    const txt = await f.evaluate(() => document.body?.innerText?.substring(0, 200) || 'EMPTY').catch(() => 'ERR');
    console.log('  Frame: "' + f.name() + '" url=' + f.url().substring(0, 100) + ' text=' + txt.substring(0, 80));
  }

  console.log('[4] wait 15s for SPA...');
  await page.waitForTimeout(15000);

  const frames2 = page.frames();
  console.log('[5] Frames after load:', frames2.length);
  for (const f of frames2) {
    const txt = await f.evaluate(() => document.body?.innerText?.substring(0, 300) || 'EMPTY').catch(() => 'ERR');
    console.log('  Frame: "' + f.name() + '" url=' + f.url().substring(0, 120));
    console.log('    Text(' + txt.length + '): ' + txt.substring(0, 200));
  }

  for (const f of frames2) {
    if (f === page.mainFrame()) continue;
    try {
      const txt = await f.evaluate(() => document.body?.innerText || '');
      if (txt.includes('\u8ba2\u5355') && txt.length > 200) {
        console.log('\n[6] Found order content in Frame: "' + f.name() + '"');
        console.log(txt.substring(0, 500));
      }
    } catch {}
  }

  console.log('\n[7] Try direct API calls...');
  const apiPaths = [
    { path: '/v1/order/orderList/search', method: 'POST', body: { page: 1, page_size: 10 } },
    { path: '/api/order/search', method: 'POST', body: { page: 1, size: 10 } },
    { path: '/order/list', method: 'POST', body: { page: 1, size: 10 } },
    { path: '/v1/order/list', method: 'POST', body: { page: 1, size: 10 } },
    { path: '/business_api/order/list', method: 'POST', body: { page: 1, size: 10 } },
    { path: '/v1/aftersale/list', method: 'POST', body: { page: 1, size: 10 } },
    { path: '/v1/order/orderList/search', method: 'GET', body: null },
  ];

  for (const api of apiPaths) {
    try {
      const r = await page.evaluate(async ({ path, method, body }) => {
        const opts = { method, headers: { 'Content-Type': 'application/json' } };
        if (body) opts.body = JSON.stringify(body);
        const resp = await fetch(path, opts).catch(e => null);
        if (!resp) return { error: 'fetch_failed' };
        const data = await resp.json().catch(() => ({ parse_error: true }));
        return { status: resp.status, code: data?.code, has_data: !!data?.data, data_keys: data?.data ? Object.keys(data.data).slice(0, 10) : [], msg: data?.message?.substring(0, 100) };
      }, api);
      console.log('  ' + api.method + ' ' + api.path + ': status=' + r.status + ' code=' + r.code + ' has_data=' + r.has_data + (r.msg ? ' msg=' + r.msg : '') + (r.data_keys?.length ? ' keys=[' + r.data_keys.join(',') + ']' : ''));
    } catch(e) {
      console.log('  ' + api.path + ': ERR ' + e.message);
    }
  }

  console.log('\n[8] Captured API calls:');
  for (const api of apiResponses) {
    console.log('  ' + api.status + ' ' + api.url + ' code=' + api.code + ' keys=[' + api.data_keys.join(',') + ']');
  }

  await page.screenshot({ path: '/tmp/detect_frames.png', fullPage: false }).catch(() => {});
  console.log('\n[DONE]');
  await ctx.close();
})();
