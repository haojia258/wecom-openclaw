'use strict';

/**
 * test-review-engine.js - review-engine 测试
 * 测试聚合、格式化，验证 risk-policy 集成
 */

const path = require('path');
const fs = require('fs');

// 设置 projectRoot 为当前目录
const PROJECT_ROOT = __dirname;

// 创建临时测试文件
const TMP_DIR = path.join(PROJECT_ROOT, '.test-tmp');

function setup() {
  if (!fs.existsSync(TMP_DIR)) {
    fs.mkdirSync(TMP_DIR, { recursive: true });
  }
  fs.writeFileSync(path.join(TMP_DIR, 'index.js'), 'const x = 1;\nconsole.log(x);\n');
  fs.writeFileSync(path.join(TMP_DIR, '.env'), 'DB_HOST=localhost\nDB_PORT=3306\n');
  fs.writeFileSync(path.join(TMP_DIR, 'deploy.sh'), '#!/bin/bash\necho "deploying..."\n');
  fs.writeFileSync(path.join(TMP_DIR, 'utils.js'), '// utility functions\nfunction add(a,b){return a+b;}\n');
  fs.writeFileSync(path.join(TMP_DIR, 'nginx.conf'), 'server { listen 80; }\n');
}

function cleanup() {
  if (fs.existsSync(TMP_DIR)) {
    const files = fs.readdirSync(TMP_DIR);
    for (const f of files) {
      fs.unlinkSync(path.join(TMP_DIR, f));
    }
    fs.rmdirSync(TMP_DIR);
  }
}

// ═══════════════════════════════════════════
// 测试
// ═══════════════════════════════════════════
let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    passed++;
  } else {
    failed++;
    console.error('  FAIL: ' + msg);
  }
}

setup();

try {
  const { review, formatReport, collectFiles } = require('../review-engine');

  // 测试 1: 扫描目录收集文件
  console.log('1. collectFiles()');
  const files = collectFiles(TMP_DIR, TMP_DIR);
  assert(files.length >= 4, '应收集到至少 4 个文件，实际: ' + files.length);
  assert(files.includes('.env'), '应包含 .env');
  assert(files.includes('deploy.sh'), '应包含 deploy.sh');
  assert(files.includes('nginx.conf'), '应包含 nginx.conf');

  // 测试 2: review() 非敏感目录
  console.log('2. review() 纯代码目录');
  const safeDir = path.join(TMP_DIR, 'safe');
  fs.mkdirSync(safeDir);
  fs.writeFileSync(path.join(safeDir, 'app.js'), 'const app = {};\n');
  fs.writeFileSync(path.join(safeDir, 'utils.js'), 'module.exports = {};\n');
  const safeResult = review(safeDir, { projectRoot: TMP_DIR });
  assert(safeResult.riskResult.level === 'low', '纯代码应为 low 等级，实际: ' + safeResult.riskResult.level);
  assert(safeResult.riskResult.forbiddenHits.length === 0, '纯代码不应有风险命中');
  assert(safeResult.stats.fileCount === 2, '应有 2 个文件');
  fs.unlinkSync(path.join(safeDir, 'app.js'));
  fs.unlinkSync(path.join(safeDir, 'utils.js'));
  fs.rmdirSync(safeDir);

  // 测试 3: review() 含敏感文件
  console.log('3. review() 含敏感文件目录');
  const result = review(TMP_DIR, { projectRoot: TMP_DIR });
  assert(result.riskResult.riskScore > 0, '应有风险评分');
  assert(result.riskResult.forbiddenHits.length >= 2, '应有风险命中（.env/nginx/deploy）');
  assert(result.stats.fileCount > 0, '应有文件统计');

  // 测试 4: risk-policy 集成（验证规则来自 risk-policy）
  console.log('4. risk-policy 集成验证');
  assert(typeof result.riskResult.riskScore === 'number', 'riskScore 应为数字');
  assert(typeof result.riskResult.level === 'string', 'level 应为字符串');
  assert(Array.isArray(result.riskResult.forbiddenHits), 'forbiddenHits 应为数组');
  assert(typeof result.riskResult.mergeAdvice === 'string', 'mergeAdvice 应为字符串');
  assert(Array.isArray(result.riskResult.checklist), 'checklist 应为数组');

  // 测试 5: 格式化报告包含所有部分
  console.log('5. formatReport() 输出完整性');
  assert(result.report.includes('AI 代码审查报告'), '应包含标题');
  assert(result.report.includes('【基本信息】'), '应包含基本信息');
  assert(result.report.includes('【风险命中】'), '应包含风险命中');
  assert(result.report.includes('【合并建议】'), '应包含合并建议');
  assert(result.report.includes('【检查清单】'), '应包含检查清单');
  assert(result.report.includes('【审查文件】'), '应包含审查文件');

  // 测试 6: 空路径处理
  console.log('6. 空路径处理');
  const emptyDir = path.join(TMP_DIR, 'empty');
  if (!fs.existsSync(emptyDir)) fs.mkdirSync(emptyDir);
  const emptyResult = review(emptyDir, { projectRoot: TMP_DIR });
  assert(emptyResult.files.length === 0, '空目录应有 0 个文件');
  assert(emptyResult.riskResult.riskScore === 0, '空目录评分应为 0');
  fs.rmdirSync(emptyDir);

  // 测试 7: 单文件审查
  console.log('7. 单文件审查');
  const singleResult = review(path.join(TMP_DIR, '.env'), { projectRoot: TMP_DIR });
  assert(singleResult.files.length === 1, '单文件应有 1 个文件');
  assert(singleResult.files[0] === '.env', '文件路径应对齐');
  assert(singleResult.riskResult.forbiddenHits.length === 1, '.env 应命中');
  assert(singleResult.riskResult.riskScore === 30, '.env 规则分数应为 30，实际: ' + singleResult.riskResult.riskScore);

  // 测试 8: 不存在的路径
  console.log('8. 不存在路径');
  const noneResult = review('/tmp/not-exist-review-path', { projectRoot: TMP_DIR });
  assert(noneResult.files.length === 0, '不存在路径应有 0 个文件');
  assert(noneResult.riskResult.riskScore === 0, '不存在路径评分应为 0');

  // 测试 9: 报告边界（0 文件的情况）
  console.log('9. 0 文件报告');
  assert(typeof noneResult.report === 'string', '0 文件也应返回报告字符串');

} catch (e) {
  console.error('测试异常:', e.message);
  console.error(e.stack);
  failed++;
} finally {
  cleanup();
}

// 结果
console.log('');
console.log('═══════════════════');
console.log('通过: ' + passed + ' / 失败: ' + failed);
console.log('═══════════════════');

if (failed > 0) {
  process.exit(1);
}
