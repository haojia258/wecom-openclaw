/**
 * 风险评分规则引擎 v0.1
 * 输入：文件路径数组
 * 输出：风险评分、等级、违禁命中、合并建议、检查清单
 */

// 规则定义：每条规则包含匹配模式、风险分数、描述
const RULES = [
  // 最高危敏感文件
  { pattern: /\.env$/, score: 30, type: 'env', description: '环境变量文件' },
  { pattern: /\.pem$/, score: 25, type: 'pem', description: '私钥文件(.pem)' },
  { pattern: /\.key$/, score: 25, type: 'key', description: '密钥文件(.key)' },
  // 配置/部署相关
  { pattern: /nginx/, score: 15, type: 'nginx', description: 'Nginx配置文件' },
  { pattern: /deploy/, score: 15, type: 'deploy', description: '部署脚本或配置' },
  { pattern: /PM2/i, score: 10, type: 'pm2', description: 'PM2配置文件' },
  // 企业微信主链路 (加密/解密/回调)
  { pattern: /wecom.*callback|encrypt|decrypt|wecom.*crypto/i, score: 20, type: 'wecom_crypto', description: '企业微信加密/解密主链路' },
  // 危险操作脚本 (force push)
  { pattern: /force.*push|git.*push.*-f|main.*develop.*force/i, score: 20, type: 'force_push', description: '包含 force push 操作的脚本' },
  // 运行时/缓存/存储目录
  { pattern: /logs/, score: 5, type: 'logs', description: '日志目录' },
  { pattern: /node_modules/, score: 5, type: 'node_modules', description: 'node_modules目录' },
  { pattern: /storage/, score: 5, type: 'storage', description: '存储目录' },
  { pattern: /cookies/, score: 5, type: 'cookies', description: 'Cookie文件' },
  { pattern: /screenshots/, score: 5, type: 'screenshots', description: '截图目录' },
];

// 风险等级阈值
const LEVELS = [
  { min: 0, max: 20, level: 'low', advice: '可合并，建议清理非必要文件' },
  { min: 21, max: 40, level: 'medium', advice: '谨慎合并，需人工复核敏感项' },
  { min: 41, max: 70, level: 'high', advice: '禁止合并，需移除敏感文件' },
  { min: 71, max: 100, level: 'critical', advice: '严重风险，立即阻断合并' },
];

// 基础检查清单 (不依赖命中，始终列出)
const BASE_CHECKLIST = [
  '确认无 .env / .pem / .key 等密钥文件',
  '检查 nginx / deploy / PM2 配置是否脱敏',
  '确保企业微信加解密代码未泄漏',
  '移除 logs / node_modules / storage / cookies / screenshots',
  '禁止包含 force push 操作的脚本',
];

/**
 * 分析文件路径，返回风险评分及详细结果
 * @param {string[]} files - 文件路径数组
 * @returns {object} { riskScore, level, forbiddenHits, mergeAdvice, checklist }
 */
function analyzeRisk(files) {
  if (!Array.isArray(files)) {
    throw new Error('参数 files 必须为数组');
  }

  const hits = [];       // 存储命中的 { file, rule }
  const hitTypes = new Set();

  for (const file of files) {
    for (const rule of RULES) {
      if (rule.pattern.test(file)) {
        hits.push({ file, rule });
        hitTypes.add(rule.type);
      }
    }
  }

  // 计算总分 (每个文件每个规则独立计分，但同一文件多个规则累加)
  let riskScore = hits.reduce((sum, hit) => sum + hit.rule.score, 0);
  riskScore = Math.min(riskScore, 100); // 上限100

  // 确定等级和建议
  let levelInfo = LEVELS.find(l => riskScore >= l.min && riskScore <= l.max);
  if (!levelInfo) levelInfo = LEVELS[LEVELS.length - 1]; // fallback

  const level = levelInfo.level;
  const mergeAdvice = levelInfo.advice;

  // 违禁命中列表 (去重，仅展示文件路径)
  const forbiddenHits = [...new Map(hits.map(hit => [hit.file, hit.file])).values()];

  // 动态扩展检查清单：根据实际命中类型添加针对性条目
  const dynamicChecklist = [...BASE_CHECKLIST];
  if (hitTypes.has('env')) dynamicChecklist.push('· 移除 .env 文件，使用环境变量注入');
  if (hitTypes.has('pem') || hitTypes.has('key')) dynamicChecklist.push('· 私钥文件严禁入库，立即删除并更换');
  if (hitTypes.has('nginx')) dynamicChecklist.push('· Nginx 配置中隐藏真实IP/证书路径');
  if (hitTypes.has('wecom_crypto')) dynamicChecklist.push('· 企业微信加解密代码已命中，请移至安全环境');
  if (hitTypes.has('force_push')) dynamicChecklist.push('· 检测到 force push 脚本，禁止合并到主分支');

  return {
    riskScore,
    level,
    forbiddenHits,
    mergeAdvice,
    checklist: dynamicChecklist,
  };
}

module.exports = { analyzeRisk, RULES, LEVELS, BASE_CHECKLIST };
