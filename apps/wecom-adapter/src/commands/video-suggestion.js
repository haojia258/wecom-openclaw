'use strict';

/**
 * /视频建议 命令
 * 调用 video 模块生成短视频脚本建议
 */

const { generateVideoAdvice } = require('../video/video-script-generator');

async function execute(ctx) {
  try {
    // 使用默认商品（当前无 SKU 数据传入，使用模块内置默认值）
    const advice = generateVideoAdvice({});
    if (!advice) {
      return '暂无法生成视频建议';
    }
    // 格式化为文本
    const lines = ['🎬 短视频脚本建议', ''];
    for (const [key, val] of Object.entries(advice)) {
      lines.push('【' + key + '】');
      lines.push(String(val));
      lines.push('');
    }
    let output = lines.join('\n');
    if (output.length > 1800) {
      output = output.slice(0, 1797) + '...';
    }
    return output;
  } catch (e) {
    return '视频建议暂不可用：' + e.message.slice(0, 100);
  }
}

module.exports = { execute, desc: '短视频脚本建议' };
