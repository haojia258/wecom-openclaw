'use strict';

/**
 * product-asset-skill.js — Product Asset Scanner & Manifest Generator
 *
 * 扫描 /opt/openclaw/assets/ 图片和视频，
 * 自动分类、打标签，生成 product-asset-manifest.json。
 *
 * REVIEW_ONLY 模式：
 *   - 只读扫描素材
 *   - 只写 manifest.json
 *   - 不删除/移动/覆盖原始素材
 *   - 不发布/不改价/不投流/不报名
 */

var fs = require('fs');
var path = require('path');
var crypto = require('crypto');

var ASSETS_ROOT = process.env.ASSETS_ROOT || path.join('/', 'opt', 'openclaw', 'assets');
var MANIFEST_PATH = path.join(ASSETS_ROOT, 'product-asset-manifest.json');

// ─── 分类规则 ──────────────────────────────────────────────

var CATEGORY_RULES = [
  { category: 'brand_logo',       type: 'image', keywords: ['logo', 'brand', '品牌', '标志'] },
  { category: 'product_package',  type: 'image', keywords: ['package', '包装', '整箱', 'box', 'carton'] },
  { category: 'product_bucket',   type: 'image', keywords: ['bucket', '桶', 'cup', '单桶', '6桶', '12桶', '18桶', '6pack', '12pack', '18pack'] },
  { category: 'ingredient',       type: 'image', keywords: ['ingredient', '食材', '料包', '花生', '腐竹', '调料'] },
  { category: 'cooking_process',  type: 'image', keywords: ['cooking', '冲泡', '煮', '加工', 'process', '泡'] },
  { category: 'finished_food',    type: 'image', keywords: ['finished', '成品', '完成', '酸辣粉', 'suanlafen', 'done'] },
  { category: 'scene_office',     type: 'image', keywords: ['office', '办公', 'office', '加班'] },
  { category: 'scene_dormitory',  type: 'image', keywords: ['dormitory', 'dorm', '宿舍'] },
  { category: 'night_snack',      type: 'image', keywords: ['night', '夜宵', '宵夜', '晚上', '深夜'] },
  { category: 'review_screenshot', type: 'image', keywords: ['review', '评价', '截图', 'screenshot'] },
  { category: 'unboxing_video',   type: 'video', keywords: ['unboxing', '开箱'] },
  { category: 'cooking_video',    type: 'video', keywords: ['cooking', '制作', '教程', 'tutorial', 'recipe'] },
  { category: 'tasting_video',    type: 'video', keywords: ['tasting', '试吃', '品尝'] },
];

var IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];
var VIDEO_EXTS = ['.mp4', '.mov', '.avi', '.webm', '.mkv'];

// ─── 审计 ──────────────────────────────────────────────────

var auditLog = [];

function auditEvent(event, data) {
  var entry = { ts: new Date().toISOString(), skill: 'product-asset', event: event, id: 'pa_' + Date.now().toString(36) + '_' + crypto.randomBytes(2).toString('hex'), data: data || {} };
  auditLog.push(entry);
  return entry;
}

// ─── 扫描器 ────────────────────────────────────────────────

function scanAssets(rootPath) {
  rootPath = rootPath || ASSETS_ROOT;
  var files = [];

  function walk(dir) {
    try {
      var entries = fs.readdirSync(dir, { withFileTypes: true });
      entries.forEach(function (entry) {
        var fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
        } else if (entry.isFile()) {
          var ext = path.extname(entry.name).toLowerCase();
          var type = IMAGE_EXTS.indexOf(ext) !== -1 ? 'image' :
                     VIDEO_EXTS.indexOf(ext) !== -1 ? 'video' : null;
          if (type) {
            files.push({
              path: fullPath,
              name: entry.name,
              ext: ext,
              type: type,
              size: fs.statSync(fullPath).size,
              mtime: fs.statSync(fullPath).mtime.toISOString()
            });
          }
        }
      });
    } catch (_) {}
  }

  walk(rootPath);
  auditEvent('scan_completed', { root: rootPath, filesFound: files.length });
  return files;
}

// ─── 分类器 ────────────────────────────────────────────────

function classifyAsset(file) {
  var lowerName = (file.name || '').toLowerCase();
  var lowerPath = (file.path || '').toLowerCase().replace(/\\/g, '/');

  for (var i = 0; i < CATEGORY_RULES.length; i++) {
    var rule = CATEGORY_RULES[i];
    if (file.type !== rule.type) continue;
    for (var j = 0; j < rule.keywords.length; j++) {
      if (lowerName.indexOf(rule.keywords[j]) !== -1 || lowerPath.indexOf(rule.keywords[j]) !== -1) {
        return rule.category;
      }
    }
  }

  return 'unknown';
}

function classifyAll(files) {
  return files.map(function (f) {
    f.category = classifyAsset(f);
    return f;
  });
}

// ─── Manifest 生成 ─────────────────────────────────────────

function generateManifest(files) {
  var categorized = {};
  CATEGORY_RULES.forEach(function (r) {
    categorized[r.category] = [];
  });
  categorized['unknown'] = [];

  files.forEach(function (f) {
    var cat = f.category || 'unknown';
    if (!categorized[cat]) categorized[cat] = [];
    categorized[cat].push(f);
  });

  var summary = {};
  var totalFiles = 0;
  var totalSize = 0;
  Object.keys(categorized).forEach(function (cat) {
    var items = categorized[cat];
    summary[cat] = {
      count: items.length,
      totalSize: items.reduce(function (s, f) { return s + f.size; }, 0),
      type: CATEGORY_RULES.find(function (r) { return r.category === cat; }) ?
            CATEGORY_RULES.find(function (r) { return r.category === cat; }).type : 'mixed'
    };
    totalFiles += items.length;
    totalSize += summary[cat].totalSize;
  });

  var manifest = {
    generated_at: new Date().toISOString(),
    assets_root: ASSETS_ROOT,
    summary: {
      totalFiles: totalFiles,
      totalSize: totalSize,
      totalSizeMB: Math.round(totalSize / (1024 * 1024) * 10) / 10,
      categories: Object.keys(categorized).length
    },
    byCategory: summary,
    files: files.map(function (f) {
      return { name: f.name, category: f.category, type: f.type, size: f.size, path: f.path.replace(ASSETS_ROOT, ''), mtime: f.mtime };
    })
  };

  // 写入 manifest 文件
  try {
    var dir = path.dirname(MANIFEST_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
    auditEvent('manifest_written', { path: MANIFEST_PATH, totalFiles: totalFiles });
  } catch (e) {
    auditEvent('manifest_write_failed', { error: e.message });
  }

  return manifest;
}

// ─── 缺口分析 ──────────────────────────────────────────────

function analyzeGaps(manifest) {
  var gaps = [];
  var expectedCategories = [
    'product_package', 'product_bucket', 'ingredient',
    'cooking_process', 'finished_food', 'scene_office',
    'scene_dormitory', 'night_snack', 'brand_logo',
    'unboxing_video', 'cooking_video', 'tasting_video'
  ];

  expectedCategories.forEach(function (cat) {
    var info = manifest.byCategory[cat];
    if (!info || info.count === 0) {
      var label = CATEGORY_RULES.find(function (r) { return r.category === cat; });
      gaps.push({
        category: cat,
        label: label ? label.keywords[0] : cat,
        type: label ? label.type : 'unknown',
        suggestion: getGapSuggestion(cat)
      });
    }
  });

  return gaps;
}

function getGapSuggestion(category) {
  var suggestions = {
    'brand_logo': '建议上传品牌 Logo 图片（PNG/透明底），用于视频片头片尾',
    'product_package': '建议上传整箱包装图，展示送礼/批发场景',
    'product_bucket': '建议上传单桶产品图，用于卖点展示',
    'ingredient': '建议上传料包/食材特写图，突出真材实料',
    'cooking_process': '建议上传冲泡过程图，展示3分钟速食便利性',
    'finished_food': '建议上传成品酸辣粉图，激发食欲',
    'scene_office': '建议上传办公场景图，覆盖上班族目标人群',
    'scene_dormitory': '建议上传宿舍场景图，覆盖学生人群',
    'night_snack': '建议上传夜宵场景图，覆盖宵夜消费场景',
    'review_screenshot': '建议上传好评截图，用于带货转化视频',
    'unboxing_video': '建议上传开箱视频素材，展示产品包装质感',
    'cooking_video': '建议上传烹饪制作视频，展示冲泡过程',
    'tasting_video': '建议上传试吃视频，展示食用体验',
  };
  return suggestions[category] || '建议补充' + category + '类素材';
}

// ─── Markdown 格式化 ───────────────────────────────────────

function formatLibrarySummary(manifest) {
  var lines = [];
  lines.push('# 📚 素材库摘要');
  lines.push('');
  lines.push('> ' + manifest.summary.totalFiles + ' 个文件 · ' + manifest.summary.totalSizeMB + ' MB · ' + manifest.summary.categories + ' 个分类');
  lines.push('');

  lines.push('## 📊 素材分布');
  lines.push('');
  lines.push('| 分类 | 数量 | 大小 |');
  lines.push('|------|------|------|');

  Object.keys(manifest.byCategory).sort().forEach(function (cat) {
    var info = manifest.byCategory[cat];
    var sizeStr = info.totalSize > 1048576 ? (info.totalSize / 1048576).toFixed(1) + ' MB' :
                  info.totalSize > 1024 ? (info.totalSize / 1024).toFixed(0) + ' KB' : info.totalSize + ' B';
    lines.push('| ' + cat + ' | ' + info.count + ' | ' + sizeStr + ' |');
  });
  lines.push('');

  return lines.join('\n');
}

function formatScanResult(manifest) {
  var lines = [];
  lines.push('# 🔍 素材扫描结果');
  lines.push('');
  lines.push('> 扫描路径: `' + ASSETS_ROOT + '`');
  lines.push('> 发现文件: **' + manifest.summary.totalFiles + '** 个 · ' + manifest.summary.totalSizeMB + ' MB');
  lines.push('> Manifest 已写入: `product-asset-manifest.json`');
  lines.push('');

  // 按分类展示文件
  Object.keys(manifest.byCategory).sort().forEach(function (cat) {
    var info = manifest.byCategory[cat];
    if (info.count === 0) return;

    var files = manifest.files.filter(function (f) { return f.category === cat; });
    lines.push('## ' + getCategoryIcon(cat) + ' ' + cat + ' (' + info.count + ')');
    lines.push('');
    files.slice(0, 10).forEach(function (f) {
      lines.push('- `' + f.name + '` (' + (f.size > 1024 ? (f.size / 1024).toFixed(0) + 'KB' : f.size + 'B') + ')');
    });
    if (files.length > 10) lines.push('- ... 还有 ' + (files.length - 10) + ' 个文件');
    lines.push('');
  });

  lines.push('---');
  lines.push('> 🔒 REVIEW_ONLY — 只读扫描，未修改任何原始素材');

  return lines.join('\n');
}

function formatGapReport(manifest) {
  var gaps = analyzeGaps(manifest);
  var lines = [];
  lines.push('# 📋 素材缺口分析报告');
  lines.push('');

  if (gaps.length === 0) {
    lines.push('✅ 所有分类均已覆盖，无素材缺口！');
    return lines.join('\n');
  }

  lines.push('## ⚠️ 素材缺口 (' + gaps.length + ' 项)');
  lines.push('');
  lines.push('| 分类 | 类型 | 建议 |');
  lines.push('|------|------|------|');

  gaps.forEach(function (g) {
    lines.push('| ' + g.category + ' | ' + g.type + ' | ' + g.suggestion + ' |');
  });
  lines.push('');

  lines.push('## 📊 已有素材覆盖');
  lines.push('');

  var covered = Object.keys(manifest.byCategory).filter(function (c) {
    return manifest.byCategory[c].count > 0;
  });
  lines.push('| 分类 | 数量 |');
  lines.push('|------|------|');
  covered.forEach(function (c) {
    lines.push('| ' + c + ' | **' + manifest.byCategory[c].count + '** |');
  });
  lines.push('');

  lines.push('> 💡 上传缺失素材到 Google Drive 文件夹后，发送 /同步素材 再 /素材扫描 更新');

  return lines.join('\n');
}

function getCategoryIcon(cat) {
  var map = {
    'brand_logo': '🏷', 'product_package': '📦', 'product_bucket': '🪣',
    'ingredient': '🥜', 'cooking_process': '🍳', 'finished_food': '🍜',
    'scene_office': '🏢', 'scene_dormitory': '🏠', 'night_snack': '🌙',
    'review_screenshot': '⭐', 'unboxing_video': '📦', 'cooking_video': '🎬',
    'tasting_video': '😋', 'unknown': '❓'
  };
  return map[cat] || '📁';
}

// ─── 公共 API ──────────────────────────────────────────────

function scanAndGenerate(rootPath) {
  var files = scanAssets(rootPath);
  var classified = classifyAll(files);
  var manifest = generateManifest(classified);
  return { success: true, manifest: manifest, files: classified };
}

function getLibrarySummary() {
  var manifest = loadManifest();
  if (manifest) return formatLibrarySummary(manifest);

  // 无 manifest 时自动扫描
  var result = scanAndGenerate();
  return formatLibrarySummary(result.manifest);
}

function getScanResult() {
  var result = scanAndGenerate();
  return formatScanResult(result.manifest);
}

function getGapReport() {
  var result = scanAndGenerate();
  return formatGapReport(result.manifest);
}

function loadManifest() {
  try {
    if (fs.existsSync(MANIFEST_PATH)) {
      return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
    }
  } catch (_) {}
  return null;
}

module.exports = {
  scanAndGenerate: scanAndGenerate,
  getLibrarySummary: getLibrarySummary,
  getScanResult: getScanResult,
  getGapReport: getGapReport,
  loadManifest: loadManifest,
  getAuditLog: function (n) { return auditLog.slice(-(n || 50)).reverse(); },
  // 内部导出
  _scanAssets: scanAssets,
  _classifyAsset: classifyAsset,
  _classifyAll: classifyAll,
  _generateManifest: generateManifest,
  _analyzeGaps: analyzeGaps,
  _formatLibrarySummary: formatLibrarySummary,
  _formatScanResult: formatScanResult,
  _formatGapReport: formatGapReport,
  ASSETS_ROOT: ASSETS_ROOT,
  MANIFEST_PATH: MANIFEST_PATH,
  CATEGORY_RULES: CATEGORY_RULES,
};
