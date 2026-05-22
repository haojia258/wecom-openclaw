# Plan: AI Orchestrator Runtime Expansion Phase 1

## 背景
- v0.4 Runtime Core 已部署，`feature/ai-orchestrator-runtime-v04` → `develop` 已合并
- 当前分支：`feature/runtime-expansion-phase1`（已创建）
- **Runtime Core 冻结**：`task-queue / runtime-state-machine / audit-recorder / rollback-planner / review-pipeline / artifact-store` 不做任何重构

## 目标
一次性扩展 5 个上层模块（不改变 Runtime Core）：
1. Worker Layer（固定 4 角色）
2. Strategy Layer
3. Template Layer + 6 个企业运营模板
4. Semantic Memory Layer（轻量索引，不做 embedding）
5. Execution Policy Layer（硬约束）
6. Task Graph（DAG）

## 新增目录结构

```
apps/wecom-adapter/src/orchestrator/runtime-expansion/
├── worker-layer.js           # 固定 4 Worker 角色
├── strategy-layer.js         # 策略选择（重试/回退/审批）
├── template-engine.js        # 模板加载 + 变量渲染
├── memory-index.js           # 轻量历史索引（JSON 索引文件）
├── context-retriever.js      # 按 taskId/intent/assignee 检索
├── execution-policy.js      # 硬约束（禁止自动 apply/merge/deploy）
├── task-graph-builder.js    # DAG 构建
├── rules/                   # 规则配置（JSON）
│   └── review-rules.json
├── templates/               # 企业运营模板（JSON）
│   ├── daily-report-template.json
│   ├── roi-analysis-template.json
│   ├── risk-review-template.json
│   ├── video-script-template.json
│   ├── patch-generation-template.json
│   └── review-template.json
├── policies/                # 策略配置（JSON）
│   └── retry-policy.json
├── fallbacks/               # 回退配置（JSON）
│   └── default-fallback.json
├── retry/                   # 重试配置（JSON）
│   └── default-retry.json
└── strategies/              # 策略配置（JSON）
    └── default-strategy.json

tests/
├── test-task-graph-builder.js
├── test-template-engine.js
├── test-execution-policy.js
└── test-memory-index.js
```

## 实施步骤

### Step 1: 创建目录结构
- 创建 `runtime-expansion/` 目录及 6 个子目录 `rules/ templates/ policies/ fallbacks/ retry/ strategies/`

### Step 2: Worker Layer（`worker-layer.js`）
- 固定 4 个 Worker 角色（不在代码中动态创建）：
  - `planner-worker`：intent 分析 / task graph / DAG 规划 / fallback route
  - `executor-worker`：patch / markdown / script / artifact generation
  - `review-worker`：patch review / diff review / acceptance check
  - `risk-worker`：forbidden scope / 风险评分 / rollback 建议
- 导出：`getWorker(role)` / `listWorkers()` / `executeWorker(role, task)`
- Worker 内部调用已有的 `orchestrator-core.js` / `patch-policy.js` / `risk-policy.js`

### Step 3: Strategy Layer（`strategy-layer.js`）
- 从 `strategies/default-strategy.json` 读取策略配置
- 支持策略类型：`review_strategy / retry_strategy / fallback_strategy / approval_strategy`
- 导出：`getStrategy(type, context)` / `listStrategies()`

### Step 4: Template Layer（`template-engine.js` + 6 个模板）
- `loadTemplate(name)`：从 `templates/` 目录读取 JSON 模板
- `renderTemplate(name, variables)`：Mustache 风格 `{{variable}}` 简单替换
- `listTemplates()`：列出所有可用模板
- 6 个模板各自定义 `inputs`（输入变量）和 `outputs`（输出格式）

### Step 5: Semantic Memory Layer（`memory-index.js` + `context-retriever.js`）
- **不做** embedding 或向量数据库
- `memory-index.js`：维护 4 个 JSON 索引文件（存储在 `storage/orchestrator/memory/`）：
  - `patch-history.idx.json`
  - `review-history.idx.json`
  - `task-history.idx.json`
  - `strategy-history.idx.json`
- 每个索引条目：`{ id, taskId, intent, assignee, timestamp, summary, result }`
- `context-retriever.js`：提供 `retrieveByTaskId(taskId)` / `retrieveByIntent(intent)` / `retrieveByAssignee(assignee)`

### Step 6: Execution Policy Layer（`execution-policy.js`）
- 硬编码禁止项（不依赖配置）：
  - `checkAutoApply()`: 拒绝任何自动 apply patch 到生产
  - `checkAutoMerge()`: 拒绝自动 merge 到 main
  - `checkAutoForcePush()`: 拒绝自动 force push
  - `checkNginxModification()`: 拒绝修改 nginx 配置
  - `checkEnvModification()`: 拒绝修改 `.env`
  - `checkWeComMainPipeline()`: 拒绝修改企业微信主链路
- 导出：`validateExecution(action, context)` → `{ allowed, reason }`

### Step 7: Task Graph Builder（`task-graph-builder.js`）
- 输入：`task` 对象
- 输出：DAG `{ nodes: [], edges: [], dependencies: [] }`
- 预定义 DAG 模板（从 `strategies/` 读取）：
  - `collect-data` → `analyze` → `review` → `publish`
  - `plan` → `execute` → `review` → `approve`
- 导出：`buildGraph(task, strategyName)` / `validateGraph(graph)` / `formatGraphForWecom(graph)`

### Step 8: 6 个企业运营模板
按照设计文档创建 6 个 JSON 模板文件。

### Step 9: 配置化文件
创建 `rules/review-rules.json`、`policies/retry-policy.json`、`fallbacks/default-fallback.json`、`retry/default-retry.json`、`strategies/default-strategy.json`，把所有硬编码的 retry/review/risk/fallback/approval 参数移到这些文件。

### Step 10: 测试（4 个新测试文件）
- `test-task-graph-builder.js`：验证 DAG 构建和校验
- `test-template-engine.js`：验证模板加载和变量渲染
- `test-execution-policy.js`：验证所有禁止项被正确拦截
- `test-memory-index.js`：验证索引读写和检索

### Step 11: 提交 & 创建 PR
- 提交信息：`feat(runtime): add runtime expansion phase1`
- 推送分支并在 GitHub 创建 PR `feature/runtime-expansion-phase1` → `develop`
- **只创建 PR，不合并**（按用户要求）

## 关键约束
- ✅ 不重构 Runtime Core（task-queue / state-machine / audit / rollback / review-pipeline / artifact-store）
- ✅ 不调用真实 AI API
- ✅ 不自动 apply patch
- ✅ Worker 角色固定（4 个），禁止动态扩展
- ✅ 所有策略/规则/回退/重试全部配置化（JSON 文件）

## 验证方式
- `node tests/test-task-graph-builder.js` 全部通过
- `node tests/test-template-engine.js` 全部通过
- `node tests/test-execution-policy.js` 全部通过
- `node tests/test-memory-index.js` 全部通过
- 手动验证：`require('./runtime-expansion/worker-layer')` 能正确加载 4 个 Worker
