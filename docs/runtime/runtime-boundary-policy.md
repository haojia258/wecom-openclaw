# Runtime Boundary Policy

> **Scope**: AI Gateway Runtime 架构中各组件的调用边界、职责分离、禁止跨层调用的红线。
> **版本**: v1.0.0
> **生效日期**: 2026-05-27

---

## 1. 架构边界总览

```
┌─────────────────────────────────────────────────────────┐
│                    外部系统 (ChatGPT)                    │
│  GATEWAY_TOKEN ──────────────────────────────────────►  │
└──────────────────────────────────┬──────────────────────┘
                                   │ POST /gateway/command
                                   ↓
┌─────────────────────────────────────────────────────────┐
│                    Gateway 安全层                        │
│  - 认证 (GATEWAY_TOKEN)                                 │
│  - 授权 (command whitelist, mode check)                 │
│  - Replay 防护                                          │
│  - Rate Limit                                           │
│  - IP Allowlist                                         │
│  - 审计日志 (gateway-audit.log)                         │
│                                                         │
│  ❌ 不调用 Executor                                     │
│  ❌ 不调用 Commander                                    │
│  ✅ 只转发到 Bridge                                    │
└──────────────────────────────────┬──────────────────────┘
                                   │ 内部 POST /runtime/command
                                   │ Authorization: Bearer <BRIDGE_TOKEN>
                                   ↓
┌─────────────────────────────────────────────────────────┐
│                    Bridge 层                             │
│  - 验证 BRIDGE_TOKEN                                    │
│  - 命令解析 + 白名单                                    │
│  - WeCom RBAC (用户角色)                                │
│  - AI Runtime RBAC (Agent 能力)                        │
│  - Controlled Execution 决策                            │
│  - 审计日志 (bridge-*.jsonl)                             │
│                                                         │
│  ❌ 不直接调用 AI 模型                                  │
│  ✅ 必须进入 Commander                                 │
└──────────────────────────────────┬──────────────────────┘
                                   │ Commander Runtime
                                   ↓
┌─────────────────────────────────────────────────────────┐
│                  Commander Runtime                       │
│  - Goal 解析                                            │
│  - Planner 规划                                         │
│  - DAG 构建 (Kahn 拓扑排序)                             │
│  - Queue 调度                                           │
│  - Shadow Mode 影子执行                                 │
│  - 汇总输出                                             │
│                                                         │
│  ✅ 通过 Runtime RBAC 调用 AI 子 Agent                 │
└─────────────────────────────────────────────────────────┘
```

---

## 2. 调用边界红线

### 2.1 Gateway 禁止直接调用

| 禁止操作 | 原因 | 后果 |
|----------|------|------|
| Gateway → Executor | 绕过 Bridge 的 RBAC 检查 | 未授权执行 |
| Gateway → AI Agent (codex/deepseek 等) | 绕过 Bridge 的权限矩阵 | 越权操作 |
| Gateway → Commander Runtime 直接调用 | 绕过 Bridge 的任务管理 | 无 audit trail |
| Gateway → SQLite 直写 | 绕过 Bridge 的任务仓库 | 数据一致性损坏 |

**正确路径**: Gateway → Bridge → Commander → AI Agent

### 2.2 Bridge 禁止绕过

| 禁止操作 | 原因 | 强制入口 |
|----------|------|---------|
| 外部跳过 Bridge 调用 Commander | 失去 RBAC 保护 | `/runtime/command` (需 BRIDGE_TOKEN) |
| 外部直接操作 task-repository | 失去任务管理 | 通过 Bridge 间接操作 |
| 外部直连 executor | 失去 Controlled Execution | 通过 Bridge 间接调用 |

### 2.3 Commander 强制经过 Runtime RBAC

| 步骤 | RBAC 检查 | 拒绝影响 |
|------|-----------|---------|
| 调用 codex Agent | `AI-RBAC: codex 允许的操作列表` | 该步骤被拒绝 |
| 调用 deepseek Agent | `AI-RBAC: deepseek 允许的操作列表` | 该步骤被拒绝 |
| 调用 workbuddy Agent | `AI-RBAC: workbuddy 允许的操作列表` | 该步骤被拒绝 |
| 调用 doubao Agent | `AI-RBAC: doubao 允许的操作列表` | 该步骤被拒绝 |

**当前权限矩阵**:

| Agent | 允许操作 |
|-------|----------|
| codex | `draft-pr` |
| deepseek | `readonly-review` |
| workbuddy | `readonly-audit` |
| doubao | `content-generate` |

---

## 3. 数据边界

### 3.1 Token 隔离

```
Gateway Layer:
  GATEWAY_TOKEN (env var) ← 外部提供，header 传输
  ❌ 不传给 Bridge, 不写入 Bridge 日志

Bridge Layer:
  BRIDGE_TOKEN (env var) ← Gateway 内部注入，Authorization header
  ❌ 不暴露给 External Layer
  ❌ 不写入 gateway-audit.log
```

### 3.2 日志隔离

| 组件 | 日志文件 | 内容 |
|------|---------|------|
| Gateway | `logs/gateway-audit.log` | 认证/授权决策, tokenPrefix, correlationId |
| Bridge | `logs/tasks/bridge-*.jsonl` | 任务事件, bridgeToken(脱敏), Commander 输出 |
| Commander | `logs/tasks/*.jsonl` | 任务状态, DAG 步骤结果 |
| Executor | PM2 output | Runtime 执行细节 |

### 3.3 状态存储隔离

| 组件 | 存储方式 | 生命周期 |
|------|---------|---------|
| Gateway | 内存 (replay cache, rate limit) | PM2 重启即丢失 |
| Bridge | SQLite (tasks.db) | 持久化 |
| Commander | SQLite (tasks.db) | 持久化 |
| Executor | 内存 | 单次请求 |

---

## 4. 部署边界

### 4.1 组件部署关系

```
┌─────────────────────┐
│  wecom-adapter (PM2) │  ← 单进程，端口 3001
├─────────────────────┤
│  Gateway            │  ← POST /gateway/command
│  Bridge             │  ← POST /runtime/command
│  Commander          │  ← 被 Bridge 调用
│  AI Agents          │  ← 被 Commander 调用 (via Runtime RBAC)
│  Executor           │  ← 被 Commander 调用 (via Controlled Execution)
└─────────────────────┘
```

**关键约束**: 所有组件运行在同一 PM2 进程 (`wecom-adapter`) 中，不涉及跨进程通信。

### 4.2 环境变量隔离

| 变量 | 可见范围 | 使用方 |
|------|---------|--------|
| `GATEWAY_TOKEN` | `.env` → Gateway 模块 | 仅 Gateway 读取 |
| `BRIDGE_TOKEN` | `.env` → Gateway + Bridge 模块 | Gateway(注入) + Bridge(验证) |
| `GITHUB_TOKEN` | `.env` → Codex PR Agent | Codex Agent |
| `WECOM_*` | `.env` → WeCom 模块 | 企业微信适配器 |

---

## 5. 回滚边界

### 5.1 回滚触发条件

| 条件 | 严重级别 | 动作 | 时间窗口 |
|------|---------|------|---------|
| `/health` 失败 | 🔴 CRITICAL | 立即回滚 | 30s 未恢复 |
| Gateway 鉴权绕过 | 🔴 CRITICAL | 立即回滚 | 发现即行动 |
| live 模式未被拒绝 | 🔴 CRITICAL | 立即回滚 | 发现即行动 |
| PM2 连续重启 >3 | 🟠 HIGH | 回滚 | 5 分钟内 |
| audit 日志写入失败 | 🟡 MEDIUM | 检查后决定 | 30 分钟 |
| Bridge JSONL 写入失败 | 🟡 MEDIUM | 检查后决定 | 30 分钟 |

### 5.2 回滚步骤

```bash
# 1. 记录当前 commit
cd /opt/wecom-openclaw && git rev-parse HEAD | tee /tmp/rollback-commit.txt

# 2. 回滚代码
git checkout 0edb259   # P8.0.3 rollout 前 (Gateway 未部署)

# 3. 重启加载旧代码
sudo -u ubuntu pm2 restart wecom-adapter --update-env

# 4. 验证
curl -s http://127.0.0.1:3001/health  # 应返回 {"status":"ok"}

# 5. 验证 Gateway 不可用 (旧代码无此端点)
curl -s http://127.0.0.1:3001/gateway/command  # 应返回 404

# 6. 验证 Bridge 仍可用
# POST /runtime/command with BRIDGE_TOKEN should still work

# 7. 通知
# 企业微信: "⚠️ Gateway rollout 已回滚，原因: <reason>"
```

### 5.3 回滚后处理

1. 审查 `gateway-audit.log` 分析回滚原因
2. 修复根本问题
3. 在 staging 验证
4. 重新执行 P8.0.5 rollout

---

## 6. 安全红线 (违反立即回滚)

| 红线 | 检测方法 |
|------|---------|
| Gateway 返回非 plan-only 模式的执行结果 | 功能测试 |
| `gateway-audit.log` 中出现完整 Token | `grep "oc_gateway_" ... \| grep -v "\.\.\."` |
| BRIDGE_TOKEN 出现在 Gateway 日志中 | `grep "BRIDGE_TOKEN" gateway-audit.log` |
| Gateway 跳过 Bridge 直连 Commander | 审计日志分析 |
| 外部请求可绕过 GATEWAY_TOKEN 认证 | 安全测试 1-2 |
| 外部请求可突破 plan-only 限制 | 安全测试 5 |

---

## 7. 合规检查清单

### 7.1 每次部署后

- [ ] Gateway 只接受 plan-only 模式
- [ ] Gateway 不直接调用 AI Agent
- [ ] Gateway 不暴露 BRIDGE_TOKEN
- [ ] Bridge 不暴露 GATEWAY_TOKEN
- [ ] audit 日志 token 脱敏
- [ ] correlation ID 全链路一致

### 7.2 每条请求

- [ ] 来源: GATEWAY_TOKEN 有效
- [ ] 转发: BRIDGE_TOKEN 由 Gateway 内部注入
- [ ] pipeline: Gateway → Bridge → Commander → AI Agent
- [ ] 日志: gateway-audit.log → bridge-*.jsonl → tasks-*.jsonl
- [ ] 结果: plan-only 仅返回计划，不执行

---

## 8. 版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| v1.0.0 | 2026-05-27 | 初始版本 |
