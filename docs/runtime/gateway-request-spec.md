# Gateway Request Specification

> **Version**: v1.0.0
> **Endpoint**: `POST /gateway/command`
> **Protocol**: HTTPS / HTTP (内网)
> **Content-Type**: `application/json`

---

## 1. Request

### 1.1 HTTP Method & URL

```
POST http(s)://<host>:3001/gateway/command
```

### 1.2 Headers

| Header | Required | Description |
|--------|----------|-------------|
| `Gateway-Token` | ✅ 必须 | 外部认证 Token，格式 `oc_gateway_<env>_v<version>_<32hex>` |
| `Content-Type` | ✅ 必须 | `application/json` |

**注意**: 不使用 `Authorization: Bearer` header。`Authorization` 保留给内部 `/runtime/command` 使用。

### 1.3 Body Schema

```json
{
  "source": "string (required)",
  "user": "string (required)",
  "command": "string (required)",
  "mode": "string (required, default: plan-only)",
  "timestamp": "number (required, Unix ms)",
  "requestId": "string (required, unique per request)"
}
```

### 1.4 字段定义

| Field | Type | Required | Default | Constraints |
|-------|------|----------|---------|-------------|
| `source` | string | ✅ | — | 调用来源，如 `"chatgpt"`, `"third-party"` |
| `user` | string | ✅ | — | 企业微信用户 ID，如 `"HaoZhongLiang"` |
| `command` | string | ✅ | — | 命令文本，如 `"/总控 提升GMV到5万"` |
| `mode` | string | ✅ | `"plan-only"` | **当前仅允许** `"plan-only"` |
| `timestamp` | number | ✅ | — | Unix 毫秒时间戳，偏差 ≤ ±300s |
| `requestId` | string | ✅ | — | 唯一请求 ID，格式 `gw-<source>-<random>` |

### 1.5 source 合法值

| 值 | 说明 |
|-----|------|
| `"chatgpt"` | ChatGPT / OpenAI GPT Actions |
| `"cli"` | 命令行工具 |
| `"web"` | Web 控制台 |
| `"mobile"` | 移动端 |
| `"third-party"` | 其他第三方系统 |

### 1.6 mode 约束

| 值 | 当前状态 | 说明 |
|-----|---------|------|
| `"plan-only"` | ✅ 允许 | 仅返回 DAG 执行计划，不执行 |
| `"live"` | ❌ 禁止 | 需要 `humanConfirmToken`，生产环境默认拒绝 |
| `"dry-run"` | ❌ 禁止 | 目前通过 plan-only 覆盖 |

---

## 2. Response

### 2.1 Success (200 OK)

```json
{
  "success": true,
  "requestId": "789389c3-822e-478f-b9b9-1a1599006759",
  "correlationId": "gw_4fb9c721-c8ad-488b-be11-c5e7972793cd",
  "taskId": "bridge_1779843139382_3351379e",
  "mode": "plan-only",
  "output": "<Commander Runtime 的完整输出文本>",
  "source": "ai-gateway"
}
```

**字段说明**:

| Field | Type | Description |
|-------|------|-------------|
| `success` | boolean | 固定 `true` |
| `requestId` | string | Gateway 内部生成的请求 ID |
| `correlationId` | string | 全链路追踪 ID，格式 `gw_<UUID>` |
| `taskId` | string | Commander 分配给任务的任务 ID |
| `mode` | string | 执行模式（当前固定 `"plan-only"`） |
| `output` | string | Commander Runtime 的完整输出 |
| `source` | string | 固定 `"ai-gateway"` |

### 2.2 Error Responses

#### 400 BAD_REQUEST — 参数缺失或畸变

```json
{
  "success": false,
  "error": "BAD_REQUEST",
  "reason": "<具体原因>"
}
```

**场景**:
- `source` / `user` / `command` 字段缺失
- `timestamp` 格式错误（非数字）
- `timestamp` 偏差超过 300 秒

#### 401 UNAUTHORIZED — 认证失败

```json
{
  "success": false,
  "error": "UNAUTHORIZED",
  "reason": "<具体原因>"
}
```

**场景**:
- 缺少 `Gateway-Token` header
- Token 格式错误（长度不足 32 字符）
- Token 与环境变量 `GATEWAY_TOKEN` 不匹配

#### 403 FORBIDDEN — 授权拒绝

```json
{
  "success": false,
  "error": "FORBIDDEN",
  "reason": "<具体原因>"
}
```

**场景**:
- 命令不在 Gateway 白名单中
- `mode` 不在允许列表中（如 `live`）
- 命令匹配危险模式（`deploy`, `restart`, `merge` 等）
- 重复请求（`REPLAY_DETECTED` → 实际上是 403）
- IP 不在 Allowlist 中

#### 429 TOO_MANY_REQUESTS — 频率限制

```json
{
  "success": false,
  "error": "TOO_MANY_REQUESTS",
  "reason": "Rate limit exceeded. 每 60 秒最多 60 次请求",
  "retryAfter": 30
}
```

**Headers**:
- `Retry-After: 30` (建议等待秒数)

#### 500 INTERNAL_SERVER_ERROR — 内部错误

```json
{
  "success": false,
  "error": "INTERNAL_SERVER_ERROR",
  "reason": "Gateway 内部转发失败",
  "details": "<optional, 内部错误详情>"
}
```

---

## 3. 错误码速查表

| HTTP Status | `error` 值 | 场景 |
|-------------|-----------|------|
| `400` | `BAD_REQUEST` | 参数缺失、格式错误、timestamp 过期 |
| `401` | `UNAUTHORIZED` | 无 Token、错误 Token、Token 格式错误 |
| `403` | `FORBIDDEN` | 命令不在白名单、危险命令、IP 不在白名单 |
| `403` | `REPLAY_DETECTED` | 相同 requestId + timestamp 重复请求 |
| `429` | `TOO_MANY_REQUESTS` | 超过 Rate Limit |
| `500` | `INTERNAL_SERVER_ERROR` | 内部错误 |

---

## 4. 请求示例

### 4.1 cURL

```bash
GATEWAY_TOKEN="oc_gateway_prod_v1_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
TS=$(date +%s%3N)

curl -v -X POST http://127.0.0.1:3001/gateway/command \
  -H "Gateway-Token: $GATEWAY_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"source\": \"chatgpt\",
    \"user\": \"HaoZhongLiang\",
    \"command\": \"/总控 提升GMV到5万\",
    \"mode\": \"plan-only\",
    \"timestamp\": $TS,
    \"requestId\": \"gw-chatgpt-$(date +%s)-$(openssl rand -hex 4)\"
  }"
```

### 4.2 Python

```python
import requests
import time
import uuid
import os

GATEWAY_TOKEN = os.environ["GATEWAY_TOKEN"]
TIMESTAMP = int(time.time() * 1000)
REQUEST_ID = f"gw-chatgpt-{int(time.time())}-{uuid.uuid4().hex[:8]}"

response = requests.post(
    "http://127.0.0.1:3001/gateway/command",
    headers={
        "Gateway-Token": GATEWAY_TOKEN,
        "Content-Type": "application/json"
    },
    json={
        "source": "chatgpt",
        "user": "HaoZhongLiang",
        "command": "/总控 提升GMV到5万",
        "mode": "plan-only",
        "timestamp": TIMESTAMP,
        "requestId": REQUEST_ID
    }
)

print(response.json())
```

### 4.3 Node.js

```javascript
const GATEWAY_TOKEN = process.env.GATEWAY_TOKEN;
const timestamp = Date.now();
const requestId = `gw-chatgpt-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

const response = await fetch('http://127.0.0.1:3001/gateway/command', {
  method: 'POST',
  headers: {
    'Gateway-Token': GATEWAY_TOKEN,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    source: 'chatgpt',
    user: 'HaoZhongLiang',
    command: '/总控 提升GMV到5万',
    mode: 'plan-only',
    timestamp,
    requestId
  })
});

const data = await response.json();
console.log(data);
```

---

## 5. ChatGPT Integration Guide

### 5.1 GPT Action Schema

```yaml
openapi: 3.0.0
info:
  title: WeCom Commander Gateway
  version: 1.0.0
servers:
  - url: https://your-server:3001
paths:
  /gateway/command:
    post:
      operationId: sendCommanderCommand
      summary: 向企业微信 Commander 发送命令
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required:
                - source
                - user
                - command
                - timestamp
                - requestId
              properties:
                source:
                  type: string
                  default: "chatgpt"
                user:
                  type: string
                  description: "企业微信用户 ID"
                command:
                  type: string
                  description: "命令文本"
                mode:
                  type: string
                  default: "plan-only"
                timestamp:
                  type: integer
                  description: "Unix 毫秒时间戳"
                requestId:
                  type: string
                  description: "唯一请求 ID"
      responses:
        '200':
          description: 成功
        '401':
          description: UNAUTHORIZED
        '400':
          description: BAD_REQUEST
        '403':
          description: FORBIDDEN
```

### 5.2 ChatGPT Custom Headers

在 GPT Action 配置中设置：
```json
{
  "headers": {
    "Gateway-Token": "oc_gateway_prod_v1_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
  }
}
```

---

## 6. 白名单命令

### 6.1 当前允许的命令

| 命令 | 说明 | 参数示例 |
|------|------|---------|
| `/总控` | Commander Runtime 统一入口 | `/总控 提升GMV到5万` |
| `/commander` | 英文别名 | `/commander boost gmv` |
| `/总控台` | 控制台入口 | `/总控台 状态` |
| `/目标` | 查看/设定目标 | `/目标 提升转化率` |
| `/帮助` | 帮助信息 | `/帮助` |
| `/状态` | 系统状态查询 | `/状态` |
| `/进度` | 任务进度查询 | `/进度 task_xxx` |
| `/任务列表` | 任务列表查询 | `/任务列表` |

### 6.2 禁止的命令模式

| 模式 | 类别 |
|------|------|
| `/deploy` | 部署操作 |
| `/merge` | 代码合并 |
| `/restart` | 服务重启 |
| `confirm:*` | Confirm 确认类 |
| `sudo*` | 提权操作 |
| `rm -*` | 文件删除 |
| `docker*` | Docker 操作 |

---

## 7. 版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| v1.0.0 | 2026-05-27 | 初始版本 |
