'use strict';

// P14.2 Video Script Generator
const engine = require('./engine');
const fs = require('fs');
const path = require('path');

var SCRIPTS_DIR = path.resolve(__dirname, '../../storage/video-material/scripts');

function ensureScriptsDir() {
  if (!fs.existsSync(SCRIPTS_DIR)) {
    fs.mkdirSync(SCRIPTS_DIR, { recursive: true });
  }
}

var VALID_STYLES = ['short_video', 'live_stream', 'promo', 'tutorial', 'review'];
var VALID_TONES = ['direct_sales', 'educational', 'storytelling', 'humor', 'professional'];

function generateScript(opts) {
  if (!opts.planId) throw new Error('planId is required');
  if (!opts.productInfo) throw new Error('productInfo is required');

  var plan = engine.getPlan(opts.planId);
  var scriptId = 'vs-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 6);
  var style = opts.style || 'short_video';
  var tone = opts.tone || 'direct_sales';
  var duration = opts.duration || (plan ? plan.duration : 30);

  var hook = generateHook(opts.productInfo, opts.goal || (plan ? plan.goal : 'promotion'));
  var cta = generateCTA(opts.productInfo, opts.offer || '立即行动');
  var scenes = buildScenes(duration, style, tone);

  var script = {
    scriptId: scriptId,
    planId: opts.planId,
    title: (opts.productInfo.name || 'Product') + ' - ' + style + ' Script',
    hook: hook,
    scenes: scenes,
    voiceover: '欢迎观看' + (opts.productInfo.name || '本产品') + '的详细介绍。' + hook,
    captions: scenes.map(function (s, i) { return '【Scene ' + (i + 1) + '】' + s.heading; }),
    cta: cta,
    style: style,
    tone: tone,
    duration: duration,
    reviewRequired: true,
    reviewOnly: true,
    requiresHumanApproval: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  ensureScriptsDir();
  fs.writeFileSync(path.join(SCRIPTS_DIR, scriptId + '.json'), JSON.stringify(script, null, 2), 'utf-8');

  return script;
}

function generateHook(productInfo, goal) {
  var name = productInfo.name || '这个产品';
  var templates = [
    '你还在为' + (productInfo.painPoint || '效率低') + '而烦恼吗？',
    name + '，彻底改变你的' + goal + '方式！',
    '揭秘：' + name + '如何帮用户实现' + goal,
    '3个步骤，用' + name + '轻松搞定' + goal
  ];
  return templates[Math.floor(Math.random() * templates.length)];
}

function generateCTA(productInfo, offer) {
  var templates = [
    '点击下方链接，立即体验！',
    '限时优惠，错过不再有！',
    '关注我们，获取更多' + (productInfo.name || '产品') + '福利',
    '马上行动，' + (offer || '专属优惠') + '等你来拿！'
  ];
  return templates[Math.floor(Math.random() * templates.length)];
}

function buildScenes(duration, style, tone) {
  var numScenes = Math.max(3, Math.floor(duration / 5));
  var sceneNames = ['开场', '痛点展示', '产品介绍', '使用场景', '效果对比', '优惠说明', '行动号召'];
  var scenes = [];
  for (var i = 0; i < numScenes; i++) {
    scenes.push({
      order: i + 1,
      heading: sceneNames[Math.min(i, sceneNames.length - 1)],
      duration: Math.round(duration / numScenes),
      description: style + ' / ' + tone + ' — Scene ' + (i + 1),
      visual: '',
      audio: ''
    });
  }
  return scenes;
}

function validateScript(script) {
  var errors = [];
  if (!script.scriptId) errors.push('Missing scriptId');
  if (!script.planId) errors.push('Missing planId');
  if (!script.hook || script.hook.length < 5) errors.push('Hook too short or missing');
  if (!script.cta || script.cta.length < 5) errors.push('CTA too short or missing');
  if (!script.scenes || script.scenes.length === 0) errors.push('Missing scenes');
  if (!script.voiceover) errors.push('Missing voiceover');
  if (script.reviewRequired !== true) errors.push('reviewRequired must be true');
  if (script.reviewOnly !== true) errors.push('reviewOnly must be true');
  return { valid: errors.length === 0, errors: errors };
}

function attachScriptToPlan(planId, script) {
  var plan = engine.getPlan(planId);
  if (!plan) throw new Error('Plan not found: ' + planId);
  plan.scriptId = script.scriptId;
  plan.updatedAt = new Date().toISOString();
  plan.segments.forEach(function (seg) {
    if (seg.type === 'hook' && script.hook) seg.content = script.hook;
    if (seg.type === 'cta' && script.cta) seg.content = script.cta;
  });
  return plan;
}

function getScript(scriptId) {
  ensureScriptsDir();
  var filePath = path.join(SCRIPTS_DIR, scriptId + '.json');
  if (!fs.existsSync(filePath)) return null;
  try { return JSON.parse(fs.readFileSync(filePath, 'utf-8')); } catch (e) { return null; }
}

function listScriptIds() {
  ensureScriptsDir();
  return fs.readdirSync(SCRIPTS_DIR)
    .filter(function (f) { return f.endsWith('.json'); })
    .map(function (f) { return f.replace('.json', ''); });
}

function _cleanup() {
  ensureScriptsDir();
  listScriptIds().forEach(function (id) {
    fs.unlinkSync(path.join(SCRIPTS_DIR, id + '.json'));
  });
}

module.exports = {
  generateScript: generateScript,
  generateHook: generateHook,
  generateCTA: generateCTA,
  validateScript: validateScript,
  attachScriptToPlan: attachScriptToPlan,
  getScript: getScript,
  listScriptIds: listScriptIds,
  _cleanup: _cleanup
};
