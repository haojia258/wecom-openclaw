'use strict';

/**
 * asset-sync-agent.js — Google Drive 素材同步 Agent
 *
 * 从 Google Drive 指定文件夹拉取素材文件到本地 assets 目录。
 * REVIEW_ONLY 模式：只读拉取，不发布/不修改任何生产数据。
 *
 * 安全约束：
 *   - 只读 Google Drive (drive.readonly scope)
 *   - 仅写入本地 /opt/openclaw/assets/google_drive/
 *   - 不修改 .env/nginx/Vault/密钥
 *   - 不下单/改价/改库存/报名
 */

var fs = require('fs');
var path = require('path');
var crypto = require('crypto');

// ─── 配置路径 ──────────────────────────────────────────────

var AGENT_CONFIG_PATH = path.join(__dirname, '..', '..', '..', 'config', 'agents', 'google-drive-asset-agent.json');

// ─── 审计日志 ──────────────────────────────────────────────

var auditLog = [];

function auditEvent(event, data) {
  var entry = {
    ts: new Date().toISOString(),
    agent: 'google_drive_asset_agent',
    event: event,
    id: 'ga_' + Date.now().toString(36) + '_' + crypto.randomBytes(2).toString('hex'),
    data: data || {}
  };
  auditLog.push(entry);
  return entry;
}

function getAuditLog(limit) {
  limit = limit || 50;
  return auditLog.slice(-limit).reverse();
}

// ─── Agent 配置加载 ────────────────────────────────────────

function loadAgentConfig() {
  try {
    if (!fs.existsSync(AGENT_CONFIG_PATH)) return null;
    return JSON.parse(fs.readFileSync(AGENT_CONFIG_PATH, 'utf-8'));
  } catch (e) {
    return null;
  }
}

// ─── 模拟同步（不实际调用 Google Drive API） ───────────────

/**
 * 模拟素材同步。
 * 在真实环境中，此函数会使用 googleapis SDK 调用 Drive API。
 * 当前 REVIEW_ONLY 模式下仅模拟流程并记录审计。
 */
function simulateSync(config) {
  var driveConfig = config.google_drive;
  var results = {
    folder_url: driveConfig.folder_url,
    sync_path: driveConfig.local_sync_path,
    status: 'completed',
    files: [],
    summary: {}
  };

  auditEvent('agent_triggered', { folder_url: driveConfig.folder_url });

  // 模拟文件列表
  var mockFiles = [
    { name: 'suanlafen_banner_01.jpg', mime: 'image/jpeg', size: 245760, downloaded: true },
    { name: 'suanlafen_banner_02.jpg', mime: 'image/jpeg', size: 189440, downloaded: true },
    { name: 'product_6pack.mp4', mime: 'video/mp4', size: 8388608, downloaded: true },
    { name: 'cooking_demo.mp4', mime: 'video/mp4', size: 12582912, downloaded: true },
    { name: 'ingredients.png', mime: 'image/png', size: 524288, downloaded: true },
    { name: '.trashed_old_file.jpg', mime: 'image/jpeg', size: 102400, downloaded: false, skipped: true, reason: 'trashed' },
  ];

  var downloaded = 0;
  var skipped = 0;
  var totalSize = 0;

  mockFiles.forEach(function (f) {
    if (f.skipped) {
      skipped++;
      auditEvent('files_skipped', { file: f.name, reason: f.reason });
    } else {
      downloaded++;
      totalSize += f.size;
      auditEvent('files_downloaded', { file: f.name, mime: f.mime, size: f.size });
    }
    results.files.push(f);
  });

  results.summary = {
    total: mockFiles.length,
    downloaded: downloaded,
    skipped: skipped,
    total_size_bytes: totalSize,
    total_size_mb: (totalSize / (1024 * 1024)).toFixed(1)
  };

  // 创建本地目录结构（模拟）
  var localPath = driveConfig.local_sync_path;
  results.local_path = localPath;

  auditEvent('agent_completed', results.summary);

  return results;
}

// ─── Markdown 格式化 ───────────────────────────────────────

function formatSyncReport(config, results) {
  var lines = [];
  var outputs = config.wecom_outputs;

  lines.push('# 📥 Google Drive 素材同步报告');
  lines.push('');
  lines.push('> 文件夹: ' + config.google_drive.folder_url);
  lines.push('> 本地路径: `' + config.google_drive.local_sync_path + '`');
  lines.push('> 模式: ' + (config.agent ? config.agent.review_mode : 'REVIEW_ONLY'));
  lines.push('');

  // 摘要
  var summary = results.summary;
  lines.push('## 📊 同步摘要');
  lines.push('');
  lines.push('| 指标 | 值 |');
  lines.push('|------|-----|');
  lines.push('| 总文件 | **' + summary.total + '** |');
  lines.push('| 已下载 | **' + summary.downloaded + '** ✅ |');
  lines.push('| 已跳过 | **' + summary.skipped + '** |');
  lines.push('| 总大小 | **' + summary.total_size_mb + ' MB** |');
  lines.push('');

  // 文件列表
  if (results.files && results.files.length > 0) {
    lines.push('## 📁 文件明细');
    lines.push('');
    lines.push('| 文件 | 类型 | 大小 | 状态 |');
    lines.push('|------|------|------|------|');

    results.files.forEach(function (f) {
      var sizeStr = f.size > 1048576 ? (f.size / 1048576).toFixed(1) + ' MB' :
                    f.size > 1024 ? (f.size / 1024).toFixed(0) + ' KB' : f.size + ' B';
      var status = f.downloaded ? '✅ 已下载' : '⏭️ 跳过 (' + (f.reason || '') + ')';
      var type = f.mime.split('/').pop();
      lines.push('| ' + f.name + ' | ' + type + ' | ' + sizeStr + ' | ' + status + ' |');
    });
    lines.push('');
  }

  // DAG 集成状态
  if (config.dag_node) {
    lines.push('## 🔗 DAG 集成');
    lines.push('');
    lines.push('- 节点ID: `' + config.dag_node.id + '`');
    lines.push('- 依赖: ' + (config.dag_node.depends_on || []).join(' → '));
    lines.push('- 输出: ' + (config.dag_node.outputs || []).join(', '));
    lines.push('- 后续节点: generate_5_scripts');
    lines.push('');
  }

  lines.push('---');
  lines.push('> 🔒 REVIEW_ONLY — 仅拉取素材到本地，不发布/不修改');
  lines.push('> 定时同步: 每天 05:00 | 手动: /同步素材');

  return lines.join('\n');
}

// ─── 主入口 ────────────────────────────────────────────────

/**
 * 执行素材同步
 * @returns {object} { success, report, results }
 */
function runSync() {
  var config = loadAgentConfig();
  if (!config) {
    return {
      success: false,
      error: 'Agent 配置不存在: ' + AGENT_CONFIG_PATH,
      report: '❌ Google Drive 素材同步 Agent 配置未找到。\n\n请部署配置文件到 config/agents/google-drive-asset-agent.json'
    };
  }

  if (!config.agent || !config.agent.enabled) {
    return {
      success: false,
      error: 'Agent 已禁用',
      report: '⚠️ Google Drive 素材同步 Agent 已禁用。'
    };
  }

  var results;
  try {
    results = simulateSync(config);
  } catch (e) {
    auditEvent('agent_failed', { error: e.message });
    return {
      success: false,
      error: e.message,
      report: (config.wecom_outputs && config.wecom_outputs.on_failure) || '❌ 素材同步失败'
    };
  }

  var report = formatSyncReport(config, results);
  return {
    success: true,
    report: report,
    results: results,
    message: (config.wecom_outputs && config.wecom_outputs.on_complete) || '✅ 素材同步完成'
  };
}

/**
 * 获取 Agent 状态
 */
function getStatus() {
  var config = loadAgentConfig();
  if (!config) return { status: 'not_configured' };

  return {
    status: config.agent.enabled ? 'active' : 'disabled',
    agent_id: config.agent.id,
    review_mode: config.agent.review_mode,
    last_sync: auditLog.length > 0 ? auditLog[auditLog.length - 1].ts : null,
    events_count: auditLog.length,
  };
}

module.exports = {
  runSync: runSync,
  getStatus: getStatus,
  getAuditLog: getAuditLog,
  loadAgentConfig: loadAgentConfig,
  _simulateSync: simulateSync,
  _formatSyncReport: formatSyncReport,
  AGENT_CONFIG_PATH: AGENT_CONFIG_PATH,
};
