'use strict';

/**
 * review-engine.js - AI 代码审查聚合引擎
 * v1.0 - 调用 risk-policy.js 获取风险评分，本模块只做聚合、统计和格式化
 *
 * 规则唯一来源：risk-policy.js
 * 本文件禁止重新定义任何规则。
 */

const fs = require('fs');
const path = require('path');
const { analyzeRisk } = require('./risk-policy');

// 审查目标文件类型
const SOURCE_EXTENSIONS = new Set([
  '.js', '.ts', '.jsx', '.tsx', '.json', '.yaml', '.yml',
  '.sh', '.bash', '.py', '.env', '.conf', '.config',
  '.md', '.html', '.css', '.scss', '.less',
]);

// 跳过目录
const SKIP_DIRS = new Set([
  'node_modules', '.git', '.workbuddy', 'logs', 'storage',
  'cookies', 'screenshots', 'dist', 'build', '.next', '.cache',
]);

/**
 * 递归收集目录下所有文件路径（相对路径）
 */
function collectFiles(dirPath, baseDir) {
  const results = [];
  if (!fs.existsSync(dirPath)) return results;

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    const relativePath = path.relative(baseDir, fullPath).replace(/\\/g, '/');

    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      results.push(...collectFiles(fullPath, baseDir));
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (SOURCE_EXTENSIONS.has(ext) || entry.name.startsWith('.env')) {
        results.push(relativePath);
      }
    }
  }
  return results;
}

/**
 * 统计文件行数和大小
 */
function countFileStats(filePath, baseDir) {
  const fullPath = path.join(baseDir, filePath);
  try {
    const content = fs.readFileSync(fullPath, 'utf8');
    return {
      lines: content.split('\n').length,
      bytes: Buffer.byteLength(content, 'utf8'),
    };
  } catch (_) {
    return { lines: 0, bytes: 0 };
  }
}

/**
 * 主审查入口
 * @param {string} targetPath - 要审查的文件/目录路径（相对或绝对）
 * @param {object} options
 * @param {string} options.projectRoot - 项目根目录（默认 cwd）
 * @returns {{ files: string[], riskResult: object, stats: object, report: string }}
 */
function review(targetPath, options = {}) {
  const projectRoot = options.projectRoot || process.cwd();
  const resolvedPath = path.resolve(projectRoot, targetPath);
  const baseDir = fs.existsSync(resolvedPath)
    ? (fs.statSync(resolvedPath).isDirectory() ? resolvedPath : path.dirname(resolvedPath))
    : projectRoot;

  // 1. 收集文件列表
  let files;
  if (!fs.existsSync(resolvedPath)) {
    files = [];
  } else if (fs.statSync(resolvedPath).isFile()) {
    files = [path.relative(baseDir, resolvedPath).replace(/\\/g, '/')];
  } else {
    files = collectFiles(resolvedPath, baseDir);
  }

  // 2. 调用 risk-policy 评分
  const riskResult = analyzeRisk(files);

  // 3. 统计信息
  let totalLines = 0;
  let totalBytes = 0;
  const fileStatsMap = {};
  for (const f of files) {
    const stats = countFileStats(f, baseDir);
    totalLines += stats.lines;
    totalBytes += stats.bytes;
    fileStatsMap[f] = stats;
  }

  const stats = {
    fileCount: files.length,
    totalLines,
    totalBytes,
    riskyFileCount: riskResult.forbiddenHits.length,
  };

  // 4. 格式化报告
  const report = formatReport({
    targetPath: path.relative(projectRoot, resolvedPath).replace(/\\/g, '/') || '.',
    files,
    riskResult,
    stats,
  });

  return { files, riskResult, stats, report };
}

/**
 * 格式化输出
 */
function formatReport({ targetPath, files, riskResult, stats }) {
  const lines = ['🔍 AI 代码审查报告'];
  lines.push('');

  // 基本信息
  lines.push('【基本信息】');
  lines.push('  审查路径: ' + targetPath);
  lines.push('  文件数: ' + stats.fileCount + ' / 行数: ' + stats.totalLines);
  lines.push('  风险评分: ' + riskResult.riskScore + '/100  (' + riskResult.level + ')');

  if (stats.riskyFileCount > 0) {
    lines.push('  高风险文件: ' + stats.riskyFileCount + ' 个');
  }
  lines.push('');

  // 风险命中
  if (riskResult.forbiddenHits.length > 0) {
    lines.push('【风险命中】');
    for (const hit of riskResult.forbiddenHits) {
      lines.push('  ⚠️ ' + hit);
    }
  } else {
    lines.push('【风险命中】');
    lines.push('  ✅ 未命中任何风险规则');
  }
  lines.push('');

  // 合并建议
  lines.push('【合并建议】');
  lines.push('  ' + riskResult.mergeAdvice);
  lines.push('');

  // 检查清单
  lines.push('【检查清单】');
  for (let i = 0; i < riskResult.checklist.length; i++) {
    lines.push('  ' + (i + 1) + '. ' + riskResult.checklist[i]);
  }
  lines.push('');

  // 文件概览（最多展示 20 个）
  if (files.length > 0) {
    lines.push('【审查文件】（共 ' + files.length + ' 个）');
    const displayFiles = files.slice(0, 20);
    for (const f of displayFiles) {
      lines.push('  ' + f);
    }
    if (files.length > 20) {
      lines.push('  ... 等 ' + (files.length - 20) + ' 个文件');
    }
  }

  lines.push('');
  lines.push('💡 数据来源：risk-policy v0.1 规则引擎');

  return lines.join('\n');
}

module.exports = { review, formatReport, collectFiles };
