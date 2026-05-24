/**
 * worker-spec-parser.js
 * WorkerSpec Runtime Layer — Parser
 *
 * 解析用户输入的 WorkerSpec（自然语言或结构化格式）
 * 输出规范化的 WorkerSpec JSON。
 *
 * 支持格式：
 *   1. 自然语言：/ai调度 创建 Worker 名称:ops-monitor 类型:executor provider:openai model:gpt-4o reviewOnly blockedActions:deploy,nginx
 *   2. JSON：直接提供 JSON 对象
 *   3. 逐字段提示：缺失字段时返回表单式提示
 */

// --- 常量 ---
const VALID_PROVIDERS = ['openai', 'deepseek', 'doubao', 'claude', 'workbuddy'];
const VALID_ROLES = ['executor', 'planner', 'reviewer', 'risk_analyzer', 'reporter'];
const VALID_INTENTS = [
  'code_generation', 'code_review', 'patch_creation', 'refactoring',
  'task_planning', 'ops_analysis', 'report_generation', 'orchestration',
  'data_analysis', 'trend_prediction', 'anomaly_detection',
  'content_generation', 'video_script', 'creative_copy',
  'risk_scoring', 'rollback_planning', 'patch_review',
];

// --- 字段映射表 ---
const FIELD_ALIASES = {
  '名称':           'workerId',
  'name':          'workerId',
  'workerId':      'workerId',
  'id':            'workerId',

  '类型':           'role',
  'type':          'role',
  'role':          'role',
  'workerType':    'role',

  '提供商':         'provider',
  'provider':      'provider',
  '供应商':         'provider',

  '模型':           'model',
  'model':         'model',

  'prompt':        'promptFile',
  'promptFile':    'promptFile',
  '提示词文件':     'promptFile',

  'promptVersion': 'promptVersion',
  '版本':           'promptVersion',
  'version':       'promptVersion',

  '权限':           'allowedIntents',
  'allowedIntents':'allowedIntents',
  '允许操作':       'allowedIntents',
  'intents':       'allowedIntents',

  'blockedActions':'blockedActions',
  '禁止操作':       'blockedActions',
  'blocked':       'blockedActions',
  'forbidden':     'blockedActions',

  'reviewOnly':    'reviewOnly',
  '仅审查':         'reviewOnly',
  '审查模式':       'reviewOnly',

  'requiresHumanApproval': 'requiresHumanApproval',
  '需要人工审批':   'requiresHumanApproval',
  '人工审批':       'requiresHumanApproval',
  'humanApproval': 'requiresHumanApproval',
};

// --- 布尔值别名 ---
const TRUTHY = new Set(['true', 'yes', 'on', '1', '是', '启用', '必须']);
const FALSY = new Set(['false', 'no', 'off', '0', '否', '禁用', '无需']);

// --- 默认值 ---
const DEFAULTS = {
  promptVersion: 'v1',
  reviewOnly: true,
  requiresHumanApproval: true,
  allowedIntents: [],
  blockedActions: [],
};

/**
 * 解析 WorkerSpec 输入
 *
 * @param {string|object} input - 用户输入（文本或 JSON 对象）
 * @returns {{ spec: object|null, warnings: string[], missingFields: string[], errors: string[] }}
 */
function parseWorkerSpec(input) {
  const warnings = [];
  const errors = [];
  let raw = {};

  // 1. 判断输入类型
  if (typeof input === 'object' && input !== null && !Array.isArray(input)) {
    raw = normalizeKeys(input);
  } else if (typeof input === 'string') {
    raw = parseTextInput(input, warnings);
  } else {
    errors.push('输入必须为文本或 JSON 对象');
    return { spec: null, warnings, missingFields: [], errors };
  }

  // 2. 合并默认值
  const spec = Object.assign({}, DEFAULTS, raw);

  // 3. 规范化布尔值
  if (typeof spec.reviewOnly === 'string') {
    spec.reviewOnly = parseBool(spec.reviewOnly, true);
  }
  if (typeof spec.requiresHumanApproval === 'string') {
    spec.requiresHumanApproval = parseBool(spec.requiresHumanApproval, true);
  }

  // 4. 规范化数组字段
  if (typeof spec.allowedIntents === 'string') {
    spec.allowedIntents = parseList(spec.allowedIntents);
  }
  if (typeof spec.blockedActions === 'string') {
    spec.blockedActions = parseList(spec.blockedActions);
  }

  // 5. 检查 unknown fields
  const knownFields = Object.values(FIELD_ALIASES);
  const knownFieldsSet = new Set([...new Set(knownFields)]);
  for (const key of Object.keys(spec)) {
    if (key.startsWith('_')) continue;
    if (!knownFieldsSet.has(key)) {
      warnings.push(`未知字段: "${key}"（将保留但不影响解析）`);
    }
  }

  // 6. 生成 workerId（如果缺失）
  if (!spec.workerId) {
    const ts = Date.now().toString(36).slice(-4);
    const role = spec.role || 'worker';
    spec.workerId = `${role}-${ts}`;
    warnings.push(`workerId 未指定，已自动生成: ${spec.workerId}`);
  }

  // 7. 规范性清理
  spec.workerId = String(spec.workerId).trim().toLowerCase().replace(/\s+/g, '-');
  if (spec.role) spec.role = String(spec.role).trim().toLowerCase();
  if (spec.provider) spec.provider = String(spec.provider).trim().toLowerCase();
  if (spec.model) spec.model = String(spec.model).trim().toLowerCase();
  if (spec.promptFile) spec.promptFile = String(spec.promptFile).trim();

  // 8. 检查必需字段
  const missingFields = [];
  if (!spec.role) missingFields.push('role (类型)');
  if (!spec.provider) missingFields.push('provider (提供商)');

  return {
    spec: missingFields.length > 0 ? null : spec,
    warnings,
    missingFields,
    errors,
  };
}

/**
 * 规范化 JSON 对象的键名
 */
function normalizeKeys(obj) {
  const result = {};
  for (const key of Object.keys(obj)) {
    const value = obj[key];
    const normalized = key.trim();
    // 先精确匹配
    if (FIELD_ALIASES[normalized] !== undefined) {
      result[FIELD_ALIASES[normalized]] = value;
      continue;
    }
    // 大小写不敏感匹配
    const lower = normalized.toLowerCase();
    const matchedKey = Object.keys(FIELD_ALIASES).find(k => k.toLowerCase() === lower);
    if (matchedKey) {
      result[FIELD_ALIASES[matchedKey]] = value;
      continue;
    }
    // 未知字段直接保留
    result[normalized] = value;
  }
  return result;
}

/**
 * 解析文本输入
 * 支持格式：
 *   key:value  key=value  "key" "value"  key value
 */
function parseTextInput(text, warnings) {
  const result = {};
  if (!text || !text.trim()) return result;

  // 尝试检测结构化键值对
  // 先用一个宽松的正则匹配 field:value 对（value 允许逗号）
  const widePattern = /([^\s:：=]+?)\s*[:：=]\s*([^\s:：=]+(?:\s*,\s*[^\s:：=,]+)*)/g;
  const matches = [...text.matchAll(widePattern)];

  let found = false;
  if (matches.length > 0) {
    found = true;
    for (const match of matches) {
      const key = match[1].trim();
      const rawValue = match[2].trim().replace(/^["']|["']$/g, '');
      let finalValue = rawValue;

      // 检测逗号分隔的列表值
      if (rawValue.includes(',')) {
        finalValue = rawValue.split(',').map(s => s.trim()).filter(Boolean);
      } else if (rawValue.includes('|')) {
        finalValue = rawValue.split('|').map(s => s.trim()).filter(Boolean);
      }

      if (FIELD_ALIASES[key] !== undefined) {
        const targetKey = FIELD_ALIASES[key];
        // 对列表字段累积
        if (['allowedIntents', 'blockedActions'].includes(targetKey) && result[targetKey]) {
          const existing = Array.isArray(result[targetKey]) ? result[targetKey] : [result[targetKey]];
          if (Array.isArray(finalValue)) {
            result[targetKey] = [...existing, ...finalValue];
          } else {
            result[targetKey] = [...existing, finalValue];
          }
        } else {
          result[targetKey] = finalValue;
        }
      } else {
        warnings.push(`未识别的字段: ""${key}""`);
      }
    }
  }

  // 如果没有匹配到键值对，尝试按空格分割的首个关键词匹配
  if (!found && text.trim()) {
    const firstWord = text.trim().split(/\s+/)[0];
    if (firstWord === '创建' || firstWord === 'create') {
      // 尝试解析 "创建 Worker 名称:xxx 类型:executor ..."
      const cleanText = text.replace(/^(创建|create)\s*(Worker|worker)?\s*/i, '');
      if (cleanText) {
        return parseTextInput(cleanText, warnings);
      }
    }
  }

  if (!found && Object.keys(result).length === 0) {
    warnings.push(
      '未检测到键值对格式。支持格式：\n' +
      '  /ai调度 创建 Worker 名称:ops-monitor 类型:executor 提供商:openai 模型:gpt-4o\n' +
      '  或直接提供 JSON'
    );
  }

  return result;
}

/**
 * 解析布尔值
 */
function parseBool(value, defaultValue) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (TRUTHY.has(String(value).toLowerCase())) return true;
  if (FALSY.has(String(value).toLowerCase())) return false;
  return defaultValue;
}

/**
 * 解析逗号/顿号分隔列表
 */
function parseList(value) {
  if (Array.isArray(value)) return value;
  return String(value)
    .split(/[,，、|]/)
    .map(s => s.trim())
    .filter(Boolean);
}

/**
 * 将 WorkerSpec 格式化为可读文本
 */
function formatWorkerSpec(spec) {
  if (!spec) return '无 WorkerSpec';
  const lines = [
    '```json',
    JSON.stringify(spec, null, 2),
    '```',
  ];
  return lines.join('\n');
}

module.exports = {
  parseWorkerSpec,
  formatWorkerSpec,
  VALID_PROVIDERS,
  VALID_ROLES,
  VALID_INTENTS,
  FIELD_ALIASES,
  DEFAULTS,
};
