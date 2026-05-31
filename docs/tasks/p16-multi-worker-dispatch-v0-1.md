# P16 Multi-Worker Dispatch Layer v0.1

## 目标

开发多 Worker 分发层，让 OpenClaw 可以把任务按角色分发给不同 worker：planner、analysis、content、risk、review、memory、node-a。

## 分支

`feature/p16-multi-worker-dispatch-v0-1`

## 命令别名

| 命令 | 文件 |
|------|------|
| `/worker分发` | commands/worker-dispatch.js |
| `/dispatch` | 同上 |
| `/多节点调度` | 同上 |
| `/workers` | 同上 (列出所有 worker) |

## Worker Registry (7 workers)

| Worker ID | Role | Provider | Approval |
|-----------|------|----------|----------|
| planner-worker | planner | openai | Yes |
| analysis-worker | analysis | deepseek | No |
| content-worker | content | doubao | No |
| risk-worker | risk | deepseek | Yes |
| review-worker | review | deepseek | Yes |
| memory-worker | memory | openai | No |
| node-a-worker | node-a | deepseek | Yes |

## 功能

### 任务分类

按关键词匹配推荐最合适的 worker：

- 风险/审计/安全 → risk-worker
- 审查/测试/验证 → review-worker
- 开发/代码/构建 → node-a-worker
- 内容/文案/脚本 → content-worker
- 规划/计划/调度 → planner-worker
- 分析/数据/报表 → analysis-worker
- 记忆/存档/索引 → memory-worker

### 禁止操作检测

自动检测并标记以下禁止关键词：下单、报名活动、修改商品、修改价格、修改库存、.env、nginx、deploy、merge、pm2、systemctl

### 输出内容

- Task ID / 原始任务
- 推荐 Worker (Worker ID / Role / Provider)
- 执行模式 (Review Only / Auto Execute)
- 是否需要人工审批
- 风险等级 (安全/低风险/中风险/高风险)
- 禁止操作提示
- Worker 权限清单
- 审计记录

## 测试

- 74/74 passed
- 8 类测试：Registry Integrity / List / Get / Classification / Forbidden / Permissions / Module Loading / Approval

## 限制

- ❌ 禁止 clone 仓库
- ❌ 禁止 install 依赖
- ❌ 禁止执行第三方代码
- ❌ 禁止修改 .env
- ❌ 禁止修改 nginx
- ❌ 禁止自动发布到生产环境
- ❌ 禁止自动上线变更
- ❌ 禁止自动 merge

## 要求

- ✅ `REVIEW_ONLY=true`
- ✅ `requiresHumanApproval=true`

所有变更仅允许：代码实现、测试、审查、Artifact 输出、Audit 记录。任何生产发布动作必须经过人工批准。
