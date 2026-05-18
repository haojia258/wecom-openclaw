#!/usr/bin/env node
const { writeDoudianJSON, log, now, today, getSubDir } = require('./lib');
const path = require('path');
const fs = require('fs');
const DOWNLOADS_DIR = '/opt/wecom-openclaw/logs/downloads';
async function main() {
  log('fetch-downloads','INFO','启动下载报表处理...');
  const startTime = Date.now();
  let files = [];
  try {
    files = fs.readdirSync(DOWNLOADS_DIR).map(f=>path.join(DOWNLOADS_DIR,f)).filter(f=>fs.statSync(f).isFile()).sort((a,b)=>fs.statSync(b).mtimeMs-fs.statSync(a).mtimeMs);
  } catch(err){log('fetch-downloads','ERROR',`无法读取下载目录: ${err.message}`);process.exit(1);}
  log('fetch-downloads','INFO',`发现 ${files.length} 个文件`);
  const csvFiles=files.filter(f=>f.endsWith('.csv'));
  const excelFiles=files.filter(f=>f.endsWith('.xlsx')||f.endsWith('.xls'));
  const parsedCSV=[];
  for(const csvFile of csvFiles.slice(0,10)){
    try{const content=fs.readFileSync(csvFile,'utf-8');const lines=content.split('\n').filter(l=>l.trim());const headers=lines[0]?.split(',').map(h=>h.trim().replace(/"/g,''))||[];const rows=lines.slice(1).map(l=>{const vals=l.split(',').map(v=>v.trim().replace(/"/g,''));const obj={};headers.forEach((h,i)=>{obj[h]=vals[i]||'';});return obj;});parsedCSV.push({file:path.basename(csvFile),headers,rowCount:rows.length,sample:rows.slice(0,3)});log('fetch-downloads','OK',`解析CSV: ${path.basename(csvFile)} (${rows.length}行)`);}catch(err){log('fetch-downloads','WARN',`CSV解析失败 ${path.basename(csvFile)}: ${err.message}`);}
  }
  const parsedExcel=[];
  if(excelFiles.length>0){try{const ExcelJS=require('exceljs');for(const excelFile of excelFiles.slice(0,5)){try{const workbook=new ExcelJS.Workbook();await workbook.xlsx.readFile(excelFile);const sheet=workbook.worksheets[0];const headers=[];const rows=[];sheet.eachRow((row,rowNum)=>{const vals=row.values.slice(1);if(rowNum===1)headers.push(...vals.map(v=>String(v||'')));else rows.push(vals.map(v=>String(v||'')));});parsedExcel.push({file:path.basename(excelFile),sheetName:sheet.name,rowCount:rows.length,sample:rows.slice(0,3)});log('fetch-downloads','OK',`解析Excel: ${path.basename(excelFile)} (${rows.length}行)`);}catch(err){log('fetch-downloads','WARN',`Excel解析失败 ${path.basename(excelFile)}: ${err.message}`);}}}catch(err){log('fetch-downloads','WARN',`ExcelJS不可用，跳过Excel解析: ${err.message}`);log('fetch-downloads','INFO','安装命令: npm install exceljs');}}
  const summary={type:'dashboard-summary',timestamp:now(),date:today(),duration_ms:Date.now()-startTime,downloads:{total:files.length,csv:csvFiles.length,excel:excelFiles.length,latest:files.length>0?path.basename(files[0]):null},parsed:{csv:parsedCSV,excel:parsedExcel},files:files.slice(0,20).map(f=>({name:path.basename(f),size:fs.statSync(f).size,mtime:fs.statSync(f).mtime})),note:parsedCSV.length===0&&parsedExcel.length===0?'未解析到数据，请检查下载的报表格式或安装 exceljs (npm install exceljs)':`成功解析 ${parsedCSV.length} 个CSV, ${parsedExcel.length} 个Excel`};
  const stats={totalOrders:0,totalRefunds:0,totalGMV:0};
  for(const csv of parsedCSV){for(const row of csv.sample){const gmv=row['GMV']||row['成交额']||row['支付金额']||0;const qty=row['订单数']||row['数量']||0;if(gmv)stats.totalGMV+=parseFloat(gmv)||0;if(qty)stats.totalOrders+=parseInt(qty)||0;}}
  summary.stats=stats;
  writeDoudianJSON('dashboard_summary',summary);
  log('fetch-downloads','OK',`完成，耗时 ${Date.now()-startTime}ms`);
  log('fetch-downloads','INFO',`统计数据: GMV=${stats.totalGMV}, 订单=${stats.totalOrders}, 售后=${stats.totalRefunds}`);
  console.log(JSON.stringify(summary,null,2));
  const THIRTY_DAYS=30*86400000;let cleaned=0;
  for(const file of files){const age=Date.now()-fs.statSync(file).mtimeMs;if(age>THIRTY_DAYS){fs.unlinkSync(file);try{fs.unlinkSync(file+'.meta.json');}catch{}cleaned++;}}
  if(cleaned>0)log('fetch-downloads','INFO',`清理了 ${cleaned} 个过期文件`);
}
main().catch(err=>{log('fetch-downloads','ERROR',`Fatal: ${err.message}`);process.exit(1);});
