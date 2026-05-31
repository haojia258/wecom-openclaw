/**
 * today-ops-orchestrator.js
 * /今日运营 Worker Orchestration — Phase2-D
 *
 * 基于 Fixed Worker Registry + Prompt Loader 的编排层。
 * 读取运营数据 → 加载 4 个固定 Worker → 生成 dispatch plan →
 * 汇总为企业微信 Markdown 输出。
 *
 * 约束：
 *   - 不调用真实 AI API
 *   - 不新增 Worker
 *   - 不改 Prompt
 *   - reviewOnly + requiresHumanApproval
 *   - risk-review-worker 不加载 Prompt（llmEnabled=false, provider=local-rule）
 *
 * 输出必须包含：
 *   - GMV概览 / ROI概览 / 风险概览 / 活动机会 / 视频建议 / 今日建议
 *   - REVIEW_ONLY__NO_AUTO_APPLY
 */

'use strict';

var fs = require('fs');
var path = require('path');

var loader = require('./workers/worker-registry-loader');

// ============================================================
// 常量
// ============================================================

/** 生产数据目录 */
var PRODUCTION_DATA_DIR = '/opt/wecom-openclaw/logs/doudian';

/** 本地回退路径（生产路径不可用时自动回退到项目相对路径） */
var LOCAL_DATA_DIR = path.resolve(__dirname, '../../../../logs/doudian');

/**
 * 解析有效的数据目录（兼容本地开发与生产环境）
 * 优先使用生产路径，不存在时回退到项目本地路径
 * @returns {string} 有效的数据目录路径
 */
function resolveDataDir() {
  if (fs.existsSync(PRODUCTION_DATA_DIR)) {
    return PRODUCTION_DATA_DIR;
  }
  return LOCAL_DATA_DIR;
}

/** 编排 Worker ID 列表（按固定顺序） */
var ORCHESTRATION_WORKER_IDS = Object.freeze([
  'planner-summary-worker',
  'roi-analysis-worker',
  'video-content-worker',
  'risk-review-worker',
]);

/** Worker → 输出段落映射 */
var SECTION_MAP = {
  'planner-summary-worker': 'GMV概览',
  'roi-analysis-worker': 'ROI概览',
  'video-content-worker': '视频建议',
  'risk-review-worker': '风险概览',
};

/** 安全标记 */
var SAFETY_NOTE = 'REVIEW_ONLY__NO_AUTO_APPLY — 本报告由编排层生成，不执行任何自动化操作，所有 Worker 处于 reviewOnly + requiresHumanApproval 模式';

// ============================================================
// 数据加载
// ============================================================

/**
 * 安全读取 JSON 文件
 * @param {string} filePath
 * @returns {object|null}
 */
function readJson(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    var raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (_e) {
    return null;
  }
}

/**
 * loadOpsData — 加载今日运营所需的全部数据源
 *
 * 比 ops-summary 多加载：
 *   - check-activity_latest.json（活动机会）
 *   - ops-advice_latest.json（AI 建议）
 *   - ads-report_latest.json（广告/ROI 数据）
 *
 * @param {string} [dataDir] - 数据目录，默认 PRODUCTION_DATA_DIR
 * @returns {{ success: boolean, data: object, missing: string[] }}
 */
function loadOpsData(dataDir) {
  var dir = dataDir || resolveDataDir();
  var data = {};
  var missing = [];

  // orders_latest.json — GMV/订单/曝光
  var orders = readJson(path.join(dir, 'orders_latest.json'));
  if (orders && orders.metrics) {
    data.orders = orders.metrics;
  } else {
    missing.push('orders_latest.json');
    data.orders = null;
  }

  // fetch-metrics_latest.json — 电商罗盘
  var metrics = readJson(path.join(dir, 'fetch-metrics_latest.json'));
  if (metrics && metrics.compass && metrics.compass.metrics) {
    data.metrics = metrics.compass.metrics;
    data.summary = metrics.summary || {};
  } else {
    missing.push('fetch-metrics_latest.json');
    data.metrics = null;
    data.summary = null;
  }

  // check-risk_latest.json — 风险审查
  var risk = readJson(path.join(dir, 'check-risk_latest.json'));
  if (risk) {
    data.risk = risk;
  } else {
    missing.push('check-risk_latest.json');
    data.risk = null;
  }

  // sku-profit_latest.json — SKU 利润
  var profit = readJson(path.join(dir, 'sku-profit_latest.json'));
  if (profit && Array.isArray(profit.skus)) {
    data.profit = profit;
  } else {
    missing.push('sku-profit_latest.json');
    data.profit = null;
  }

  // check-activity_latest.json — 活动机会
  var activity = readJson(path.join(dir, 'check-activity_latest.json'));
  if (activity) {
    data.activity = activity;
  } else {
    missing.push('check-activity_latest.json');
    data.activity = null;
  }

  // ops-advice_latest.json — AI 建议（可选，缺失不阻断）
  var advice = readJson(path.join(dir, 'ops-advice_latest.json'));
  data.advice = advice || null;

  // ads-report_latest.json — 广告 ROI（可选，缺失不阻断）
  var adsDir = path.resolve(dir, '../../ads');
  var ads = readJson(path.join(adsDir, 'ads-report_latest.json'));
  data.ads = ads && ads.data ? ads.data : null;

  var hasAnyData = data.orders || data.metrics || data.risk || data.profit || data.activity;
  return {
    success: missing.length === 0,
    data: data,
    missing: missing,
    hasData: !!hasAnyData,
  };
}

// ============================================================
// 格式化工具
// ============================================================

/**
 * 格式化金额（元），数据已在元单位
 */
function formatMoney(val) {
  if (val === null || val === undefined || Number.isNaN(Number(val))) return '数据暂缺';
  return '\u00a5' + Number(val).toLocaleString();
}

/**
 * 格式化百分比
 */
function formatPercent(val, decimals) {
  if (val === null || val === undefined || Number.isNaN(Number(val))) return '数据暂缺';
  var d = decimals !== undefined ? decimals : 1;
  return (Number(val) * 100).toFixed(d) + '%';
}

/**
 * 格式化毛利率（已为百分比值如 36.4）
 */
function formatMargin(margin) {
  if (margin === null || margin === undefined || Number.isNaN(Number(margin))) return '数据暂缺';
  return Number(margin).toFixed(1) + '%';
}

/**
 * 风险等级中文映射
 */
var RISK_LABEL = { low: '低', medium: '中', high: '高', critical: '极高' };

/**
 * 风险等级 emoji
 */
var RISK_EMOJI = { low: '🟢', medium: '🟡', high: '🟠', critical: '🔴' };

// ============================================================
// Worker 编排
// ============================================================

/**
 * orchestrateWorkers — 加载 Worker 并生成 dispatch plan
 *
 * 步骤：
 *   1. 加载 4 个 Worker 定义
 *   2. 加载 Prompt（risk-review 跳过）
 *   3. 验证 Prompt 安全标记
 *   4. 生成 dispatch plan
 *
 * @returns {object} orchestration result
 */
function orchestrateWorkers() {
  var workersLoaded = [];
  var promptLoadResults = {};
  var promptValidations = {};
  var runtimeDescriptors = {};
  var dispatchPlan = [];
  var errors = [];
  var warnings = [];

  ORCHESTRATION_WORKER_IDS.forEach(function (workerId) {
    // 加载 Worker 定义
    var worker = loader.loadWorker(workerId);
    if (!worker) {
      errors.push('Worker 加载失败: ' + workerId);
      return;
    }
    workersLoaded.push(workerId);

    // 获取 Runtime 描述符
    runtimeDescriptors[workerId] = loader.getWorkerRuntimeDescriptor(workerId);

    // 加载 Prompt
    var promptContent = loader.loadWorkerPrompt(workerId);
    promptLoadResults[workerId] = {
      loaded: promptContent !== null,
      length: promptContent ? promptContent.length : 0,
      expected: worker.promptFile === null ? false : true,
    };

    // risk-review-worker 特殊处理
    if (worker.promptFile === null) {
      if (worker.llmEnabled === false && worker.provider === 'local-rule') {
        // 预期行为：risk-review 不需要 Prompt
        promptLoadResults[workerId].expected = false;
      } else {
        warnings.push(workerId + ': promptFile=null 但 llmEnabled/provider 不一致');
      }
    }

    // 验证 Prompt
    var validation = loader.validateWorkerPrompt(workerId);
    promptValidations[workerId] = {
      valid: validation.valid,
      promptExists: validation.promptExists,
      markers: validation.markers,
      promptVersion: validation.promptVersion,
      errors: validation.errors,
      warnings: validation.warnings,
    };

    if (!validation.valid) {
      warnings.push(workerId + ': Prompt 验证未通过 — ' + validation.errors.join('; '));
    }

    // 生成 dispatch entry
    dispatchPlan.push({
      workerId: workerId,
      role: worker.role,
      name: worker.name,
      section: SECTION_MAP[workerId] || worker.role,
      provider: worker.provider,
      model: worker.model,
      llmEnabled: worker.llmEnabled,
      reviewOnly: worker.reviewOnly,
      requiresHumanApproval: worker.requiresHumanApproval,
      promptLoaded: promptLoadResults[workerId].loaded,
      promptValid: validation.valid,
      status: 'scheduled',
    });
  });

  return {
    timestamp: new Date().toISOString(),
    workersLoaded: workersLoaded,
    workersCount: workersLoaded.length,
    promptLoadResults: promptLoadResults,
    promptValidations: promptValidations,
    runtimeDescriptors: runtimeDescriptors,
    dispatchPlan: dispatchPlan,
    reviewOnly: true,
    requiresHumanApproval: true,
    errors: errors,
    warnings: warnings,
  };
}

// ============================================================
// 报告生成
// ============================================================

/**
 * buildGMVSection — 生成 GMV 概览段落
 */
function buildGMVSection(data) {
  var lines = [];
  lines.push('## 💰 GMV 概览');
  lines.push('');

  var gmv = null;
  var orders7d = null;
  var ordersToday = null;
  var exposure = null;

  if (data.orders) {
    gmv = data.orders.settlementGMV;
    orders7d = data.orders.payOrders7d;
    ordersToday = data.orders.payOrders;
    exposure = data.orders.exposureCount;
  }

  if (data.metrics && (gmv === null || gmv === undefined)) {
    gmv = data.metrics.settlementGMV;
    if (ordersToday === null || ordersToday === undefined) {
      ordersToday = data.metrics.payOrders;
    }
  }

  lines.push('| 指标 | 今日 |');
  lines.push('|------|------|');
  lines.push('| 结算 GMV | ' + formatMoney(gmv) + ' |');
  lines.push('| 今日订单 | ' + (ordersToday !== null && ordersToday !== undefined ? ordersToday + ' 单' : '数据暂缺') + ' |');
  lines.push('| 7日订单 | ' + (orders7d !== null && orders7d !== undefined ? orders7d + ' 单' : '数据暂缺') + ' |');
  lines.push('| 曝光量 | ' + (exposure !== null && exposure !== undefined ? exposure.toLocaleString() : '数据暂缺') + ' |');

  if (data.orders && data.orders.experienceScore !== null && data.orders.experienceScore !== undefined) {
    var score = data.orders.experienceScore;
    var scoreLabel = score >= 80 ? '优秀' : score >= 70 ? '良好' : score >= 60 ? '一般' : '需改善';
    lines.push('| 体验分 | ' + score + '（' + scoreLabel + '） |');
  }

  lines.push('');

  return lines.join('\n');
}

/**
 * buildROISection — 生成 ROI 概览段落
 */
function buildROISection(data) {
  var lines = [];
  lines.push('## 📈 ROI 概览');
  lines.push('');

  var hasAnyROI = false;

  // 广告数据
  if (data.ads) {
    hasAnyROI = true;
    lines.push('### 广告投放');
    lines.push('');
    lines.push('| 指标 | 数值 |');
    lines.push('|------|------|');
    lines.push('| 花费 | ' + formatMoney(data.ads.spend) + ' |');
    lines.push('| ROI | ' + (data.ads.roi !== undefined ? data.ads.roi.toFixed(2) : '数据暂缺') + ' |');
    lines.push('| GMV | ' + formatMoney(data.ads.gmv) + ' |');
    lines.push('| 曝光 | ' + (data.ads.impressions !== undefined ? data.ads.impressions.toLocaleString() : '数据暂缺') + ' |');
    lines.push('| 点击 | ' + (data.ads.clicks !== undefined ? data.ads.clicks.toLocaleString() : '数据暂缺') + ' |');
    lines.push('| 订单 | ' + (data.ads.orders !== undefined ? data.ads.orders.toLocaleString() : '数据暂缺') + ' |');
    lines.push('| CTR | ' + formatPercent(data.ads.ctr, 2) + ' |');
    lines.push('| CVR | ' + formatPercent(data.ads.cvr, 2) + ' |');
    lines.push('');
  }

  // SKU 利润数据
  if (data.profit && data.profit.skus && data.profit.skus.length > 0) {
    hasAnyROI = true;
    lines.push('### SKU 利润分析');
    lines.push('');
    lines.push('| SKU | 售价 | 成本 | 利润 | 毛利率 |');
    lines.push('|-----|------|------|------|--------|');

    data.profit.skus.forEach(function (sku) {
      lines.push(
        '| ' + sku.name +
        ' | \u00a5' + sku.sellingPrice +
        ' | \u00a5' + (sku.cost + sku.shipping) +
        ' | \u00a5' + sku.grossProfit +
        ' | ' + formatMargin(sku.margin) + ' |'
      );
    });

    lines.push('');

    if (data.profit.analysis && data.profit.analysis.recommended) {
      lines.push('**推荐主推：** ' + data.profit.analysis.recommended +
        '（' + data.profit.analysis.reason + '）');
      lines.push('');
    }
  }

  if (!hasAnyROI) {
    lines.push('> 暂无广告投放数据，也未获取到 SKU 利润数据');
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * buildRiskSection — 生成风险概览段落（risk-review-worker 本地规则引擎）
 */
function buildRiskSection(data) {
  var lines = [];
  lines.push('## 🛡️ 风险概览');
  lines.push('');

  var riskLevel = data.risk ? data.risk.riskLevel : null;
  var risks = data.risk && data.risk.risks ? data.risk.risks : [];

  // 风险等级
  var emoji = riskLevel ? (RISK_EMOJI[riskLevel] || '⚪') : '⚪';
  var label = riskLevel ? (RISK_LABEL[riskLevel] || riskLevel) : '未知';
  lines.push('**风险等级：** ' + emoji + ' ' + label);
  lines.push('');

  if (risks.length > 0) {
    lines.push('### 风险项');
    lines.push('');
    risks.forEach(function (r, i) {
      var desc = typeof r === 'string' ? r : (r.description || r.name || JSON.stringify(r));
      lines.push((i + 1) + '. ' + desc);
    });
    lines.push('');
  } else if (riskLevel === 'low') {
    lines.push('> 未检测到风险项，店铺运营状态安全');
    lines.push('');
  } else if (!data.risk) {
    lines.push('> 风险数据暂缺');
    lines.push('');
  }

  // 局部规则引擎检查（risk-review-worker 本地模式）
  lines.push('### 自动规则检查');
  lines.push('');

  var ruleResults = [];

  // 规则 1：GMV 是否异常低
  var gmv = data.orders ? data.orders.settlementGMV : null;
  if (gmv !== null && gmv !== undefined && gmv < 100) {
    ruleResults.push('- ⚠️ GMV < ¥100，需确认店铺状态及商品上架');
  } else if (gmv === 0 || (gmv !== null && gmv !== undefined)) {
    ruleResults.push('- ✅ GMV 正常');
  }

  // 规则 2：体验分检查
  var score = data.orders ? data.orders.experienceScore : (data.metrics ? data.metrics.experienceScore : null);
  if (score !== null && score !== undefined && score < 70) {
    ruleResults.push('- ⚠️ 体验分 ' + score + ' < 70，将影响流量获取');
  } else if (score !== null && score !== undefined) {
    ruleResults.push('- ✅ 体验分 ' + score + ' 在安全线以上');
  }

  // 规则 3：售后风险
  if (data.risk && data.risk.riskLevel === 'high') {
    ruleResults.push('- ⚠️ 风险等级为高，建议重点复查');
  }

  // 规则 4：数据缺失告警
  if (!data.risk) {
    ruleResults.push('- ⚠️ 风险数据文件缺失，无法执行完整检查');
  }

  if (ruleResults.length === 0) {
    ruleResults.push('- ⚠️ 数据不足，无法执行规则检查');
  }

  lines.push(ruleResults.join('\n'));
  lines.push('');

  return lines.join('\n');
}

/**
 * buildActivitySection — 生成活动机会段落
 */
function buildActivitySection(data) {
  var lines = [];
  lines.push('## 🎯 活动机会');
  lines.push('');

  if (data.activity && data.activity.activities && data.activity.activities.length > 0) {
    var activities = data.activity.activities;
    var summary = data.activity.summary || {};

    lines.push('| 活动 | 状态 | 截止日期 |');
    lines.push('|------|------|----------|');

    activities.forEach(function (a) {
      var status = a.signupStatus === 'available' ? '可报名' :
                   a.signupStatus === 'registered' ? '已报名' : a.signupStatus;
      lines.push('| ' + a.name + ' | ' + status + ' | ' + (a.deadline || '—') + ' |');
    });

    lines.push('');

    if (summary.availableActivities !== undefined) {
      lines.push('**可报名活动：** ' + summary.availableActivities + ' / ' + (summary.totalActivities || summary.availableActivities));
      lines.push('');
    }

    var availableActivities = activities.filter(function (a) { return a.signupStatus === 'available'; });
    if (availableActivities.length > 0) {
      lines.push('> 建议关注上述可报名活动，及时参与大促以获取流量扶持');
      lines.push('');
    }
  } else {
    lines.push('> 暂无活动数据');
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * buildVideoSection — 生成视频建议段落
 */
function buildVideoSection(data) {
  var lines = [];
  lines.push('## 🎬 视频建议');
  lines.push('');

  lines.push('### 内容策略');
  lines.push('');

  // 基于数据生成基础视频建议
  var suggestions = [];

  // 基于利润的 SKU 推荐
  if (data.profit && data.profit.skus && data.profit.skus.length > 0) {
    var bestSku = data.profit.skus.reduce(function (best, sku) {
      return (sku.margin || 0) > (best.margin || 0) ? sku : best;
    }, data.profit.skus[0]);
    suggestions.push('主推 SKU：**' + bestSku.name + '**（毛利率 ' + formatMargin(bestSku.margin) + '）');
    suggestions.push('拍摄亮点：突出性价比优势，展示产品使用场景');
  }

  // 基于活动的建议
  if (data.activity && data.activity.activities) {
    var availableActs = data.activity.activities.filter(function (a) { return a.signupStatus === 'available'; });
    if (availableActs.length > 0) {
      suggestions.push('结合即将到来的大促活动制作预热视频');
    }
  }

  // 基于体验分的建议
  var score = data.orders ? data.orders.experienceScore : (data.metrics ? data.metrics.experienceScore : null);
  if (score !== null && score !== undefined && score >= 70) {
    suggestions.push('店铺体验分 ' + score + ' 表现良好，可在视频中展示好评截图');
  }

  // 通用建议
  suggestions.push('保持日更频率，每天发布 1-2 条商品展示类短视频');
  suggestions.push('建议视频时长 15-30 秒，前 3 秒突出核心卖点');

  suggestions.forEach(function (s, i) {
    lines.push((i + 1) + '. ' + s);
  });

  lines.push('');

  return lines.join('\n');
}

/**
 * buildAdviceSection — 生成今日建议段落（汇总 planner-summary 输出）
 */
function buildAdviceSection(data, orchestration) {
  var lines = [];
  lines.push('## 📝 今日建议');
  lines.push('');

  var riskLevel = data.risk ? data.risk.riskLevel : null;
  var gmv = data.orders ? data.orders.settlementGMV : null;
  var adviceList = [];

  // 取自 ops-advice 的建议
  if (data.advice) {
    if (data.advice.suggestedActions && data.advice.suggestedActions.length > 0) {
      data.advice.suggestedActions.forEach(function (a) {
        adviceList.push(a);
      });
    }
  }

  // 补充基于数据的建议
  if (adviceList.length === 0) {
    if (gmv === 0) {
      adviceList.push('今日GMV为0，建议检查店铺状态和商品上架情况');
    }

    if (riskLevel === 'high' || riskLevel === 'critical') {
      adviceList.push('风险等级较高，建议优先处理售后和投诉');
    }

    var score = data.orders ? data.orders.experienceScore : (data.metrics ? data.metrics.experienceScore : null);
    if (score !== null && score !== undefined && score < 70) {
      adviceList.push('体验分低于70，建议优化售后服务以提升评分');
    }

    if (data.profit && data.profit.analysis && data.profit.analysis.recommended) {
      adviceList.push('主推' + data.profit.analysis.recommended + '（毛利率最高），可设置优惠券提升转化');
    }
  }

  if (adviceList.length === 0) {
    adviceList.push('运营状态正常，继续保持');
    adviceList.push('建议定期检查数据趋势');
  }

  adviceList.forEach(function (a, i) {
    lines.push((i + 1) + '. ' + a);
  });

  lines.push('');

  // 明日要点
  if (data.advice && data.advice.tomorrowFocus && data.advice.tomorrowFocus.length > 0) {
    lines.push('### 明日要点');
    lines.push('');
    data.advice.tomorrowFocus.forEach(function (f, i) {
      lines.push('- ' + f);
    });
    lines.push('');
  }

  return lines.join('\n');
}

// ============================================================
// 主入口
// ============================================================

/**
 * execute — 执行 /今日运营 编排
 *
 * @param {object} [ctx] - 上下文
 * @param {boolean} [ctx.mock] - 使用 mock 数据（测试用）
 * @param {string} [ctx.dataDir] - 数据目录覆盖
 * @returns {string} 企业微信 Markdown 报告
 */
function execute(ctx) {
  var mock = ctx && ctx.mock;
  var dataDir = ctx && ctx.dataDir;

  // Step 1: 编排 Worker
  var orchestration = orchestrateWorkers();

  if (orchestration.errors.length > 0) {
    return '[今日运营] Worker 编排错误:\n' + orchestration.errors.map(function (e) { return '- ' + e; }).join('\n');
  }

  // Step 2: Mock 模式
  if (mock) {
    return buildMockReport(orchestration);
  }

  // Step 3: 加载运营数据
  var opsResult = loadOpsData(dataDir);

  // Step 4: 构建报告
  var sections = [];

  sections.push('# 📊 今日运营报告');
  sections.push('');

  // 数据状态提示
  if (opsResult.missing.length > 0) {
    sections.push('> ⚠️ 部分数据源缺失：' + opsResult.missing.join(', '));
    sections.push('> 以下内容基于已有数据生成');
    sections.push('');
  }

  if (!opsResult.hasData) {
    sections.push('');
    sections.push('> 暂无运营数据，请确认数据采集是否正常');
    sections.push('');
    sections.push(buildDispatchSummary(orchestration));
    sections.push('');
    sections.push('> ⚠️ ' + SAFETY_NOTE);
    return sections.join('\n');
  }

  // 各段落
  sections.push(buildGMVSection(opsResult.data));
  sections.push(buildROISection(opsResult.data));
  sections.push(buildRiskSection(opsResult.data));
  sections.push(buildActivitySection(opsResult.data));
  sections.push(buildVideoSection(opsResult.data));
  sections.push(buildAdviceSection(opsResult.data, orchestration));

  // Dispatch 摘要
  sections.push('---');
  sections.push('');
  sections.push(buildDispatchSummary(orchestration));

  // 安全标记
  sections.push('');
  sections.push('> ⚠️ ' + SAFETY_NOTE);

  return sections.join('\n');
}

/**
 * buildDispatchSummary — 生成 Worker 调度摘要
 */
function buildDispatchSummary(orchestration) {
  var lines = [];
  lines.push('### 🔧 调度方案');
  lines.push('');
  lines.push('| Worker ID | 段落 | Provider | Prompt |');
  lines.push('|-----------|------|----------|--------|');

  orchestration.dispatchPlan.forEach(function (entry) {
    var promptStatus = entry.llmEnabled
      ? (entry.promptLoaded ? '✅ 已加载' : '❌ 缺失')
      : 'N/A（本地规则）';
    lines.push(
      '| ' + entry.workerId +
      ' | ' + entry.section +
      ' | ' + entry.provider +
      ' | ' + promptStatus + ' |'
    );
  });

  lines.push('');
  lines.push('全部 ' + orchestration.workersCount + ' 个 Worker 已调度，reviewOnly=true，requiresHumanApproval=true');
  return lines.join('\n');
}

/**
 * buildMockReport — 生成 mock 报告（测试用，不读取文件）
 */
function buildMockReport(orchestration) {
  var sections = [];

  sections.push('# 📊 今日运营报告（Mock）');
  sections.push('');

  // GMV
  sections.push('## 💰 GMV 概览');
  sections.push('');
  sections.push('| 指标 | 今日 |');
  sections.push('|------|------|');
  sections.push('| 结算 GMV | ¥1,234 |');
  sections.push('| 今日订单 | 12 单 |');
  sections.push('| 7日订单 | 45 单 |');
  sections.push('| 曝光量 | 3,280 |');
  sections.push('| 体验分 | 70（良好） |');
  sections.push('');

  // ROI
  sections.push('## 📈 ROI 概览');
  sections.push('');
  sections.push('### 广告投放');
  sections.push('');
  sections.push('| 指标 | 数值 |');
  sections.push('|------|------|');
  sections.push('| 花费 | ¥850 |');
  sections.push('| ROI | 19.42 |');
  sections.push('| GMV | ¥16,495 |');
  sections.push('| 曝光 | 81,835 |');
  sections.push('| 点击 | 3,316 |');
  sections.push('| 订单 | 190 |');
  sections.push('| CTR | 4.05% |');
  sections.push('| CVR | 5.74% |');
  sections.push('');
  sections.push('### SKU 利润分析');
  sections.push('');
  sections.push('| SKU | 售价 | 成本 | 利润 | 毛利率 |');
  sections.push('|-----|------|------|------|--------|');
  sections.push('| 6-pack | ¥33 | ¥21 | ¥12 | 36.4% |');
  sections.push('| 12-pack | ¥58 | ¥42 | ¥16 | 27.6% |');
  sections.push('| 18-pack | ¥79 | ¥63 | ¥16 | 20.3% |');
  sections.push('');
  sections.push('**推荐主推：** 6-pack（6-pack 毛利率最高 (36.4%)，建议主推）');
  sections.push('');

  // 风险
  sections.push('## 🛡️ 风险概览');
  sections.push('');
  sections.push('**风险等级：** 🟢 低');
  sections.push('');
  sections.push('> 未检测到风险项，店铺运营状态安全');
  sections.push('');
  sections.push('### 自动规则检查');
  sections.push('');
  sections.push('- ✅ GMV 正常');
  sections.push('- ✅ 体验分 70 在安全线以上');
  sections.push('');

  // 活动
  sections.push('## 🎯 活动机会');
  sections.push('');
  sections.push('| 活动 | 状态 | 截止日期 |');
  sections.push('|------|------|----------|');
  sections.push('| 抖音商城官方大促 | 可报名 | 06/18 |');
  sections.push('');

  // 视频
  sections.push('## 🎬 视频建议');
  sections.push('');
  sections.push('### 内容策略');
  sections.push('');
  sections.push('1. 主推 SKU：**6-pack**（毛利率 36.4%）');
  sections.push('2. 拍摄亮点：突出性价比优势，展示产品使用场景');
  sections.push('3. 店铺体验分 70 表现良好，可在视频中展示好评截图');
  sections.push('4. 保持日更频率，每天发布 1-2 条商品展示类短视频');
  sections.push('5. 建议视频时长 15-30 秒，前 3 秒突出核心卖点');
  sections.push('');

  // 建议
  sections.push('## 📝 今日建议');
  sections.push('');
  sections.push('1. 运营状态正常，继续保持');
  sections.push('2. 建议定期检查数据趋势');
  sections.push('3. 主推 6-pack（毛利率最高），可设置优惠券提升转化');
  sections.push('');

  // 调度
  sections.push('---');
  sections.push('');
  sections.push(buildDispatchSummary(orchestration));

  // 安全
  sections.push('');
  sections.push('> ⚠️ ' + SAFETY_NOTE);

  return sections.join('\n');
}

// ============================================================
// 模块导出
// ============================================================

module.exports = {
  // 主入口
  execute: execute,
  desc: '今日运营 Worker 编排',

  // 子模块（测试用）
  loadOpsData: loadOpsData,
  orchestrateWorkers: orchestrateWorkers,
  buildGMVSection: buildGMVSection,
  buildROISection: buildROISection,
  buildRiskSection: buildRiskSection,
  buildActivitySection: buildActivitySection,
  buildVideoSection: buildVideoSection,
  buildAdviceSection: buildAdviceSection,
  buildDispatchSummary: buildDispatchSummary,
  buildMockReport: buildMockReport,

  // 常量
  ORCHESTRATION_WORKER_IDS: ORCHESTRATION_WORKER_IDS,
  SECTION_MAP: SECTION_MAP,
  SAFETY_NOTE: SAFETY_NOTE,
  PRODUCTION_DATA_DIR: PRODUCTION_DATA_DIR,
  LOCAL_DATA_DIR: LOCAL_DATA_DIR,
  resolveDataDir: resolveDataDir,
};
