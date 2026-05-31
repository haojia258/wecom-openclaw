# OSS Radar v0.1

**类型**: development  
**优先级**: P2  
**负责人**: workbuddy  
**版本**: P15.1

---

## 目标

新增 `/开源雷达` 命令，支持 GitHub 开源项目评估与发现能力。

## 功能范围

### 1. GitHub 项目评分

- 输入仓库 URL 或 `owner/repo`
- 输出综合评分（0-100）
- 评分维度:
  - Star 增长
  - Commit 活跃度
  - Release 频率
  - Issue 响应速度
  - Contributor 数量
  - License 完整性
  - 最近更新时间

### 2. 项目对比

- 支持两个或多个项目对比
- 输出评分表
- 输出推荐项目

### 3. 关键词搜索

- 基于 GitHub Search API
- 支持关键词: AI, Agent, RAG, MCP, Workflow, E-commerce
- 输出 Top N 项目

### 4. 评分报告

- Markdown 报告
- 风险等级
- 成熟度等级
- 推荐理由

### 5. Artifact

写入: `storage/orchestrator/artifacts/`

产物:
- `radar-report.md`
- `radar-score.json`

### 6. Audit

写入: `storage/orchestrator/audit/`

事件:
- `oss_radar_search`
- `oss_radar_compare`
- `oss_radar_score`

## 企业微信命令

```
/开源雷达 搜索 AI Agent
/开源雷达 评分 microsoft/autogen
/开源雷达 对比 microsoft/autogen openai/openai-agents-python
```

## 验收标准

| # | 标准 |
|---|------|
| 1 | 支持评分 GitHub 项目 |
| 2 | 支持项目对比 |
| 3 | 支持关键词搜索 |
| 4 | 输出评分报告 |
| 5 | 写入 artifact |
| 6 | 写入 audit |

## 限制

- ❌ 禁止 clone 仓库
- ❌ 禁止 install 依赖
- ❌ 禁止执行第三方代码
- ❌ 禁止修改 .env
- ❌ 禁止修改 nginx
- ❌ 禁止自动发布到生产环境
- ❌ 禁止自动上线变更
- ❌ 禁止自动 merge
- ❌ 禁止 apply patch

## 要求

- ✅ `REVIEW_ONLY=true`
- ✅ `requiresHumanApproval=true`

所有变更仅允许：
- 代码实现
- 测试
- 审查
- Artifact 输出
- Audit 记录

任何生产发布动作必须经过人工批准。

## 交付物

1. OSS Radar Skill (`src/skills/oss-radar/`)
2. `/开源雷达` 命令 (`src/commands/oss-radar-command.js`)
3. 测试用例 (≥25 assertions)
4. Artifact 示例
5. Audit 示例
6. 验收报告
