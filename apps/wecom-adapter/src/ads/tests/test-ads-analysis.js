const path = require('path');
const { analyzeLatest } = require('../ads-analysis');

const mockDataPath = path.join(__dirname, 'mock-data', 'ads-report_latest.json');
console.log('=== \u6295\u6d41\u5206\u6790\u6d4b\u8bd5\u8f93\u51fa ===\n');
const report = analyzeLatest(mockDataPath);
console.log(report);
console.log('\n=== \u6d4b\u8bd5\u5b8c\u6210 ===');
