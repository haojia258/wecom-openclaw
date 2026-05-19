'use strict';

/**
 * /运营分析 命令
 * v2.0 - 调用 ai/index.js ops-analysis 模块
 * 职责：读数据 → 转换格式 → 调 AI → 返回结果
 * 不包含：业务规则、prompt、score 逻辑
 */

const fs = require('fs');
const { opsAnalysis } = require('../ai/index');
const config = require('../lib/config');

const TIMEOUT_MS = 4000;
const MAX_LEN = 1800;

function readJson(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_) {
    return null;
  }
}

function safeNum(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : (fallback || 0);
}

function clamp(text, max) {
  if (text.length <= max) return text;
  return text.slice(0, max - 3) + '...';
}

/**
 * 从磁盘数据构建 AI 模块需要的 input 结构
 */
function buildAiInput() {
  const compass = readJson(config.COMPASS_FILE);
  const orders = readJson(config.ORDERS_FILE);
  const aftersales = readJson(config.AFTERSALES_FILE);
  const skuProfit = readJson(config.SKU_PROFIT_FILE);

  // ─── GMV ratio ───
  let gmvRatio = null;
  if (compass) {
    const d1 = compass['近1天'] || compass['1天'] || compass['today'] || {};
    const d7 = compass['近7天'] || compass['7天'] || compass['week'] || {};
    const today = safeNum(d1['结算金额'], null);
    const week = safeNum(d7['结算金额'], null);
    if (today !== null && week !== null && week > 0) {
      gmvRatio = (today * 7) / week; // 日均/7日日均
    } else if (today !== null) {
      gmvRatio = 1.0; // 无对比数据，默认健康
    }
  }

  // ─── 售后率 ───
  let aftersaleRate = null;
  if (aftersales) {
    const items = Array.isArray(aftersales) ? aftersales : (aftersales.items || aftersales.data || []);
    const total = safeNum(aftersales.total, items.length);
    if (orders) {
      const orderCount = safeNum(orders.total, 0);
      if (orderCount > 0 && total > 0) {
        aftersaleRate = total / orderCount;
      }
    }
  }

  // ─── 风险等级 ───
  let riskLevel = null;
  const riskFile = readJson(config.AFTERSALES_FILE.replace('aftersales', 'check-risk'));
  if (riskFile && riskFile.risks) {
    riskLevel = Math.min(1, riskFile.risks.length * 0.2);
  }

  // ─── SKU 利润率 ───
  let avgMargin = null;
  if (skuProfit) {
    const skus = Array.isArray(skuProfit) ? skuProfit : (skuProfit.skus || skuProfit.data || []);
    if (skus.length > 0) {
      let sum = 0;
      for (const s of skus) {
        sum += safeNum(s.margin, safeNum(s.profitMargin, safeNum(s.avgMargin, 0.2)));
      }
      avgMargin = sum / skus.length;
    }
  }

  const input = {};
  if (gmvRatio !== null) input.gmv = { ratio: Math.round(gmvRatio * 100) / 100 };
  if (aftersaleRate !== null) input.aftersale = { rate: Math.round(aftersaleRate * 1000) / 1000 };
  if (riskLevel !== null) input.risk = { level: Math.round(riskLevel * 100) / 100 };
  if (avgMargin !== null) input.skuProfit = { avgMargin: Math.round(avgMargin * 100) / 100 };
  // activity 暂无数据源
  input.activity = { roi: 2.0 }; // 默认值，待接入

  return input;
}

/**
 * 超时工具
 */
function timeoutPromise(ms) {
  return new Promise(function(_, reject) {
    setTimeout(function() { reject(new Error('TIMEOUT')); }, ms);
  });
}

async function execute(ctx) {
  // 1. 构建输入
  const aiInput = buildAiInput();

  // 2. 调用 AI 模块（带超时保护）
  let result;
  try {
    result = await Promise.race([
      opsAnalysis.analyze(aiInput),
      timeoutPromise(TIMEOUT_MS),
    ]);
  } catch (_) {
    // 超时或异常 → 直接返回兜底文本，保证不静默
    return 'AI处理中，请稍后再试';
  }

  // 3. 优先返回 AI 增强结果，fallback 保底
  const output = clamp(result.report || result.fallback || '运营分析无结果', MAX_LEN);
  return output;
}

module.exports = { execute, desc: '运营分析' };
