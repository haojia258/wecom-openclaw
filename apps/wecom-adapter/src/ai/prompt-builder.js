'use strict';

function safeField(v, label) {
  if (v === null || v === undefined || v === '') return `${label}: \u6570\u636e\u7f3a\u5931`;
  return `${label}: ${v}`;
}

function clampPrompt(text, maxLen = 800) {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + '...';
}

function buildPrompt(input = {}) {
  const lines = [
    '\u4f60\u662f\u7535\u5546\u8fd0\u8425\u5206\u6790\u52a9\u624b\u3002\u8bf7\u4ec5\u57fa\u4e8e\u7ed9\u5b9a\u6570\u636e\u8f93\u51fa\uff0c\u4e0d\u5141\u8bb8\u7f16\u9020\u6570\u636e\u3002',
    '\u8981\u6c42\uff1a\u4e2d\u6587\u3001\u5b9e\u64cd\u3001\u7b80\u6d01\u3001\u4e0d\u7a7a\u6cdb\u3002\u82e5\u6570\u636e\u7f3a\u5931\u5fc5\u987b\u660e\u786e\u6307\u51fa\u201c\u6570\u636e\u7f3a\u5931\u201d\u3002',
    '\u8f93\u51fa\u7ed3\u6784\u5fc5\u987b\u5305\u542b\uff1a1.\u4eca\u65e5\u8fd0\u8425\u6458\u8981 2.\u98ce\u9669 3.SKU\u5efa\u8bae 4.\u6d3b\u52a8\u5efa\u8bae 5.\u4e0b\u4e00\u6b65\u52a8\u4f5c\u3002',
    '',
    '\u3010\u8f93\u5165\u6570\u636e\u3011',
    safeField(input.gmv, 'GMV'),
    safeField(input.orders, '\u8ba2\u5355'),
    safeField(input.aftersale, '\u552e\u540e'),
    safeField(input.skuProfit, 'SKU\u5229\u6da6'),
    safeField(input.activity, '\u6d3b\u52a8'),
    safeField(input.risk, '\u98ce\u9669'),
    '',
    '\u3010\u6700\u8fd1\u8d8b\u52bf\u3011',
    input.memoryTrend || '\u8d8b\u52bf\u6570\u636e\u7f3a\u5931',
  ];

  return clampPrompt(lines.join('\n'), 800);
}

module.exports = {
  buildPrompt,
  clampPrompt,
};
