// 标题生成器（本地fallback）
const RULES = require('./video-rules');

const generateTitles = (productName) => {
  return [
    `${productName}！夜宵懒人必备免煮神器！`,
    `学生党狂囤！${productName}好吃到舔桶！`,
    `别吃泡面了！${productName}才是真的香！`
  ].slice(0, RULES.TITLE_COUNT);
};

module.exports = {
  generateTitles
};

// 用法：
// const titles = generateTitles('桶装酸辣粉');
