'use strict';

function safeField(v, label) {
  if (v === null || v === undefined || v === '') return `${label}: 数据缺失`;
  return `${label}: ${v}`;
}

function clampPrompt(text, maxLen = 800) {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + '...';
}

function buildPrompt(input = {}) {
  const lines = [
    '你是电商运营分析助手。请仅基于给定数据输出，不允许编造数据。',
    '要求：中文、实操、简洁、不空泛。若数据缺失必须明确指出"数据缺失"。',
    '输出结构必须包含：1.今日运营摘要 2.风险 3.SKU建议 4.活动建议 5.下一步动作。',
    '',
    '【输入数据】',
    safeField(input.gmv, 'GMV'),
    safeField(input.orders, '订单'),
    safeField(input.aftersale, '售后'),
    safeField(input.skuProfit, 'SKU利润'),
    safeField(input.activity, '活动'),
    safeField(input.risk, '风险'),
  ];

  return clampPrompt(lines.join('\n'), 800);
}

module.exports = {
  buildPrompt,
  clampPrompt,
};
