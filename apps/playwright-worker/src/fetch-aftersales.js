#!/usr/bin/env node
const { launchPersistentBrowser, setupNetworkInterceptor, saveScreenshot, writeDoudianJSON, genOpSummary, log, now, today } = require('./lib');
const path = require('path');
const fs = require('fs');
const AFTERSALES_URL = 'https://fxg.jinritemai.com/ffa/g/after-sale/list';
const REFUND_API_KEYWORDS = ['refund','after','aftersale','after_sale'];
async function main() {
  log('fetch-aftersales','INFO','启动售后数据获取 (人工辅助模式)...');
  const startTime = Date.now();
  const browserContext = await launchPersistentBrowser();
  const page = await browserContext.newPage();
  const captured = setupNetworkInterceptor(page,'fetch-aftersales');
  let refunds = [];
  let apiDataCaptured = false;
  page.on('response', async (res) => {
    const url = res.url();
    if (REFUND_API_KEYWORDS.some(k=>url.toLowerCase().includes(k))){
      try{
        const body=await res.json().catch(()=>null);
        if(body&&Array.isArray(body.data?.refunds||body.data?.list||body.refunds||body.list)){
          const items=body.data?.refunds||body.data?.list||body.refunds||body.list||[];
          refunds=items;apiDataCaptured=true;
          log('fetch-aftersales','OK',`API捕获售后数据: ${items.length} 条`);
          writeDoudianJSON('aftersales',{type:'aftersales',timestamp:now(),date:today(),source:'network-intercept',url,count:items.length,refunds:items.slice(0,50),total:body.data?.total||items.length});
        }
      }catch{}
    }
  });
  try {
    log('fetch-aftersales','INFO',`导航到售后页面: ${AFTERSALES_URL}`);
    await page.goto(AFTERSALES_URL,{waitUntil:'domcontentloaded',timeout:60000});
    log('fetch-aftersales','INFO','等待页面加载，如需操作请 now 在浏览器中进行...');
    await page.waitForTimeout(5000);
    const downloadButtons=['text=下载','text=导出','text=报表','[class*="export"]','[class*="download"]'];
    for(const sel of downloadButtons){try{await page.click(sel,{timeout:2000});log('fetch-aftersales','INFO',`点击了: ${sel}`);await page.waitForTimeout(2000);break;}catch{}}
    const ssPath=await saveScreenshot(page,'aftersales','main');
    log('fetch-aftersales','INFO',`截图已保存: ${ssPath}`);
    if(!apiDataCaptured){log('fetch-aftersales','WARN','未能通过API捕获售后数据，尝试从页面提取...');try{const bodyText=await page.innerText('body').catch(()=>'');const textPath=path.join('/opt/wecom-openclaw/logs/ocr',`aftersales_page_${Date.now()}.txt`);fs.mkdirSync(path.dirname(textPath),{recursive:true});fs.writeFileSync(textPath,bodyText,'utf-8');log('fetch-aftersales','INFO',`页面文本已保存: ${textPath}`);}catch(err){log('fetch-aftersales','WARN',`页面文本提取失败: ${err.message}`);}}
    await page.waitForTimeout(3000);
  }catch(err){log('fetch-aftersales','ERROR',`售后页面访问失败: ${err.message}`);}finally{await page.close().catch(()=>{});}
  const summary={type:'aftersales',timestamp:now(),date:today(),duration_ms:Date.now()-startTime,count:refunds.length,apiCaptured:apiDataCaptured,note:apiDataCaptured?'售后数据已通过API捕获':'请检查网络连接或手动导出'};
  writeDoudianJSON('aftersales',summary);
  console.log('\n=== 企业微信摘要 ===');
  console.log(genOpSummary({date:summary.date,refunds:summary.count,note:summary.note}));
  await browserContext.close().catch(()=>{});
}
main().catch(err=>{log('fetch-aftersales','ERROR',`Fatal: ${err.message}`);process.exit(1);});
