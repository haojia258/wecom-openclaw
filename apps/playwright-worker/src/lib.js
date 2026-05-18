/**
 * Shared utilities for playwright-worker scripts.
 * Centralizes logging, paths, and common helpers.
 */

const path = require('path');
const fs = require('fs');

// === Human-assisted mode config ===
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const STORAGE_PROFILE = process.env.BROWSER_PROFILE_DIR || path.join(PROJECT_ROOT, 'storage', 'browser-profile');
const DOWNLOADS_DIR = process.env.DOWNLOADS_DIR || path.join(PROJECT_ROOT, 'logs', 'downloads');
const SCREENSHOTS_DIR = process.env.SCREENSHOTS_DIR || path.join(PROJECT_ROOT, 'logs', 'screenshots');
const OCR_DIR = process.env.OCR_DIR || path.join(PROJECT_ROOT, 'logs', 'ocr');
const DOUDIAN_OUTPUT_DIR = process.env.DOUDIAN_OUTPUT_DIR || path.join(PROJECT_ROOT, 'logs', 'doudian');

// === Legacy: Unified output directories ===
// In production on server: /opt/wecom-openclaw/logs/
// In local dev: relative to project root
const LOGS_DIR = process.env.LOGS_DIR || path.join(PROJECT_ROOT, 'logs');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function getLogsDir() {
  ensureDir(LOGS_DIR);
  return LOGS_DIR;
}

function getSubDir(name) {
  const dir = path.join(getLogsDir(), name);
  ensureDir(dir);
  return dir;
}

// === Logging ===
function log(module, level, msg, extra) {
  const ts = new Date().toISOString();
  const entry = { ts, module, level, msg };
  if (extra) entry.extra = extra;
  const line = JSON.stringify(entry) + '\n';

  // Console output
  const colorMap = { INFO: '\x1b[36m', WARN: '\x1b[33m', ERROR: '\x1b[31m', OK: '\x1b[32m' };
  const c = colorMap[level] || '';
  console.log(`${c}[${level}]${c}\x1b[0m ${msg}`);

  // Append to log file
  const logDir = getSubDir('scripts');
  const logFile = path.join(logDir, `${module}.log`);
  fs.appendFileSync(logFile, line, 'utf-8');
  return entry;
}

// === JSON output ===
function outputJSON(module, data) {
  const outDir = getSubDir('output');
  const outFile = path.join(outDir, `${module}_${Date.now()}.json`);
  fs.writeFileSync(outFile, JSON.stringify(data, null, 2), 'utf-8');
  log(module, 'OK', `Output saved to ${outFile}`);
  return outFile;
}

// === Save page artifact (screenshot/text/html) ===
function saveArtifact(module, pageName, type, content) {
  const artDir = getSubDir(path.join('artifacts', module));
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const ext = type === 'text' ? 'txt' : type;
  const file = path.join(artDir, `${pageName}_${ts}.${ext}`);
  fs.writeFileSync(file, content, 'utf-8');
  log(module, 'INFO', `Artifact saved: ${file}`);
  return file;
}

// === Parse Chinese currency value ===
function parseValue(raw) {
  if (raw == null || raw === '' || raw === '-') return null;
  const s = String(raw).trim();
  const m = s.match(/([\d.]+)/);
  if (!m) return null;
  let v = parseFloat(m[1]);
  if (s.includes('万')) v *= 10000;
  if (s.includes('亿')) v *= 100000000;
  return Math.round(v * 100) / 100;
}

// === Extract indicator from text lines ===
function extract(lines, keyword) {
  const idx = lines.findIndex(l => l.includes(keyword));
  if (idx === -1) return { value: null, yesterday: null };
  const value = parseValue(lines[idx + 1]);
  const yesterday = parseValue(lines[idx + 2]);
  return { value, yesterday };
}

// === Timestamp ===
function now() {
  return new Date().toISOString();
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

// === Dry-run banner ===
function dryRun(msg) {
  log('system', 'WARN', `[DRY-RUN] ${msg} — no real action taken`);
}

// === Human-assisted mode: launch persistent browser (headed) ===
async function launchPersistentBrowser(options = {}) {
  const { chromium } = require('playwright');
  const headless = process.env.HEADLESS === 'true' ? true : false;
  const profileDir = options.profileDir || STORAGE_PROFILE;

  fs.mkdirSync(profileDir, { recursive: true });
  fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  fs.mkdirSync(OCR_DIR, { recursive: true });
  fs.mkdirSync(DOUDIAN_OUTPUT_DIR, { recursive: true });

  const browserContext = await chromium.launchPersistentContext(profileDir, {
    headless,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    downloadsPath: DOWNLOADS_DIR,
    acceptDownloads: true,
    viewport: { width: 1440, height: 900 },
    ...options.playwrightOptions,
  });

  log('browser', 'INFO', `Persistent context launched (headed=${!headless}), profile=${profileDir}`);

  // Setup download handler
  browserContext.on('download', async (download) => {
    const suggestedName = download.suggestedFilename();
    const savePath = path.join(DOWNLOADS_DIR, suggestedName);
    await download.saveAs(savePath);
    log('download', 'OK', `Downloaded: ${suggestedName} -> ${savePath}`);
    // Store metadata for later use
    const metaPath = savePath + '.meta.json';
    fs.writeFileSync(metaPath, JSON.stringify({
      suggestedFilename: suggestedName,
      url: download.url(),
      savePath,
      timestamp: new Date().toISOString(),
    }, null, 2));
  });

  return browserContext;
}

// === Setup network response hook ===
function setupNetworkInterceptor(page, module = 'network') {
  const captured = [];

  page.on('request', (req) => {
    const url = req.url();
    // Capture XHR/fetch requests to relevant APIs
    if (url.includes('jinritemai') || url.includes('douyin') || url.includes('doudian') || url.includes('api')) {
      captured.push({ type: 'request', url, method: req.method(), time: Date.now() });
    }
  });

  page.on('response', async (res) => {
    const url = res.url();
    const ct = res.headers()['content-type'] || '';
    // Capture JSON responses from relevant APIs
    if ((url.includes('jinritemai') || url.includes('douyin') || url.includes('doudian') || url.includes('/api/')) && ct.includes('json')) {
      try {
        const body = await res.json().catch(() => null);
        if (body) {
          captured.push({
            type: 'response',
            url,
            status: res.status(),
            body: JSON.stringify(body).slice(0, 5000), // truncate
            time: Date.now(),
          });
        }
      } catch {}
    }
  });

  log(module, 'INFO', 'Network interceptor installed');
  return captured;
}

// === Save screenshot with timestamp ===
async function saveScreenshot(page, module, label = 'screenshot') {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const filePath = path.join(SCREENSHOTS_DIR, `${module}_${label}_${ts}.png`);
  await page.screenshot({ path: filePath, fullPage: false }).catch(() => {});
  log(module, 'INFO', `Screenshot saved: ${filePath}`);
  return filePath;
}

// === Run OCR on image (uses system tesseract or tesseract.js) ===
async function runOCR(imagePath, module = 'ocr') {
  fs.mkdirSync(OCR_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const outPath = path.join(OCR_DIR, `${module}_${ts}.txt`);

  // Try tesseract.js (npm package) first; fall back to system tesseract CLI
  try {
    const { createWorker } = require('tesseract.js');
    const worker = await createWorker('eng+chi_sim');
    const ret = await worker.recognize(imagePath);
    const text = ret.data.text;
    fs.writeFileSync(outPath, text, 'utf-8');
    await worker.terminate();
    log(module, 'OK', `OCR completed (tesseract.js): ${outPath}`);
    return { text, path: outPath, engine: 'tesseract.js' };
  } catch (err) {
    log(module, 'WARN', `tesseract.js failed (${err.message}), trying system tesseract...`);
  }

  // Fallback: system tesseract
  try {
    const { execSync } = require('child_process');
    execSync(`tesseract "${imagePath}" "${outPath.replace(/\.txt$/, '')}" -l eng+chi_sim`, { stdio: 'pipe' });
    const text = fs.readFileSync(outPath, 'utf-8');
    log(module, 'OK', `OCR completed (system tesseract): ${outPath}`);
    return { text, path: outPath, engine: 'system-tesseract' };
  } catch (err) {
    log(module, 'ERROR', `OCR failed: ${err.message}`);
    // Write empty result
    fs.writeFileSync(outPath, '', 'utf-8');
    return { text: '', path: outPath, engine: 'none', error: err.message };
  }
}

// === Write Doudian output JSON ===
function writeDoudianJSON(module, data) {
  fs.mkdirSync(DOUDIAN_OUTPUT_DIR, { recursive: true });
  const filePath = path.join(DOUDIAN_OUTPUT_DIR, `${module}_latest.json`);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  log(module, 'OK', `Doudian output: ${filePath}`);
  return filePath;
}

// === Generate operations summary for WeCom ===
function genOpSummary(data) {
  const lines = ['【抖店运营摘要】'];
  lines.push(`时间: ${data.date || new Date().toISOString().slice(0, 10)}`);
  if (data.orders !== undefined) lines.push(`订单数: ${data.orders}`);
  if (data.gmv !== undefined) lines.push(`GMV: ¥${(data.gmv / 100).toFixed(2)}`);
  if (data.refunds !== undefined) lines.push(`售后数: ${data.refunds}`);
  if (data.pendingShip !== undefined) lines.push(`待发货: ${data.pendingShip}`);
  if (data.note) lines.push(`备注: ${data.note}`);
  lines.push('');
  lines.push('详情查看后台仪表盘。');
  return lines.join('\n');
}

module.exports = {
  getLogsDir,
  getSubDir,
  ensureDir,
  log,
  outputJSON,
  saveArtifact,
  parseValue,
  extract,
  now,
  today,
  dryRun,
  PROJECT_ROOT,
  LOGS_DIR,
  // Human-assisted mode exports
  launchPersistentBrowser,
  setupNetworkInterceptor,
  saveScreenshot,
  runOCR,
  writeDoudianJSON,
  genOpSummary,
  STORAGE_PROFILE,
  DOWNLOADS_DIR,
  SCREENSHOTS_DIR,
  OCR_DIR,
  DOUDIAN_OUTPUT_DIR,
};
