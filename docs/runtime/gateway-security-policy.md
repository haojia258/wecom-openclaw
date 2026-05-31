# Gateway Security Policy

> **Scope**: `POST /gateway/command` 的安全策略、Token 管理、审计规则。
> **版本**: v1.0.0
> **生效日期**: 2026-05-27

---

## 1. Token 架构

### 1.1 双层 Token 设计

```
外部请求                   内部请求
┌─────────────┐           ┌────────────────────┐
│  ChatGPT    │  GATEWAY_TOKEN  │  Gateway         │
│  (外部系统)  │ ──────────────→ │  /gateway/command│
└─────────────┘           └────────┬───────────┘
                                     │ 内部注入
                                     ↓
                              ┌────────────────────┐
                              │  Bridge              │
                              │  /runtime/command   │ ← BRIDGE_TOKEN
                              │  (Authorization头)  │
                              └────────────────────┘
```

| Token | 用途 | 位置 | 暴露范围 |
|-------|------|------|----------|
| `GATEWAY_TOKEN` | 外部认证 Gateway 请求 | `.env` (server-side) | 仅外部调用方（通过 HTTPS） |
| `BRIDGE_TOKEN` | 内部 Gateway→Bridge 认证 | `.env` (server-side) | **不暴露给外部**，Gateway 内部注入 |

### 1.2 GATEWAY_TOKEN 规范

```
格式: oc_gateway_<env>_v<version>_<32hex>
示例: oc_gateway_prod_v1_9435a012fd461ddfedfb5b99c7499b7f

<env>: prod | staging | dev
<version>: v1, v2, ...
<32hex>: secrets.token_hex(16) 生成
```

**生成命令**:
```bash
python3 -c "import secrets; print('oc_gateway_prod_v1_' + secrets.token_hex(16))"
```

### 1.3 BRIDGE_TOKEN 规范

```
格式: oc_bridge_<env>_v<version>_<32hex>
示例: oc_bridge_prod_v1_2026_a1b2c3d4e5f6...
```

- 由 Gateway 在转发请求时**自动注入**到 `Authorization: Bearer <BRIDGE_TOKEN>` header
- **外部系统不需要、也不能提供 BRIDGE_TOKEN**
- 如果外部请求尝试在 body 中传入 `bridgeToken`，Block 会忽略或拒绝

---

## 2. 请求认证

### 2.1 认证流程

```
Request → [1. Gateway-Token header 存在?] → NO → 401 UNAUTHORIZED
               ↓ YES
         [2. Token 格式合法? (长度≥32)] → NO → 401 UNAUTHORIZED
               ↓ YES
         [3. Token 匹配 GATEWAY_TOKEN?] → NO → 401 UNAUTHORIZED
               ↓ YES
         [4. timestamp 偏差 ≤ 300s?] → NO → 400 BAD_REQUEST
               ↓ YES
         [5. requestId+timestamp 未重放?] → NO → 403 REPLAY_DETECTED
               ↓ YES
         [6. IP 在 Allowlist?] → NO → 403 FORBIDDEN
               ↓ YES
         [7. Rate Limit 未超限?] → NO → 429 TOO_MANY_REQUESTS
               ↓ YES
         → 转发到 /runtime/command (注入 BRIDGE_TOKEN)
```

### 2.2 禁止的认证方式

| 方式 | 状态 | 原因 |
|------|------|------|
| Query 参数 `?token=xxx` | ❌ 禁止 | Token 会暴露在 access log |
| Basic Auth `Authorization: Basic` | ❌ 禁止 | 设计不使用 |
| Cookie | ❌ 禁止 | 无状态 API |
| 无 Token | ❌ 拒绝 | 401 UNAUTHORIZED |

**正确方式**:
```
POST /gateway/command
Gateway-Token: oc_gateway_prod_v1_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
Content-Type: application/json

{
  "source": "chatgpt",
  "timestamp": 1716763200000,
  "requestId": "gw-request-001",
  ...
}
```

---

## 3. Replay 防护

### 3.1 机制

- **Key**: `requestId + timestamp` 组合
- **存储**: 内存 Map (`replayCache`)
- **TTL**: 自动过期（timestamp + 300s）
- **拒绝**: 相同 Key 在 TTL 内第二次出现 → `403 REPLAY_DETECTED`

### 3.2 重放攻击示例

```bash
# 攻击者截获合法请求并重放
curl -s -X POST http://server:3001/gateway/command \
  -H "Gateway-Token: oc_gateway_prod_v1_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "source": "chatgpt",
    "timestamp": 1716763200000,      ← 相同的 timestamp
    "requestId": "gw-legitimate-001", ← 相同的 requestId
    "command": "/deploy"
  }'

# 响应: {"success":false, "error":"REPLAY_DETECTED", "reason":"Duplicate request..."}
```

### 3.3 安全建议

- `requestId` 应使用 UUID v4 或等效随机值
- 不建议使用自增 ID（可预测）
- 建议格式: `gw-<timestamp>-<random_hex_8>`

---

## 4. IP Allowlist

### 4.1 配置

```javascript
// src/gateway/ai-gateway.js
const IP_ALLOWLIST = [
  '::1',           // IPv6 loopback
  '127.0.0.1',   // IPv4 loopback
  '::ffff:127.0.0.1',  // IPv4-mapped IPv6
  // 添加 ChatGPT 出口 IP（待获取）
];
```

### 4.2 检查逻辑

```javascript
const clientIP = req.headers['x-forwarded-for']?.split(',')[0].trim()
           || req.connection.remoteAddress;
if (!IP_ALLOWLIST.includes(clientIP)) {
  return res.status(403).json({ success: false, error: 'FORBIDDEN', reason: 'IP 不在允许列表中' });
}
```

### 4.3 未来增强

- [ ] 从环境变量 `GATEWAY_IP_ALLOWLIST` 读取（逗号分隔）
- [ ] 支持 CIDR 格式（如 `18.208.0.0/12`）
- [ ] 自动获取 ChatGPT 官方出口 IP 段

---

## 5. Rate Limiting

### 5.1 当前配置

| 参数 | 值 | 说明 |
|------|-----|------|
| 窗口大小 | 60 秒 | 滑动窗口 |
| 最大请求数 | 60 | 每个 IP |
| 超限响应 | `429 TOO_MANY_REQUESTS` | 带 `Retry-After` header |

### 5.2 算法

```
滑动窗口计数器:
  - key: clientIP
  - value: [timestamp1, timestamp2, ...]
  - 清理: 每次请求时移除 >60s 的旧记录
  - 检查: 窗口内计数 > 60 → 拒绝
```

### 5.3 监控

```bash
# 检查是否有 429 被触发
grep "TOO_MANY_REQUESTS" /opt/wecom-openclaw/logs/gateway-audit.log | wc -l

# Rate Limit 存储在内存中，重启 PM2 会重置
```

---

## 6. Token 脱敏规则

### 6.1 审计日志脱敏

| 字段 | 存储值 | 说明 |
|------|--------|------|
| `tokenPrefix` | `"oc_g..."` (前 4 字符 + `...`) | **禁止**存储完整 Token |
| `token` | **不存储** | 绝不写入审计日志 |
| `GATEWAY_TOKEN` | **不存储** | 不出现在任何日志文件 |

### 6.2 代码中的脱敏实现

```javascript
// src/gateway/gateway-audit.js
function maskToken(token) {
  if (!token) return '(empty)';
  return token.substring(0, 4) + '...';
}
```

### 6.3 泄漏检测

```bash
# 检查审计日志中是否有完整 Token
grep -i "oc_gateway_" /opt/wecom-openclaw/logs/gateway-audit.log | grep -v "\.\.\."

# 如果发现完整 Token:
# 1. 立即轮换 GATEWAY_TOKEN
# 2. 清理已泄漏的审计日志条目
# 3. 审查访问日志确认泄漏范围
```

---

## 7. Audit Retention

### 7.1 当前策略

| 项目 | 当前状态 | 计划 |
|------|----------|------|
| 存储位置 | `logs/gateway-audit.log` (JSONL) | 不变 |
| Rotation | 无（append-only） | 使用 `logrotate` 或手动归档 |
| 保留期限 | 未定义 | 建议 90 天 |
| 访问权限 | `ubuntu:ubuntu` | 限制为 `root:admin` |

### 7.2 归档脚本（建议）

```bash
#!/bin/bash
# /opt/wecom-openclaw/scripts/archive-gateway-audit.sh
AUDIT_LOG="/opt/wecom-openclaw/logs/gateway-audit.log"
ARCHIVE_DIR="/opt/wecom-openclaw/logs/archive"
DATE=$(date +%Y%m%d)

mkdir -p "$ARCHIVE_DIR"
cp "$AUDIT_LOG" "$ARCHIVE_DIR/gateway-audit-$DATE.log"
> "$AUDIT_LOG"   # 清空当前文件

# 删除 90 天前的归档
find "$ARCHIVE_DIR" -name "gateway-audit-*.log" -mtime +90 -delete
```

### 7.3 审计日志格式

```json
{
  "requestId": "b24a0c34-8b8b-47f8-b8c4-2e904a8f9d33",
  "correlationId": "gw_498de1af-9b74-4d84-b77f-80a9acec4052",
  "timestamp": "2026-05-27T00:52:58.642Z",
  "sourceIP": "::ffff:127.0.0.1",
  "user": "test",
  "command": "/help",
  "mode": "live",
  "tokenPrefix": "oc_g...",
  "result": "blocked",
  "blockedReason": "命令 \"/help\" 不在 Gateway 白名单中",
  "durationMs": null,
  "taskId": null
}
```

**字段说明**:
- `requestId`: 外部调用方提供的请求 ID（用于幂等）
- `correlationId`: Gateway 内部生成的追踪 ID（格式 `gw_<UUID>`）
- `tokenPrefix`: Token 脱敏（前 4 字符 + `...`）
- `result`: `allowed` | `blocked`
- `durationMs`: 处理耗时（毫秒），仅当 `result=allowed` 时有值

---

## 8. 安全 Checklist

### 8.1 部署前

- [ ] GATEWAY_TOKEN 已生成（32 hex，格式正确）
- [ ] GATEWAY_TOKEN 已写入 `.env`（未提交到 git）
- [ ] `.env` 在 `.gitignore` 中
- [ ] BRIDGE_TOKEN 已配置
- [ ] IP Allowlist 已配置（至少包含 127.0.0.1）
- [ ] 审计日志路径是否存在且有写权限

### 8.2 部署后

- [ ] `curl /health` 正常
- [ ] 无 Token 请求 → 401 ✅
- [ ] 错误 Token 请求 → 401 ✅
- [ ] 过期 timestamp → 400 ✅
- [ ] 重放请求 → 403 ✅
- [ ] `gateway-audit.log` 正常写入 ✅
- [ ] Token 脱敏正常（`oc_g...`）✅

### 8.3 定期审查

- [ ] 每月轮换 GATEWAY_TOKEN
- [ ] 审查 `gateway-audit.log` 中的 `result=blocked` 条目
- [ ] 检查是否有 429 频繁出现（可能是攻击或配置过严）
- [ ] 归档 90 天前的审计日志

---

## 9. 版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| v1.0.0 | 2026-05-27 | 初始版本 |
