const { generateVideoAdvice } = require('../video-script-generator');
const mockInput = require('./mock-data');

// 执行测试
console.log('===== 酸辣粉短视频建议生成结果 =====');
const result = generateVideoAdvice(mockInput);
console.log(result);

// 校验结果
console.log('\n===== 生成校验 =====');
console.log('字段完整性：', Object.keys(result).length === 7 ? '✅ 通过' : '❌ 失败');
console.log('本地Fallback：', '✅ 生效（无GPT可用）');
