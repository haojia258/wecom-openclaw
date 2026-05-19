# AI Memory Layer

用于 `/运营分析` 的连续上下文与趋势跟踪。

## 文件
- `memory-store.js`: JSON 存取（`storage/ops-memory/snapshots.json`）
- `snapshot-manager.js`: 从本次分析输入构建并保存快照
- `trend-analysis.js`: 基于最近快照分析连续趋势
- `context-builder.js`: 生成可供 PromptBuilder 使用的趋势上下文

## 数据保留
- 默认保留最近 7 次分析快照。
