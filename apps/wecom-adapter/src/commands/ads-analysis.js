'use strict';

/**
 * /投流分析 命令
 * 调用 ads 模块生成投流分析报告
 */

const adsAnalysis = require('../ads/ads-analysis');
const fs = require('fs');
const path = require('path');

const DATA_PATH = path.resolve(__dirname, '../../../logs/ads/ads-report_latest.json');

async function execute(ctx) {
  try {
    // 检查数据文件是否存在
    if (!fs.existsSync(DATA_PATH)) {
      return '暂未采集到投流数据，请先执行投流数据采集\n\n💡 数据路径：logs/ads/ads-report_latest.json\n\n可手动上传数据文件后重试';
    }
    const report = adsAnalysis.analyzeLatest(DATA_PATH);
    if (!report) {
      return '投流数据分析失败，请稍后再试';
    }
    return report;
  } catch (e) {
    return '投流分析暂不可用：' + e.message.slice(0, 120);
  }
}

module.exports = { execute, desc: '投流ROI分析' };
