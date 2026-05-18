'use strict';

/**
 * config.js - 统一路径与常量配置
 * v1.0 - 所有路径从此读取，禁止硬编码
 */

module.exports = {
  VERSION: 'v1.0.0',

  // 数据文件 (全路径，可通过环境变量覆盖)
  COMPASS_FILE:     process.env.COMPASS_FILE     || '/opt/wecom-openclaw/logs/compass_latest.json',
  ORDERS_FILE:      process.env.ORDERS_FILE      || '/opt/wecom-openclaw/logs/doudian/orders_latest.json',
  SKU_PROFIT_FILE:  process.env.SKU_PROFIT_FILE  || '/opt/wecom-openclaw/logs/doudian/sku-profit_latest.json',
  AFTERSALES_FILE:  process.env.AFTERSALES_FILE  || '/opt/wecom-openclaw/logs/doudian/aftersales_latest.json',
  OPS_ADVICE_FILE:  process.env.OPS_ADVICE_FILE  || '/opt/wecom-openclaw/logs/doudian/ops-advice_latest.json',
  SYNC_REPORT_FILE: process.env.SYNC_REPORT_FILE || '/opt/wecom-openclaw/logs/doudian/sync_report_latest.json',

  // 日志
  LOG_DIR:  process.env.LOG_DIR  || '/opt/wecom-openclaw/logs/',
  LOG_BASE:  'wecom-runtime',   // logger 自动追加 .YYYY-MM-DD.log

  // 企微配置 (可从 .env 覆盖)
  WECOM: {
    CORP_ID:       process.env.WECOM_CORP_ID   || '',
    SECRET:        process.env.WECOM_SECRET     || '',
    AGENT_ID:      process.env.WECOM_AGENT_ID  || '1000006',
    PUSH_USERS:    (process.env.WECOM_PUSH_USER || '').split(',').map(function(s) { return s.trim(); }).filter(Boolean),
    PUSH_ENABLED:  process.env.PUSH_ENABLED === 'true',
    PUSH_CRON:     process.env.PUSH_CRON        || '0 8 * * *',
  },
};
