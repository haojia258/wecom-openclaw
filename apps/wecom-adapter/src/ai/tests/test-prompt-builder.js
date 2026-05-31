'use strict';

const assert = require('assert');
const { buildPrompt } = require('../prompt-builder');

const prompt = buildPrompt({
  gmv: '100000',
  orders: '300',
  aftersale: null,
  skuProfit: '22%',
  activity: 'ROI 1.7',
  risk: '中',
});

assert(prompt.includes('数据缺失'), 'missing field must mention 数据缺失');
assert(prompt.length <= 800, 'prompt should be <=800 chars');
assert(prompt.includes('今日运营摘要'), 'must enforce output sections');

console.log('test-prompt-builder passed');
