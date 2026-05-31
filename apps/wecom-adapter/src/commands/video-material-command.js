'use strict';

// P14.3 Video Asset Match Command — WeCom /video-material command
// REVIEW_ONLY=true — no real video generated, no auto publish, no auto launch

var engine, sg, productAsset;
try { engine = require('../video-material/engine'); } catch (e) { /* P14.1 optional */ }
try { sg = require('../video-material/script-generator'); } catch (e) { /* P14.2 optional */ }
try { productAsset = require('../product-asset/index'); } catch (e) { /* P13 optional */ }

var desc = '视频素材引擎: 创建视频计划、生成脚本、匹配素材 (REVIEW_ONLY)';

async function execute(ctx, args) {
  args = (args || '').trim();
  if (!args || args === '帮助' || args === 'help') return showHelp();

  var parts = args.split(/\s+/);
  var sub = parts[0];
  var rest = parts.slice(1).join(' ');

  switch (sub) {
    case '创建': return handleCreate(rest);
    case '脚本': return handleScript(rest);
    case '查看': return handleView(rest);
    case '列表': return handleList();
    case '匹配': return handleMatch(rest);
    default: return 'Unknown sub-command: ' + sub + '\n\n' + showHelp();
  }
}

function showHelp() {
  var lines = [
    '# Video Material Engine v1',
    '',
    'REVIEW_ONLY=true — 不生成真实视频，不自动发布，不自动投流',
    '',
    'Usage:',
    '  /视频素材 创建 <产品ID>',
    '  /视频素材 脚本 <planId>',
    '  /视频素材 查看 <planId>',
    '  /视频素材 列表',
    '  /视频素材 匹配 <planId>',
    '',
    'Aliases: /video-material /素材匹配 /视频计划'
  ];
  return lines.join('\n');
}

function handleCreate(productId) {
  if (!productId) return '❌ 请提供产品 ID\n\nUsage: /视频素材 创建 <产品ID>';

  if (!engine) return '⚠️ P14.1 Video Material Engine 未安装，无法创建计划。';

  try {
    var plan = engine.createVideoPlan({
      productId: productId,
      goal: 'promote_product',
      platform: 'douyin',
      duration: 30
    });

    return [
      '# ✅ 视频计划已创建',
      '',
      '| Field | Value |',
      '|-------|-------|',
      '| planId | ' + plan.planId + ' |',
      '| productId | ' + plan.productId + ' |',
      '| status | ' + plan.status + ' |',
      '| platform | ' + plan.platform + ' |',
      '| duration | ' + plan.duration + 's |',
      '| segments | ' + plan.segments.length + ' |',
      '| reviewRequired | ' + plan.reviewRequired + ' |',
      '',
      'Next: /视频素材 脚本 ' + plan.planId,
      'REVIEW_ONLY=true'
    ].join('\n');
  } catch (e) {
    return '❌ 创建失败: ' + e.message;
  }
}

function handleScript(planId) {
  if (!planId) return '❌ 请提供 planId\n\nUsage: /视频素材 脚本 <planId>';

  if (!sg) return '⚠️ P14.2 Script Generator 未安装，无法生成脚本。';

  try {
    var plan = engine.getPlan(planId);
    if (!plan) return '❌ Plan not found: ' + planId;

    var script = sg.generateScript({
      planId: planId,
      productInfo: { name: plan.productId, painPoint: '效率低', feature: plan.goal },
      style: 'short_video',
      tone: 'direct_sales',
      offer: '立即体验'
    });

    sg.attachScriptToPlan(planId, script);

    return [
      '# ✅ 视频脚本已生成',
      '',
      '| Field | Value |',
      '|-------|-------|',
      '| scriptId | ' + script.scriptId + ' |',
      '| planId | ' + script.planId + ' |',
      '| hook | ' + script.hook.substring(0, 40) + '... |',
      '| cta | ' + script.cta.substring(0, 40) + '... |',
      '| scenes | ' + script.scenes.length + ' |',
      '| style | ' + script.style + ' |',
      '| duration | ' + script.duration + 's |',
      '| reviewRequired | ' + script.reviewRequired + ' |',
      '',
      'Next: /视频素材 匹配 ' + planId,
      'REVIEW_ONLY=true'
    ].join('\n');
  } catch (e) {
    return '❌ 脚本生成失败: ' + e.message;
  }
}

function handleView(planId) {
  if (!planId) return '❌ 请提供 planId';
  if (!engine) return '⚠️ P14.1 Video Material Engine 未安装。';

  var plan = engine.getPlan(planId);
  if (!plan) return '❌ Plan not found: ' + planId;

  var lines = [
    '# Video Plan: ' + planId,
    '',
    '| Field | Value |',
    '|-------|-------|',
    '| planId | ' + plan.planId + ' |',
    '| productId | ' + plan.productId + ' |',
    '| goal | ' + plan.goal + ' |',
    '| status | ' + plan.status + ' |',
    '| platform | ' + plan.platform + ' |',
    '| duration | ' + plan.duration + 's |',
    '| segments | ' + plan.segments.length + ' |',
    '| assets | ' + plan.assets.length + ' |',
    '| scriptId | ' + (plan.scriptId || '—') + ' |',
    '| reviewRequired | ' + plan.reviewRequired + ' |',
    '',
    'REVIEW_ONLY=true'
  ];

  if (plan.scriptId && sg) {
    var script = sg.getScript(plan.scriptId);
    if (script) {
      lines.push('');
      lines.push('## Script Preview');
      lines.push('');
      lines.push('**Hook:** ' + script.hook);
      lines.push('**CTA:** ' + script.cta);
    }
  }

  return lines.join('\n');
}

function handleList() {
  if (!engine) return '⚠️ P14.1 Video Material Engine 未安装。';

  var plans = engine.listPlans();
  if (plans.length === 0) return '# Video Plans\n\nNo plans found.\n\nREVIEW_ONLY=true';

  var lines = ['# Video Plans (' + plans.length + ')', ''];
  lines.push('| planId | productId | status | platform | duration | segments | script |');
  lines.push('|--------|-----------|--------|----------|----------|----------|--------|');
  plans.forEach(function (p) {
    lines.push('| ' + p.planId + ' | ' + p.productId + ' | ' + p.status + ' | ' + p.platform + ' | ' + p.duration + 's | ' + p.segments.length + ' | ' + (p.scriptId ? '✅' : '—') + ' |');
  });
  lines.push('');
  lines.push('REVIEW_ONLY=true');
  return lines.join('\n');
}

function handleMatch(planId) {
  if (!planId) return '❌ 请提供 planId\n\nUsage: /视频素材 匹配 <planId>';

  if (!engine) return '⚠️ P14.1 Video Material Engine 未安装。';

  var plan = engine.getPlan(planId);
  if (!plan) return '❌ Plan not found: ' + planId;

  var matchedCount = 0;

  // Try P13 Product Asset System
  if (productAsset) {
    try {
      var matches = productAsset.matchForTask({ type: 'video', tags: [plan.goal], category: 'video_clip' });
      matches.forEach(function (m) {
        engine.attachAsset(planId, m.asset.id);
        matchedCount++;
      });
    } catch (e) { /* P13 unavailable, skip */ }
  }

  // Add default asset if none matched
  if (matchedCount === 0) {
    engine.attachAsset(planId, 'default-video-template-001');
    engine.attachAsset(planId, 'background-music-default');
    matchedCount = 2;
  }

  return [
    '# Video Asset Match',
    '',
    '| Field | Value |',
    '|-------|-------|',
    '| planId | ' + planId + ' |',
    '| status | ' + plan.status + ' |',
    '| matched assets | ' + matchedCount + ' |',
    '| total assets | ' + plan.assets.length + ' |',
    '| P13 available | ' + (!!productAsset) + ' |',
    '',
    'REVIEW_ONLY=true — 不自动发布视频，不自动投流'
  ].join('\n');
}

module.exports = { execute: execute, desc: desc };
