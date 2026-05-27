# Gateway Runtime Runbook

> **Scope**: AI Gateway Runtime (`/gateway/command`) 的生产运维、故障排查、回滚操作手册。
> **版本**: v1.0.0
> **生效日期**: 2026-05-27
> **Owner**: HaoZhongLiang

---

## 1. 概述

AI Gateway Runtime 是外部系统（ChatGPT、第三方 Agent）接入企业微信 Commander 的**唯一受控入口**。

```
外部 (ChatGPT) → POST /gateway/command → Gateway 安全层 → Bridge → Commander Runtime → DAG Plan
```

### 核心原则

| 原则 | 说明 |
|------|------|
| **Token 分离** | `GATEWAY_TOKEN`（外部认证）≠ `BRIDGE_TOKEN`（内部桥接） |
| **Replay 防护** | `requestId + timestamp` 组合唯一，300s 时间窗 |
| **默认拒绝** | plan-only 模式强制，live 模式需人工确认 |
| **审计全链路** | 每个请求写入 `gateway-audit.log`，含 correlationId |
| **无生产变更** | Gateway 本身不触发 deploy / restart / nginx reload |

---

## 2. 快速诊断

### 2.1 Health Check

```bash
curl -s http://127.0.0.1:3001/health
# 期望: {"status":"ok","port":"3001","version":"v1.1.0"}
```

### 2.2 Gateway 可达性

```bash
GATEWAY_TOKEN="oc_gateway_prod_v1_xxx"
curl -s -X POST http://127.0.0.1:3001/gateway/command \
  -H "Gateway-Token: $GATEWAY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "source": "chatgpt",
    "user": "HaoZhongLiang",
    "command": "/总控 提升GMV到5万",
    "mode": "plan-only",
    "timestamp": <当前毫秒时间戳>,
    "requestId": "diag-'$(date +%s)'"
  }'
```

### 2.3 PM2 状态

```bash
pm2 jlist | python3 -c "
import sys, json
procs = json.load(sys.stdin)
for p in procs:
    if p['name'] == 'wecom-adapter':
        e = p['pm2_env']
        print(f'pid={e[\"pid\"]} status={e[\"status\"]} restarts={e[\"unstable_restarts\"]}')
"
```

---

## 3. 常见故障 & 处理

### 3.1 Health 失败

| 现象 | 可能原因 | 处理 |
|-------|-----------|------|
| `curl: connection refused` | PM2 进程未启动 | `pm2 restart wecom-adapter --update-env` |
| `{"status":"error"}` | 应用内部错误 | 检查 `pm2 logs wecom-adapter` |
| 超时 (>5s) | 事件循环阻塞 | 检查 CPU；必要时重启 |

### 3.2 401 UNAUTHORIZED

```bash
# 检查 GATEWAY_TOKEN 是否正确配置
grep GATEWAY_TOKEN /opt/wecom-openclaw/.env | sed 's/=.*/=***/'

# 检查请求 header 是否正确传递
# Gateway-Token: <token>   (注意是 Gateway-Token，不是 Authorization)
```

### 3.3 400 BAD_REQUEST (timestamp 偏差)

```
原因: Timestamp 与服务器时间偏差超过 300s
检查: date +%s%3N   (请求方时间戳)
      SSH 到服务器: date +%s%3N   (服务器时间戳)
修正: 请求方时钟同步 (NTP)
```

### 3.4 403 REPLAY_DETECTED

```
原因: 相同 requestId + timestamp 已被使用
检查: gateway-audit.log 中该 requestId 的历史记录
修正: 请求方生成全新 requestId (建议: gw-<timestamp>-<random>)
```

### 3.5 403 FORBIDDEN (命令不在白名单)

```
当前白名单: /总控, /commander, /总控台, /目标, /帮助, /状态, /进度, /任务列表
非白名单命令会被拒绝，不会进入 Commander
```

### 3.6 PM2 unstable_restarts > 0

```bash
# 查看重启原因
pm2 logs wecom-adapter --lines 100 --err

# 常见原因:
# 1. .env 格式错误 (引号不匹配等)
# 2. 端口 3001 被占用
# 3. 依赖缺失 (npm install 未执行)
```

---

## 4. 回滚 Runbook

> 详见 `runtime-boundary-policy.md` Section 5

### 4.1 触发条件

| 条件 | 检查方式 | 动作 |
|------|---------|------|
| health 持续失败 (>30s) | `curl /health` | 立即回滚 |
| `/gateway/command` 绕过鉴权 | 安全测试 1-2 失败 | 立即回滚 |
| live 模式未被拒绝 | 安全测试 5 失败 | 立即回滚 |
| PM2 连续重启 (unstable_restarts > 3) | `pm2 jlist` | 立即回滚 |
| audit.log 无写入 | `tail gateway-audit.log` | 检查后决定 |

### 4.2 回滚步骤

```bash
# Step 1: 记录当前 commit (便于事后分析)
cd /opt/wecom-openclaw && git rev-parse HEAD

# Step 2: 回滚到上一个稳定版本
git checkout 0edb259   # P8.0.3 rollout 前的 commit
# 或者更保守: git checkout 45e3c29   # P8.0.2 rollout

# Step 3: 重启加载旧代码
sudo -u ubuntu pm2 restart wecom-adapter --update-env

# Step 4: 验证回滚成功
curl -s http://127.0.0.1:3001/health
curl -s http://127.0.0.1:3001/runtime/command ...   # Bridge 仍可用

# Step 5: 通知
# 企业微信群发送: "⚠️ P8.0.5 回滚完成，原因: <reason>"
```

### 4.3 回滚后验证清单

- [ ] `/health` 返回 `{"status":"ok"}`
- [ ] `/runtime/command` (Bridge) 正常工作（旧入口不受影响）
- [ ] `/gateway/command` 返回 404 或旧版本行为
- [ ] `pm2 logs` 无异常错误
- [ ] `gateway-audit.log` 停止写入（确认旧版本不含 Gateway）

---

## 5. 审计 & 可观测性

### 5.1 日志文件位置

| 日志 | 路径 | 用途 |
|------|------|------|
| Gateway 审计日志 | `/opt/wecom-openclaw/logs/gateway-audit.log` | 所有 Gateway 请求的认证/授权决策 |
| Bridge 接收日志 | `/opt/wecom-openclaw/apps/wecom-adapter/logs/tasks/bridge-*.jsonl` | Gateway→Bridge 的请求详情 |
| PM2 标准输出 | `pm2 logs wecom-adapter` | 应用运行时日志 |
| PM2 标准错误 | `pm2 logs wecom-adapter --err` | 错误堆栈 |

### 5.2 Correlation ID 追踪

每个 Gateway 请求会生成 `correlationId`（`gw_<UUID>`），全链路追踪方式：

```bash
# Step 1: 从 Gateway 审计日志获取 correlationId
grep "gw-prod-test-001" /opt/wecom-openclaw/logs/gateway-audit.log

# Step 2: 在 Bridge 日志中搜索 correlationId
grep "gw_4fb9c721" /opt/wecom-openclaw/apps/wecom-adapter/logs/tasks/bridge-*.jsonl

# Step 3: 在 Commander 日志中搜索 taskId
grep "bridge_1779843139382_3351379e" /opt/wecom-openclaw/apps/wecom-adapter/logs/tasks/*.jsonl
```

### 5.3 Token 脱敏规则

审计日志中 `tokenPrefix` 字段仅记录 Token 前 4 字符 + `...`：

```
正确: "tokenPrefix": "oc_g..."
错误: "token": "oc_gateway_prod_v1_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

**如果发现完整 Token 泄漏到日志，立即轮换 GATEWAY_TOKEN。**

---

## 6. 日常维护

### 6.1 轮换 GATEWAY_TOKEN

```bash
# Step 1: 生成新 Token
python3 -c "import secrets; print('oc_gateway_prod_v1_' + secrets.token_hex(16))"

# Step 2: 更新 .env (追加或替换)
vim /opt/wecom-openclaw/.env
# 修改 GATEWAY_TOKEN=oc_gateway_prod_v1_<new_hex>

# Step 3: 重启使 Token 生效
sudo -u ubuntu pm2 restart wecom-adapter --update-env

# Step 4: 验证新 Token 可用
GATEWAY_TOKEN="<new_token>"
curl -s -X POST http://127.0.0.1:3001/gateway/command \
  -H "Gateway-Token: $GATEWAY_TOKEN" ...

# Step 5: 通知外部系统更新 Token
```

### 6.2 检查 Rate Limit 状态

```bash
# Rate Limit 存储在内存中，重启会清零
# 检查当前是否有 429 错误:
grep "RATE_LIMIT" /opt/wecom-openclaw/logs/gateway-audit.log | tail -10
```

### 6.3 清理旧审计日志

```bash
# gateway-audit.log 当前为 append-only，未做 rotation
# 建议: 使用 logrotate 或手动归档
cp /opt/wecom-openclaw/logs/gateway-audit.log \
   /opt/wecom-openclaw/logs/gateway-audit-$(date +%Y%m%d).log
> /opt/wecom-openclaw/logs/gateway-audit.log   # 清空当前文件
```

---

## 7. 紧急联系人

| 角色 | 姓名 | 联系方式 |
|------|------|---------|
| **On-call** | HaoZhongLiang | 企业微信 |
| **Escalation** | (待填写) | |

---

## 8. 版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| v1.0.0 | 2026-05-27 | 初始版本，P8.0.5 Rollout 后固化 |
