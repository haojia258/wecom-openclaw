// 开头3秒生成器（本地fallback）
const generateHooks = (productName) => {
  return [
    `别再吃泡面了！${productName}才是夜宵天花板！`,
    `学生党速看！​5分钟搞定的免煮快乐！`,
    `一桶下肚超满足！这款酸辣粉我能吃一年！`
  ];
};

module.exports = {
  generateHooks
};

// 用法：
// const hooks = generateHooks('桶装酸辣粉');
