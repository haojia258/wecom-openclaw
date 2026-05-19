// 广告模块入口
const { analyzeAdPerformance } = require('./ads-rules');

module.exports = {
  analyzeAd: analyzeAdPerformance,
  ...require('./ads-rules'),
};
