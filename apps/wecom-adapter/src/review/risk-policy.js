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

// ═══════════════════════════════════════════
// 新 API (供 AI Orchestrator 等新调用方)
// ═══════════════════════════════════════════

// 增强版规则（独立于旧 RULES，不互相影响）
const ENHANCED_RULES = [
  { pattern: /\.env$/, score: 35, type: 'env', description: '环境变量文件' },
  { pattern: /\.pem$/, score: 25, type: 'pem', description: '私钥文件(.pem)' },
  { pattern: /\.key$/, score: 25, type: 'key', description: '密钥文件(.key)' },
  { pattern: /nginx/, score: 20, type: 'nginx', description: 'Nginx配置文件' },
  { pattern: /deploy/, score: 20, type: 'deploy', description: '部署脚本或配置' },
  { pattern: /PM2/i, score: 15, type: 'pm2', description: 'PM2配置文件' },
  { pattern: /wecom.*callback|encrypt|decrypt|wecom.*crypto/i, score: 25, type: 'wecom_crypto', description: '企业微信加密/解密主链路' },
  { pattern: /force.*push|git.*push.*-f|main.*develop.*force/i, score: 20, type: 'force_push', description: '包含 force push 操作的脚本' },
  { pattern: /logs|node_modules|storage|cookies|screenshots/, score: 10, type: 'misc', description: '运行时/缓存/存储目录' },
];

const NO_TEST_PENALTY = 25;

/**
 * 新评分引擎（增强规则，带上下文感知）
 * @param {object} input - { files: string[], testCommandsRun?: string[], patchSize?: number, aiOutput?: string }
 * @returns {object} { riskScore, forbiddenHits }
 */
function scoreRisk(input) {
  if (!input || !Array.isArray(input.files)) {
    throw new Error('input.files 必须为数组');
  }

  const files = input.files;
  const testCommandsRun = input.testCommandsRun;
  const patchSize = input.patchSize;
  const aiOutput = input.aiOutput || '';

  // 空 patch 且无 AI 输出 → 最高风险（不应出现的状态）
  if (patchSize === 0 && (!aiOutput || aiOutput.trim().length === 0)) {
    return { riskScore: 100, forbiddenHits: [] };
  }

  // 有 AI 输出但无 patch → 按内容长度计算基础风险（WorkBuddy 场景）
  if (patchSize === 0 && aiOutput && aiOutput.trim().length > 0) {
    const contentLines = aiOutput.split('\n').filter(l => l.trim().length > 0).length;
    // 内容越充实，风险越低（说明 WorkBuddy 确实产出了东西）
    const baseScore = contentLines > 20 ? 10 : contentLines > 5 ? 25 : 40;
    return {
      riskScore: baseScore,
      forbiddenHits: [],
      _source: 'aiOutput',
      _aiOutputLines: contentLines,
    };
  }

  const hits = [];

  for (const file of files) {
    for (const rule of ENHANCED_RULES) {
      if (rule.pattern.test(file)) {
        hits.push({ file, score: rule.score });
      }
    }
  }

  let riskScore = hits.reduce((sum, h) => sum + h.score, 0);

  // 缺少测试执行记录 → 附加扣分
  if (Array.isArray(testCommandsRun) && testCommandsRun.length === 0) {
    riskScore += NO_TEST_PENALTY;
  }

  riskScore = Math.min(riskScore, 100);

  // 违禁文件列表（去重）
  const forbiddenHits = [...new Set(hits.map(h => h.file))];

  return { riskScore, forbiddenHits };
}

/**
 * 分数 → 风险等级映射
 * @param {number} score - 风险评分 (0-100)
 * @returns {string} 'high' | 'medium' | 'low'
 */
function classifyRisk(score) {
  if (score >= 80) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

/**
 * 从结构化输入构建完整审查结果
 * @param {object} input - { files: string[], testCommandsRun?: string[], patchSize?: number }
 * @returns {object} { riskScore, level, forbiddenHits, mergeAdvice, checklist }
 */
function buildRiskReview(input) {
  const { riskScore, forbiddenHits } = scoreRisk(input);
  const level = classifyRisk(riskScore);

  let mergeAdvice;
  if (level === 'high') mergeAdvice = '禁止合并，需移除敏感文件';
  else if (level === 'medium') mergeAdvice = '谨慎合并，需人工复核敏感项';
  else mergeAdvice = '可合并，建议清理非必要文件';

  return {
    riskScore,
    level,
    forbiddenHits,
    mergeAdvice,
    checklist: [...BASE_CHECKLIST],
  };
}

module.exports = {
  // 旧兼容 API
  analyzeRisk,
  RULES,
  LEVELS,
  BASE_CHECKLIST,
  // 新 API
  scoreRisk,
  classifyRisk,
  buildRiskReview,
};
