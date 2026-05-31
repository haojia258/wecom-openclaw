# Controlled Execution Policy

> **Scope**: 定义 Commander Runtime 中所有执行操作的受控策略、安全边界和回滚规则。
> **版本**: v1.0.0
> **生效日期**: 2026-05-27

---

## 1. 概述

Controlled Execution (受控执行) 是 Commander Runtime 的安全执行层，确保：

1. **默认不执行** — 除非明确授权，否则只生成计划
2. **人工确认** — live execution 需要 `humanConfirmToken`
3. **独立 RBAC** — AGENT_EXECUTION_PERMISSIONS 独立于 WeCom RBAC
4. **完整审计** — 每次执行尝试写入 `execution-audit`

---

## 2. 执行模式

### 2.1 plan-only (默认)

```
请求 → Gateway 安全层 → Bridge → Commander Planner → DAG Plan → 返回计划
                                                          ↓
                                                        不执行
```

- **触发**: `"mode": "plan-only"` (默认值)
- **行为**: 生成 DAG 执行计划并返回，**不调用任何 Agent**
- **输出**: 包含步骤序号、Agent 分配、命令、预期原因

### 2.2 dry-run (模拟执行)

```
请求 → Gateway 安全层 → Bridge → Commander → 模拟执行 → 返回虚拟结果
```

- **触发**: `"mode": "dry-run"` + `humanConfirmToken`
- **行为**: 模拟执行每个步骤，但**不对外产生真实效果**
- **安全**: 所有外部操作被拦截/Mock

### 2.3 live (真实执行)

```
请求 → Gateway 安全层 → Bridge → Commander → 真实执行 → 返回实际结果
                                 (需要 humanConfirmToken)
```

- **触发**: `"mode": "live"` + `humanConfirmToken`
- **行为**: 真实调用 AI Agent 执行操作
- **当前状态**: 🔴 生产环境默认强制 plan-only，Gateway 层面拒绝 live

---

## 3. 执行策略矩阵

### 3.1 Execution Policy

```javascript
// execution-policy.js
const EXECUTION_POLICY = {
  // 调试类命令：永远只读
  'test-*': { action: 'DENY', fallback: 'plan-only' },
  'benchmark-*': { action: 'DENY', fallback: 'plan-only' },

  // 生产敏感命令：需要强审计
  'deploy-*': { action: 'DENY', fallback: 'plan-only' },
  'restart-*': { action: 'DENY', fallback: 'plan-only' },
  'modify-env': { action: 'DENY', fallback: 'plan-only' },

  // GMV 优化类：plan-only
  'analyze_gmv_data': { action: 'ALLOW', fallback: 'plan-only' },
  'gmv_optimization_strategy': { action: 'ALLOW', fallback: 'plan-only' },

  // 内容生成：plan-only with audit
  'content-generate': { action: 'ALLOW', fallback: 'plan-only' },

  // GitHub PR：humanConfirmToken + audit
  'draft-pr': { action: 'ALLOW', fallback: 'plan-only' },

  // 审计类：只读，允许
  'readonly-audit': { action: 'ALLOW', fallback: 'plan-only' },
  'readonly-review': { action: 'ALLOW', fallback: 'plan-only' },
};
```

### 3.2 7 步执行链

```
1. validateExecution()
   ├── 检查 mode (plan-only / dry-run / live)
   ├── 检查 humanConfirmToken (live 需要)
   └── → 不通过则拒绝执行
       ↓
2. runtimeRBACCheck()
   ├── 检查 Agent 是否有权限执行该操作
   ├── AI-RBAC: codex[draft-pr], deepseek[readonly-review], ...
   └── → 不通过则标记步骤为 blocked
       ↓
3. dryRun()
   ├── plan-only 模式：输出计划不执行
   └── → 安全结束
       ↓
4. executeControlled()
   ├── ALLOW 策略：执行
   ├── DENY 策略：拒绝
   ├── fallback=plan-only：返回计划
   └── → 记录结果
       ↓
5. auditExecution()
   ├── 写入 execution-audit
   ├── 记录: step, agent, action, result, timestamp
   └── → 持久化审计
       ↓
6. rollbackPlan() (失败时)
   ├── 标记步骤为 FAILED
   ├── 生成回滚计划
   └── → 通知用户
       ↓
7. 汇总输出
   ├── 成功步骤
   ├── 被拒绝步骤
   ├── DAG 执行状态
   └── → 返回给 Commander
```

---

## 4. Forbidden Operations

### 4.1 永久禁止操作

以下操作**永不执行**，即使在 live 模式下：

| 操作 | 类别 | 风险 |
|------|------|------|
| `production deploy` | 部署 | 生产宕机 |
| `nginx reload` | 基础设施 | 服务中断 |
| `sudo <anything>` | 提权 | 系统安全 |
| `rm -rf <anything>` | 文件系统 | 数据丢失 |
| `.env modify` | 配置 | 认证泄漏 |
| `docker compose up` | 容器 | 资源冲突 |
| `pm2 restart production` | 进程 | 服务中断 |
| `git push --force` | 代码 | 历史丢失 |
| `chmod 777 <anything>` | 权限 | 安全隐患 |
| `kill -9 <process>` | 进程 | 服务中断 |

### 4.2 受限操作 (需要审批链)

| 操作 | 审批要求 |
|------|---------|
| `create-pr` | humanConfirmToken |
| `merge-pr` | humanConfirmToken + operator/admin 角色 |
| `draft-pr` | humanConfirmToken (codex) |
| `content-generate` | humanConfirmToken (doubao) |

### 4.3 plan-only 允许操作 (无审批)

| 操作 | Agent | 说明 |
|------|-------|------|
| `analyze_gmv_data` | codex | 分析数据趋势 |
| `gmv_optimization_strategy` | deepseek | 生成策略 |
| `generate_plan` | workbuddy | 制定计划 |
| `gmv_content_marketing` | doubao | 生成内容 |
| `readonly-audit` | workbuddy | 只读审计 |
| `readonly-review` | deepseek | 只读审查 |

---

## 5. AGENT_EXECUTION_PERMISSIONS

### 5.1 RBAC 矩阵

```javascript
// agent-permission-matrix.js
const AGENT_EXECUTION_PERMISSIONS = {
  codex: {
    ALLOW: ['draft-pr', 'analyze_gmv_data'],
    DENY: ['deploy-*', 'restart-*', 'modify-env', 'merge-pr']
  },
  deepseek: {
    ALLOW: ['readonly-review', 'gmv_optimization_strategy'],
    DENY: ['deploy-*', 'restart-*', 'modify-env', 'merge-pr']
  },
  workbuddy: {
    ALLOW: ['readonly-audit', 'generate_plan'],
    DENY: ['deploy-*', 'restart-*', 'modify-env', 'merge-pr', 'content-generate']
  },
  doubao: {
    ALLOW: ['content-generate', 'gmv_content_marketing'],
    DENY: ['deploy-*', 'restart-*', 'modify-env', 'merge-pr', 'code-generation']
  }
};
```

### 5.2 RBAC 拒绝策略

当 Agent 请求不在 ALLOW 列表中的操作时：

1. **Blocked + Propagation**: 该步骤被 blocked，所有下游步骤也被 blocked（BFS propagation）
2. **审计记录**: 拒绝原因写入 audit log
3. **Rollover**: 如果可能，尝试 fallback plan

---

## 6. Execution Audit

### 6.1 审计格式

```json
{
  "executionId": "exec_20260527_005200_abc123",
  "taskId": "task_1779843139387_02b07d5f",
  "correlationId": "gw_4fb9c721-c8ad-488b-be11-c5e7972793cd",
  "mode": "plan-only",
  "command": "/总控 提升GMV到5万",
  "user": "HaoZhongLiang",
  "steps": [
    {
      "step": 1,
      "agent": "codex",
      "action": "analyze_gmv_data",
      "decision": "blocked",
      "reason": "[not-in-allow-list] [AI-RBAC] codex 无权执行操作: analyze_gmv_data",
      "timestamp": "2026-05-27T00:52:19.390Z"
    }
  ],
  "result": "BLOCKED: 4/4 steps denied by AI-RBAC",
  "timestamp": "2026-05-27T00:52:19.390Z"
}
```

### 6.2 审计决策类型

| 决策 | 含义 | 行为 |
|------|------|------|
| `allowed` | 通过所有检查，可以执行 | 进入执行 |
| `blocked` | 被 RBAC 或 Policy 拒绝 | 不执行，标记 blocked |
| `denied` | 永久禁止操作 | 不执行，标记 DENY |
| `skipped` | 被 fallback plan 跳过 | 不执行，允许下游继续 |

---

## 7. 回滚与故障恢复

### 7.1 执行失败时的回滚

```
步骤 1: codex → draft-pr → 成功
步骤 2: deepseek → readonly-review → 成功
步骤 3: workbuddy → generate_plan → 失败 ❌
                    ↓
              rollbackPlan() 触发
                    ↓
          ┌─────────────────────┐
          │ 1. 标记步骤 3 FAILED│
          │ 2. 已执行步骤标记   │
          │ 3. 生成回滚计划     │
          │ 4. 通知用户         │
          └─────────────────────┘
```

### 7.2 回滚计划生成

```javascript
// 为失败步骤生成的 rollback plan
{
  "rollbackPlan": {
    "failedStep": 3,
    "failedAgent": "workbuddy",
    "failedAction": "generate_plan",
    "completedSteps": [1, 2],
    "recommendedAction": "retry_with_fallback",
    "fallbackMode": "plan-only",
    "estimatedImpact": "无副作用 (已完成步骤为只读)"
  }
}
```

---

## 8. 安全 Checklist

### 8.1 每步执行前

- [ ] 该命令在 Gateway 白名单中？
- [ ] 用户角色 >= 命令所需角色？
- [ ] Agent 有权限执行该操作？
- [ ] mode 合法（当前仅 plan-only）？

### 8.2 live execution 前 (当前不可用)

- [ ] humanConfirmToken 已提供？
- [ ] humanConfirmToken 验证通过？
- [ ] 操作不在永久禁止列表？
- [ ] 操作不在 DENY 列表？
- [ ] 操作有审计记录？

### 8.3 执行后

- [ ] execution audit 已写入？
- [ ] correlation ID 可追踪？
- [ ] 所有 Agent 调用的 token 已脱敏？
- [ ] 失败步骤已通知用户？

---

## 9. 版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| v1.0.0 | 2026-05-27 | 初始版本 |
