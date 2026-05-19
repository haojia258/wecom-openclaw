const RULES = require('./video-rules');
const { generateTitles } = require('./title-generator');
const { generateHooks } = require('./hook-generator');

/**
 * 标准化输入处理
 * @param {object} input 原始输入
 * @returns {object} 标准化结构
 */
const normalizeInput = (input) => {
  return {
    productName: input.productName || '酸辣粉',
    sku: input.sku || '12桶',
    type: input.productType || '利润款',
    points: input.sellingPoints || [],
    user: input.userProfile || '学生党',
    activity: input.activity || '现货速发'
  };
};

/**
 * 核心：生成完整视频建议（本地100% fallback）
 * @param {object} input 商品输入数据
 * @returns {object} 标准化输出
 */
const generateVideoAdvice = (input) => {
  const data = normalizeInput(input);
  const { productName, sku, user } = data;

  return {
    '1.视频标题(3条)': generateTitles(productName),
    '2.开头3秒(3条)': generateHooks(productName),
    '3.视频脚本': `【口播】宝子们！${user}必冲的${productName}，免煮5分钟就能吃！酸辣过瘾，Q弹爽滑，${sku}一箱够吃好久！不管是夜宵、加餐还是懒人餐都超合适！\n【画面】拆桶+冲泡+嗦粉特写\n【促单】点击下方小黄车直接拍，现货速发不等待！`,
    '4.评论区引导': `1. 扣1领取专属优惠～2. 吃过的宝子评论区告诉我好不好吃！3. 想要囤货的直接冲小黄车！`,
    '5.标签建议': `#酸辣粉 #懒人速食 #夜宵美食 #学生党美食 #免煮速食`,
    '6.封面文案': `${sku}酸辣粉 免煮超好吃 点击下单`,
    '7.推荐发布时间': `晚上17:00-23:00（夜宵流量高峰）`
  };
};

module.exports = {
  generateVideoAdvice,
  normalizeInput
};

// 核心保证：无GPT也可完整生成
// 输出约束：中文、抖音风格、强转化、≤600字、带促单动作
