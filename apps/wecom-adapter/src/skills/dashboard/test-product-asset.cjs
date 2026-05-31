'use strict';

var fs = require('fs');
var path = require('path');
var os = require('os');

var passed = 0, failed = 0, errors = [];
function assert(c, m) { if (c) passed++; else { failed++; errors.push('FAIL: ' + (m||'')); console.log('  ✗ FAIL: ' + (m||'')); } }
function test(n, fn) { process.stdout.write('  ' + n + ' ... '); try { fn(); console.log('✓'); } catch (e) { failed++; errors.push('FAIL: ' + n + ' - ' + e.message); console.log('✗ ' + e.message); } }
function summary() {
  console.log('\n' + '='.repeat(60));
  console.log('Product Asset Skill 测试: ' + passed + ' 通过, ' + failed + ' 失败');
  if (errors.length) errors.forEach(function(e, i) { console.log('  ' + (i+1) + '. ' + e); });
  console.log('='.repeat(60));
  return failed === 0;
}

var skill = require('./product-asset-skill');

// 创建测试素材
var testDir = path.join(os.tmpdir(), 'test-assets-' + Date.now());
function setupTestAssets() {
  fs.mkdirSync(testDir, { recursive: true });
  var files = [
    'logo_brand.png',
    'package_box_6pack.jpg',
    'bucket_6pack_detail.jpg',
    'ingredient_peanut.jpg',
    'cooking_process_water.jpg',
    'finished_suanlafen.jpg',
    'scene_office_desk.jpg',
    'scene_dormitory_bed.jpg',
    'night_snack_ramen.jpg',
    'review_screenshot_5star.png',
    'unboxing_video_open.mp4',
    'cooking_video_tutorial.mp4',
    'tasting_video_delicious.mp4',
    'unknown_random_file.jpg',
  ];
  files.forEach(function (f) { fs.writeFileSync(path.join(testDir, f), 'x'.repeat(1024)); });
  return testDir;
}

// ─── A. 扫描 ───────────────────────────────────────────────

console.log('\n--- A. 扫描 ---');
var root = setupTestAssets();

test('扫描测试素材', function () {
  var files = skill._scanAssets(root);
  assert(files.length === 14, '应有14个文件');
  var images = files.filter(function (f) { return f.type === 'image'; });
  var videos = files.filter(function (f) { return f.type === 'video'; });
  assert(images.length === 11, '11张图片');
  assert(videos.length === 3, '3个视频');
});

// ─── B. 分类 ───────────────────────────────────────────────

console.log('\n--- B. 分类 ---');
test('品牌 logo 分类', function () {
  var cat = skill._classifyAsset({ name: 'logo_brand.png', type: 'image', path: '/a/logo_brand.png' });
  assert(cat === 'brand_logo', '应分类为 brand_logo');
});
test('产品包装分类', function () {
  assert(skill._classifyAsset({ name: 'package_box.jpg', type: 'image' }) === 'product_package');
});
test('食材分类', function () {
  assert(skill._classifyAsset({ name: 'ingredient_peanut.jpg', type: 'image' }) === 'ingredient');
});
test('成品分类', function () {
  assert(skill._classifyAsset({ name: 'finished_suanlafen.jpg', type: 'image' }) === 'finished_food');
});
test('办公室场景分类', function () {
  assert(skill._classifyAsset({ name: 'office_desk.jpg', type: 'image' }) === 'scene_office');
});
test('开箱视频分类', function () {
  assert(skill._classifyAsset({ name: 'unboxing_open.mp4', type: 'video' }) === 'unboxing_video');
});
test('制作视频分类', function () {
  assert(skill._classifyAsset({ name: 'cooking_tutorial.mp4', type: 'video' }) === 'cooking_video');
});
test('试吃视频分类', function () {
  assert(skill._classifyAsset({ name: 'tasting_good.mp4', type: 'video' }) === 'tasting_video');
});
test('未知分类', function () {
  assert(skill._classifyAsset({ name: 'random_xyz.jpg', type: 'image' }) === 'unknown');
});

// ─── C. Manifest ───────────────────────────────────────────

console.log('\n--- C. Manifest ---');
test('generateManifest 生成完整', function () {
  var files = skill._scanAssets(root);
  skill._classifyAll(files);
  var manifest = skill._generateManifest(files);
  assert(manifest.summary.totalFiles === 14, '14个文件');
  assert(manifest.byCategory.product_package.count >= 1, '含product_package');
  assert(manifest.byCategory.brand_logo.count >= 1, '含brand_logo');
  assert(manifest.byCategory.unboxing_video.count >= 1, '含unboxing_video');
});
test('scanAndGenerate 全套流程', function () {
  var result = skill.scanAndGenerate(root);
  assert(result.success, '应成功');
  assert(result.manifest !== undefined, '应有manifest');
  assert(result.files.length === 14, '14个文件');
});

// ─── D. 缺口分析 ───────────────────────────────────────────

console.log('\n--- D. 缺口 ---');
test('analyzeGaps 检测未知分类', function () {
  var result = skill.scanAndGenerate(root);
  var gaps = skill._analyzeGaps(result.manifest);
  // review_screenshot 应存在，检查缺口
  var knownCats = Object.keys(result.manifest.byCategory).filter(function (c) { return result.manifest.byCategory[c].count === 0; });
  assert(Array.isArray(gaps), 'gaps应为数组');
});

// ─── E. Markdown 报告 ──────────────────────────────────────

console.log('\n--- E. 报告 ---');
test('getScanResult 返回 Markdown', function () {
  var result = skill.getScanResult();
  assert(typeof result === 'string', '应为字符串');
  assert(result.indexOf('REVIEW_ONLY') !== -1, '含REVIEW_ONLY');
});
test('getLibrarySummary 返回 Markdown', function () {
  var result = skill.getLibrarySummary();
  assert(typeof result === 'string', '应为字符串');
  assert(result.indexOf('素材库') !== -1 || result.indexOf('素材') !== -1, '含标题');
});
test('getGapReport 返回 Markdown', function () {
  var result = skill.getGapReport();
  assert(typeof result === 'string', '应为字符串');
});

// ─── F. 安全 ───────────────────────────────────────────────

console.log('\n--- F. 安全 ---');
test('报告含安全声明', function () {
  var r = skill.getScanResult();
  assert(r.indexOf('REVIEW_ONLY') !== -1, 'REVIEW_ONLY');
});
test('不含高危词', function () {
  var r = skill.getGapReport() + skill.getScanResult() + skill.getLibrarySummary();
  var lower = r.toLowerCase();
  ['deploy', 'merge', '.env', 'vault', '下单', '改价'].forEach(function (w) {
    // 允许出现在 REVIEW_ONLY 安全声明行中
    var idx = lower.indexOf(w);
    if (idx !== -1) {
      // 检查是否在 REVIEW_ONLY 行中
      var line = r.split('\n').find(function(l) { return l.toLowerCase().indexOf(w) !== -1; }) || '';
      assert(line.indexOf('REVIEW_ONLY') !== -1 || line.indexOf('不') !== -1 || line.indexOf('禁止') !== -1, w + ' 仅出现在安全声明中');
    }
  });
});

// ─── G. 路由 ───────────────────────────────────────────────

console.log('\n--- G. 路由 ---');
test('/素材库 → MATCH', function () {
  var { resolve } = require('../../lib/command-center');
  assert(resolve('/素材库') !== null, '应匹配');
});
test('/素材扫描 → MATCH', function () {
  var { resolve } = require('../../lib/command-center');
  assert(resolve('/素材扫描') !== null, '应匹配');
});
test('/素材报告 → MATCH', function () {
  var { resolve } = require('../../lib/command-center');
  assert(resolve('/素材报告') !== null, '应匹配');
});

// ─── H. DAG ────────────────────────────────────────────────

console.log('\n--- H. DAG ---');
test('Mission DAG 含 scan_product_assets', function () {
  var mp = 'c:/Users/haoji/WorkBuddy/wecom-openclaw/apps/wecom-adapter/config/missions/doudian-daily-5-videos.mission.json';
  var m = JSON.parse(fs.readFileSync(mp, 'utf8'));
  var node = m.dag.nodes.find(function(n) { return n.id === 'scan_product_assets'; });
  assert(node !== undefined, '节点应存在');
  assert(node.depends_on[0] === 'fetch_google_drive_assets', '依赖 fetch_google_drive_assets');
});
test('generate_5_scripts 依赖含 scan_product_assets', function () {
  var mp = 'c:/Users/haoji/WorkBuddy/wecom-openclaw/apps/wecom-adapter/config/missions/doudian-daily-5-videos.mission.json';
  var m = JSON.parse(fs.readFileSync(mp, 'utf8'));
  var node = m.dag.nodes.find(function(n) { return n.id === 'generate_5_scripts'; });
  assert(node.depends_on.indexOf('scan_product_assets') !== -1, '依赖含新节点');
});

// ─── 清理 ──────────────────────────────────────────────────

try { fs.rmSync(testDir, { recursive: true }); } catch (_) {}

console.log('');
var ok = summary();
process.exit(ok ? 0 : 1);
