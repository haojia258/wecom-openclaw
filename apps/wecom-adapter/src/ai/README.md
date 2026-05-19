# AI Ops Analysis 模块

## 结构
- `ops-analysis.js`：组合入口，负责编排。
- `prompt-builder.js`：构建结构化中文 Prompt（<=800字）。
- `score-model.js`：本地评分模型，不依赖 GPT。
- `fallback-analysis.js`：兜底分析，确保始终有输出。
- `rules.js`：阈值与规则中心。

## 设计目标
- 单一职责
- 可插拔
- 可独立测试
- 后续便于 commands 接入

## 快速使用
```js
const { opsAnalysis } = require('./index');

const res = await opsAnalysis.analyze({
  gmv: '120000',
  orders: '2300',
  aftersale: '6%',
  skuProfit: '18%',
  activity: 'ROI 1.8',
  risk: '中',
  gmv: { ratio: 0.9 },
  aftersale: { rate: 0.08 },
  activity: { roi: 1.9 },
  skuProfit: { avgMargin: 0.21 },
  risk: { level: 0.4 },
});
```
