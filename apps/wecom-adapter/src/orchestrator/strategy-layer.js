/**
 * strategy-layer.js
 * Runtime Expansion Phase1 - Strategy Layer
 *
 * 所有策略配置化（JSON 文件），不硬编码在业务代码中。
 * 支持策略类型：review / retry / fallback / approval
 */

const path = require('path');
const fs = require('fs');

// 策略目录（相对于 orchestrator 根目录）
var STRATEGY_DIR = path.join(__dirname, 'runtime-expansion', 'strategies');

// 缓存
var _strategyCache = null;

/**
 * 加载策略配置（带缓存）
 */
function _loadStrategies() {
  if (_strategyCache) return _strategyCache;

  _strategyCache = {};
  var dir = STRATEGY_DIR;

  if (!fs.existsSync(dir)) {
    // 返回内置默认策略
    _strategyCache = getDefaultStrategies();
    return _strategyCache;
  }

  var files = fs.readdirSync(dir).filter(function (f) { return f.endsWith('.json'); });
  files.forEach(function (f) {
    try {
      var content = fs.readFileSync(path.join(dir, f), 'utf8');
      var cfg = JSON.parse(content);
      var name = f.replace(/\.json$/, '');
      _strategyCache[name] = cfg;
    } catch (e) {
      // 跳过无效文件
    }
  });

  // 如果没有加载到任何策略，使用默认策略
  if (Object.keys(_strategyCache).length === 0) {
    _strategyCache = getDefaultStrategies();
  }

  return _strategyCache;
}

/**
 * 获取默认策略（内置，不依赖文件系统）
 */
function getDefaultStrategies() {
  var strategies = {};

  // 默认审查策略
  strategies['default-review'] = {
    name: 'default-review',
    type: 'review_strategy',
    autoApprove: false,
    riskThreshold: 40,
    requireManualReview: true,
    description: '默认审查策略：风险分 >=40 需人工审查',
  };

  // 默认重试策略
  strategies['default-retry'] = {
    name: 'default-retry',
    type: 'retry_strategy',
    maxRetries: 3,
    backoffMs: 1000,
    retryableErrors: ['ECONNREFUSED', 'ETIMEOUT', 'rate_limit'],
    description: '默认重试策略：最多 3 次，指数退避',
  };

  // 默认回退策略
  strategies['default-fallback'] = {
    name: 'default-fallback',
    type: 'fallback_strategy',
    fallbackChain: ['workbuddy', 'codex', 'deepseek'],
    stopOnSuccess: true,
    description: '默认回退策略：依次尝试 workbuddy → codex → deepseek',
  };

  // 默认审批策略
  strategies['default-approval'] = {
    name: 'default-approval',
    type: 'approval_strategy',
    autoApproveSafeTasks: true,
    safeTaskPatterns: ['ops_analysis', 'daily_report', 'data_analysis'],
    alwaysManualReview: ['code_change', 'patch_generation', 'deploy'],
    description: '默认审批策略：安全任务自动审批，危险任务人工审查',
  };

  return strategies;
}

/**
 * 获取策略
 * @param {string} type - 策略类型（review / retry / fallback / approval）
 * @param {object} [context] - 上下文（可选，用于策略选择）
 * @returns {object|null}
 */
function getStrategy(type, context) {
  var strategies = _loadStrategies();
  var prefix = (type || 'default') + '-';

  // 精确匹配：{type}-{context.intent}
  if (context && context.intent) {
    var preciseKey = prefix + context.intent;
    if (strategies[preciseKey]) return strategies[preciseKey];
  }

  // 降级：{type}-default
  var defaultKey = 'default-' + type;
  if (strategies[defaultKey]) return strategies[defaultKey];

  // 再降级：任何匹配 prefix 的策略
  var keys = Object.keys(strategies);
  for (var i = 0; i < keys.length; i++) {
    if (keys[i].startsWith(prefix)) return strategies[keys[i]];
  }

  return null;
}

/**
 * 列出所有策略
 * @returns {object[]}
 */
function listStrategies() {
  var strategies = _loadStrategies();
  return Object.entries(strategies).map(function (entry) {
    var name = entry[0];
    var cfg = entry[1];
    return {
      name: name,
      type: cfg.type || 'unknown',
      description: cfg.description || '',
    };
  });
}

/**
 * 重新加载策略（清除缓存）
 */
function reloadStrategies() {
  _strategyCache = null;
  return _loadStrategies();
}

module.exports = {
  getStrategy: getStrategy,
  listStrategies: listStrategies,
  reloadStrategies: reloadStrategies,
  _loadStrategies: _loadStrategies, // 测试用
  STRATEGY_DIR: STRATEGY_DIR,
};
