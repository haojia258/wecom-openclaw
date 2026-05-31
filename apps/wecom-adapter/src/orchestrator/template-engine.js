/**
 * template-engine.js
 * Runtime Expansion Phase1 - Template Layer
 *
 * 企业运营链路模板化。
 * AI 不自由推理业务链路，而是：
 *   读取模板 → 填充变量 → 输出任务
 *
 * 模板格式：JSON
 * 变量格式：{{variableName}}
 */

const path = require('path');
const fs = require('fs');

var TEMPLATE_DIR = path.join(__dirname, 'runtime-expansion', 'templates');

// 缓存
var _templateCache = null;

/**
 * 加载所有模板（带缓存）
 */
function _loadTemplates() {
  if (_templateCache) return _templateCache;

  _templateCache = {};
  var dir = TEMPLATE_DIR;

  if (!fs.existsSync(dir)) {
    return _templateCache;
  }

  var files = fs.readdirSync(dir).filter(function (f) { return f.endsWith('.json'); });
  files.forEach(function (f) {
    try {
      var content = fs.readFileSync(path.join(dir, f), 'utf8');
      var tpl = JSON.parse(content);
      var name = f.replace(/\.json$/, '');
      _templateCache[name] = tpl;
    } catch (e) {
      // 跳过无效模板
    }
  });

  return _templateCache;
}

/**
 * 加载单个模板
 * @param {string} name - 模板名称（不含 .json）
 * @returns {object|null}
 */
function loadTemplate(name) {
  if (!name) return null;
  var templates = _loadTemplates();
  return templates[name] || null;
}

/**
 * 渲染模板（只渲染 outputs 部分）
 * @param {string} name - 模板名称
 * @param {object} variables - 变量键值对
 * @returns {object} { templateName, rendered, warnings }
 */
function renderTemplate(name, variables) {
  var tpl = loadTemplate(name);
  if (!tpl) {
    return { error: 'Template not found: ' + name };
  }

  var warnings = [];
  var vars = variables || {};

  // 只渲染 outputs 部分
  var outputsTemplate = tpl.outputs || {};
  var rendered = JSON.parse(JSON.stringify(outputsTemplate));

  function replaceInObj(obj) {
    if (typeof obj === 'string') {
      return obj.replace(/\{\{(\w+)\}\}/g, function (match, varName) {
        if (vars[varName] !== undefined) {
          return vars[varName];
        }
        warnings.push('Unresolved variable: ' + varName);
        return match;
      });
    }
    if (Array.isArray(obj)) {
      return obj.map(replaceInObj);
    }
    if (obj && typeof obj === 'object') {
      var result = {};
      Object.keys(obj).forEach(function (key) {
        result[key] = replaceInObj(obj[key]);
      });
      return result;
    }
    return obj;
  }

  rendered = replaceInObj(rendered);

  return {
    templateName: name,
    rendered: rendered,
    warnings: warnings,
    renderedAt: new Date().toISOString(),
  };
}

/**
 * 列出所有可用模板
 * @returns {object[]} [{ name, description, inputs[] }]
 */
function listTemplates() {
  var templates = _loadTemplates();
  return Object.keys(templates).map(function (name) {
    var tpl = templates[name];
    return {
      name: name,
      description: tpl.description || '',
      inputs: tpl.inputs || [],
      outputs: tpl.outputs || [],
    };
  });
}

/**
 * 验证变量是否齐全
 * @param {string} name - 模板名称
 * @param {object} variables - 提供的变量
 * @returns {object} { valid, missing[] }
 */
function validateVariables(name, variables) {
  var tpl = loadTemplate(name);
  if (!tpl) return { valid: false, error: 'Template not found: ' + name };

  var required = (tpl.inputs || []).filter(function (inp) { return inp.required; }).map(function (inp) { return inp.name; });
  var provided = variables ? Object.keys(variables) : [];
  var missing = required.filter(function (r) { return provided.indexOf(r) === -1; });

  return {
    valid: missing.length === 0,
    missing: missing,
    provided: provided,
  };
}

/**
 * 清除模板缓存（测试用）
 */
function clearCache() {
  _templateCache = null;
}

module.exports = {
  loadTemplate: loadTemplate,
  renderTemplate: renderTemplate,
  listTemplates: listTemplates,
  validateVariables: validateVariables,
  clearCache: clearCache,
  _TEMPLATE_DIR: TEMPLATE_DIR,
};
