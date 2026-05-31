'use strict';

/**
 * goal-parser.js - 目标解析模块 (P6.5 Planner Agent)
 *
 * 将用户输入的目标文本解析为结构化对象：
 * - 关键词提取
 * - 领域匹配
 * - 策略分类
 */

// 领域映射：关键词 → domain
const DOMAIN_MAP = [
  { domain: 'sales',    keywords: ['gmv', '销售额', '营收', '收入', '成交', '下单', '付款'] },
  { domain: 'ads',      keywords: ['roi', '投流', '广告', '投放', '千川', '巨量', '竞价'] },
  { domain: 'risk',     keywords: ['退款', '退货', '差评', '投诉', '纠纷', '违规', '处罚'] },
  { domain: 'content',  keywords: ['视频', '内容', '脚本', '直播', '素材', '短视频', '创意'] },
  { domain: 'ops',      keywords: ['稳定性', '企业微信', '部署', '服务器', '宕机', '性能', '监控', '报警'] },
  { domain: 'product',  keywords: ['选品', '库存', '定价', '商品', 'sku', '上架', '下架'] },
  { domain: 'user',     keywords: ['复购', '留存', '转化', '客户', '粉丝', '会员', '私域'] },
  { domain: 'order',    keywords: ['订单', '发货', '物流', '履约', '超时'] },
  { domain: 'profit',   keywords: ['利润', '毛利', '成本', '费用', '净利'] },
];

// 策略分类关键词
const CATEGORY_KEYWORDS = {
  growth:      ['提升', '增加', '提高', '增长', '扩大', '突破', '翻倍', '放大'],
  reduction:   ['降低', '减少', '下降', '压缩', '控制', '缩减', '削减'],
  optimization:['优化', '改善', '改进', '完善', '升级', '调整', '重构'],
  maintain:    ['稳定', '保持', '维持', '确保', '保障', '守住'],
};

// 停用词
const STOP_WORDS = new Set([
  '的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一',
  '一个', '上', '也', '很', '到', '说', '要', '去', '你', '会', '着',
  '没有', '看', '好', '自己', '这', '帮', '请', '如何', '怎么', '怎样',
  '吧', '吗', '呢', '啊', '哦', '嗯',
]);

/**
 * 从文本中提取关键词
 * @param {string} text
 * @returns {string[]}
 */
function extractKeywords(text) {
  const lower = text.toLowerCase();
  // 先提取中文词组（最小2字），再提取英文词
  const chineseWords = lower.match(/[\u4e00-\u9fff]{2,}/g) || [];
  const englishWords = lower.match(/[a-z0-9]{2,}/g) || [];
  const allWords = [...chineseWords, ...englishWords];

  // 过滤停用词
  return allWords.filter(function(w) { return !STOP_WORDS.has(w); });
}

/**
 * 匹配领域
 * @param {string[]} keywords
 * @returns {{ domain: string, score: number, matched: string[] }}
 */
function matchDomain(keywords) {
  let best = { domain: 'general', score: 0, matched: [] };

  for (var i = 0; i < DOMAIN_MAP.length; i++) {
    var entry = DOMAIN_MAP[i];
    var matched = [];
    for (var j = 0; j < keywords.length; j++) {
      for (var k = 0; k < entry.keywords.length; k++) {
        if (keywords[j].indexOf(entry.keywords[k]) !== -1) {
          matched.push(entry.keywords[k]);
        }
      }
    }
    if (matched.length > best.score) {
      best = { domain: entry.domain, score: matched.length, matched: matched };
    }
  }

  return best;
}

/**
 * 推断策略分类
 * @param {string} text
 * @returns {string}
 */
function inferCategory(text) {
  var lower = text.toLowerCase();
  var best = { category: 'optimization', score: 0 };

  var catKeys = Object.keys(CATEGORY_KEYWORDS);
  for (var i = 0; i < catKeys.length; i++) {
    var cat = catKeys[i];
    var keywords = CATEGORY_KEYWORDS[cat];
    var score = 0;
    for (var j = 0; j < keywords.length; j++) {
      if (lower.indexOf(keywords[j]) !== -1) {
        score++;
      }
    }
    if (score > best.score) {
      best = { category: cat, score: score };
    }
  }

  return best.category;
}

/**
 * 识别业务模式特征
 * @param {string} text
 * @returns {string[]}
 */
function detectPatterns(text) {
  var patterns = [];
  if (/[0-9]+日|近[0-9]+天|最近|本周|本月/.test(text)) patterns.push('time_range');
  if (/对比|比较|vs|环比|同比/.test(text)) patterns.push('comparison');
  if (/趋势|走势|变化|波动/.test(text)) patterns.push('trend');
  if (/预测|预估|估计|预期|目标/.test(text)) patterns.push('forecast');
  if (/根因|原因|为什么|排查/.test(text)) patterns.push('root_cause');
  if (/建议|推荐|方案|策略/.test(text)) patterns.push('recommendation');
  return patterns;
}

/**
 * 解析目标文本
 * @param {string} goal - 用户输入的目标文本
 * @returns {{ goal: string, keywords: string[], domain: string, category: string, patterns: string[] }}
 */
function parse(goal) {
  var trimmed = (goal || '').trim();

  if (!trimmed) {
    return {
      goal: '',
      keywords: [],
      domain: 'general',
      category: 'optimization',
      patterns: []
    };
  }

  var keywords = extractKeywords(trimmed);
  var domainResult = matchDomain(keywords);
  var category = inferCategory(trimmed);
  var patterns = detectPatterns(trimmed);

  return {
    goal: trimmed,
    keywords: keywords,
    domain: domainResult.domain,
    category: category,
    patterns: patterns
  };
}

module.exports = {
  parse: parse,
  // 导出内部函数供测试
  _extractKeywords: extractKeywords,
  _matchDomain: matchDomain,
  _inferCategory: inferCategory,
  _detectPatterns: detectPatterns,
  DOMAIN_MAP: DOMAIN_MAP,
  CATEGORY_KEYWORDS: CATEGORY_KEYWORDS,
};
