# Staging Architecture

> 适用于：wecom-openclaw staging 环境设计
> 生效目标：日本服务器承担 staging，北京服务器保持 production
> 设计日期：2026-05-24
> 版本：v1.0

---

## 概述

本文档定义 wecom-openclaw 的 staging（预发布）环境架构。staging 是 develop → production 之间的**强制验证门禁**，所有涉及企微回调、命令路由、环境变量、部署流程的变更必须先通过 staging 验证，才能合入 main 并发布生产。

### 关键决策

| 决策 | 结论 |
|------|------|
| staging 服务器 | 日本服务器（43.163.229.96） |
| production 服务器 | 北京服务器（49.232.24.120） |
| 部署工具 | PM2（推荐），Docker Compose（后续可选） |
| staging 分支 | `develop` |
| production 分支 | `main` 或正式 tag |
| 企微应用 | staging 使用独立测试应用，不复用 production 应用 |

### 设计约束

1. staging 与 production 在**目录、进程、端口、环境变量、日志、数据文件**上完全隔离
2. staging 不复用 production 的企业微信应用、回调地址、密钥和数据目录
3. staging **不改动**现有 relay/OpenAI 链路，**不重启** `sing-box` / `autossh`
4. production 仅从 `main` 或正式 tag 部署，staging 仅从 `develop` 部署
5. staging 推送类能力默认关闭，避免误发正式群

---

## 环境边界

| 环境 | 服务器 | IP | 用途 | 分支 | 端口 |
|------|--------|----|------|------|------|
| **production** | 北京 | 49.232.24.120 | 正式企微回调、正式数据处理 | `main` / tag | `3001` |
| **staging** | 日本 | 43.163.229.96 | 预发布验证、测试企微回调 | `develop` | `3101` |
| **relay** | 日本 | 43.163.229.96 | OpenAI API 中转（sing-box + autossh） | 不属于应用发布 | 保持现状 |

### 隔离原则（五不原则）

| # | 原则 | 说明 |
|---|------|------|
| 1 | 不部署 | production 不部署 staging 代码 |
| 2 | 不读取 | staging 不读取 production `.env` |
| 3 | 不写入 | staging 不写 production logs/storage |
| 4 | 不变更 | staging 不变更日本 relay 服务配置 |
| 5 | 不复用 | staging 只使用测试企业微信应用和测试密钥 |

---

## A. 目录结构

### Staging 目录（日本服务器）

```text
/opt/wecom-openclaw-staging/
├── repo/                              # git clone --branch develop
│   └── (wecom-openclaw 完整仓库)
├── shared/
│   ├── env/
│   │   └── .env.staging               # 600 权限，仅本机保存，不提交
│   ├── logs/
│   │   ├── wecom-adapter/             # 应用运行时日志
│   │   ├── ads-worker/                # 广告 Worker 日志
│   │   ├── nginx/                     # Nginx access/error log
│   │   ├── deploy/                    # 部署记录
│   │   └── audits/                    # 审计输出
│   ├── storage/
│   │   ├── doudian/                   # 抖店数据（staging 专用）
│   │   ├── compass/                   # 电商罗盘数据
│   │   └── activity/                  # 活动数据
│   └── backups/
│       ├── pm2/                       # PM2 snapshot
│       ├── env/                       # .env.staging 备份
│       └── releases/                  # 发布版本记录
└── runtime/
    ├── pm2/
    │   └── ecosystem.staging.config.js
    └── nginx/
        └── staging-wecom.conf
```

### Production 目录（北京服务器）

```text
/opt/wecom-openclaw/                   # 保持现有结构不变
```

### 隔离规则

- ❌ 禁止在 staging 中使用 production 路径作为软链接或共享目录
- ❌ 禁止 staging 进程读取 `/opt/wecom-openclaw/` 下任何文件
- ✅ staging 所有路径前缀为 `/opt/wecom-openclaw-staging/`

---

## B. 部署方案

### 推荐方案：PM2

当前应用以 Node.js + PM2 运行为主，staging 优先沿用 PM2，降低运行时差异。

#### PM2 进程命名

| 进程 | staging 名称 | 监听地址 | 说明 |
|------|-------------|----------|------|
| wecom-adapter | `wecom-adapter-staging` | `127.0.0.1:3101` | 企微回调入口 |
| ads-worker | `ads-worker-staging` | 无公网监听 | 广告数据采集 |

#### Ecosystem 配置文件

文件路径：`/opt/wecom-openclaw-staging/runtime/pm2/ecosystem.staging.config.js`

```javascript
module.exports = {
  apps: [
    {
      name: 'wecom-adapter-staging',
      script: 'apps/wecom-adapter/src/index.js',
      cwd: '/opt/wecom-openclaw-staging/repo',
      env: {
        NODE_ENV: 'staging',
        APP_ENV: 'staging',
        PORT: 3101,
      },
      env_file: '/opt/wecom-openclaw-staging/shared/env/.env.staging',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: '/opt/wecom-openclaw-staging/shared/logs/wecom-adapter/err.log',
      out_file: '/opt/wecom-openclaw-staging/shared/logs/wecom-adapter/out.log',
      merge_logs: true,
      max_restarts: 5,
      restart_delay: 5000,
      watch: false,
    },
    {
      name: 'ads-worker-staging',
      script: 'apps/ads-worker/index.js',
      cwd: '/opt/wecom-openclaw-staging/repo',
      env: {
        NODE_ENV: 'staging',
        APP_ENV: 'staging',
      },
      env_file: '/opt/wecom-openclaw-staging/shared/env/.env.staging',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: '/opt/wecom-openclaw-staging/shared/logs/ads-worker/err.log',
      out_file: '/opt/wecom-openclaw-staging/shared/logs/ads-worker/out.log',
      merge_logs: true,
      max_restarts: 3,
      restart_delay: 10000,
      watch: false,
    },
  ],
};
```

#### PM2 操作命令

```bash
# 启动 staging
pm2 start /opt/wecom-openclaw-staging/runtime/pm2/ecosystem.staging.config.js

# 重载（无停机）
pm2 reload wecom-adapter-staging --update-env

# 查看状态
pm2 status wecom-adapter-staging

# 查看日志
pm2 logs wecom-adapter-staging --lines 50

# 停止
pm2 stop wecom-adapter-staging

# 保存进程列表（重启后自动恢复）
pm2 save
```

### 可选方案：Docker Compose

Docker Compose 适合后续把 staging 完全容器化，但 P1 不作为默认方案。

#### 项目命名

```yaml
# compose 项目名（通过 -p 或 COMPOSE_PROJECT_NAME）
COMPOSE_PROJECT_NAME=wecom-openclaw-staging
```

#### 网络与卷

```yaml
networks:
  wecom_staging_net:
    name: wecom_staging_net
    driver: bridge

volumes:
  wecom_staging_logs:
    name: wecom_staging_logs
  wecom_staging_storage:
    name: wecom_staging_storage
```

#### 容器约束

- 所有容器名必须带 `staging` 后缀
- compose **不得**管理 `sing-box`、`autossh` 或任何 relay 组件
- 端口映射仅暴露 `3101`，其余内部通信

---

## C. Staging Env 规范

### 环境变量文件

```text
路径：/opt/wecom-openclaw-staging/shared/env/.env.staging
权限：600（仅 owner 可读写）
Git：已加入 .gitignore，永不提交
```

### 变量对照表

| 变量 | staging 值 | 说明 |
|------|-----------|------|
| `NODE_ENV` | `staging` | Node.js 运行环境 |
| `APP_ENV` | `staging` | 应用层环境标识 |
| `PORT` | `3101` | 监听端口，与 production `3001` 隔离 |
| `WECOM_AGENT_ID` | 测试应用 AgentID | 独立测试应用 |
| `WECOM_TOKEN` | 测试应用 Token | 独立测试密钥 |
| `WECOM_ENCODING_AES_KEY` | 测试应用 EncodingAESKey | 独立加密密钥 |
| `WECOM_CORP_ID` | 测试空间 CorpID | 与 production 不同 |
| `WECOM_WEBHOOK_URL` | 测试群 Webhook | 仅发测试群 |
| `VAULT_ADDR` | staging Vault 地址或 `disabled` | 禁用或独立 Vault |
| `VAULT_ROLE_ID` | staging 专用 AppRole | 不共享 production role |
| `VAULT_SECRET_ID` | staging 专用 SecretID | 不共享 production secret |
| `LOG_DIR` | `/opt/wecom-openclaw-staging/shared/logs` | 独立日志目录 |
| `DATA_DIR` | `/opt/wecom-openclaw-staging/shared/storage` | 独立数据目录 |
| `PUSH_CRON` | `false` 或低频 | 推送默认关闭 |
| `HTTP_PROXY` | `socks5://127.0.0.1:1087` | 复用现有 relay 代理（如需） |

### 密钥规则

| # | 规则 |
|---|------|
| 1 | staging 不使用 production 企微密钥 |
| 2 | staging 不使用 production Vault role/secret |
| 3 | `.env.staging` 不提交到 Git |
| 4 | `.env.staging` 权限 `600` |
| 5 | staging 推送类能力默认关闭（`PUSH_CRON=false`） |
| 6 | staging webhook 仅发送到测试群 |

---

## D. Nginx 反向代理

staging 在日本服务器上使用**独立 server block**，不修改 production Nginx 配置。

### 独立配置文件

文件路径：`/opt/wecom-openclaw-staging/runtime/nginx/staging-wecom.conf`

```nginx
# Staging Upstream
upstream wecom_openclaw_staging {
    server 127.0.0.1:3101;
    keepalive 16;
}

# Staging HTTP → HTTPS 重定向
server {
    listen 80;
    server_name staging-wecom.yudong.shop;
    return 301 https://$host$request_uri;
}

# Staging HTTPS 主配置
server {
    listen 443 ssl http2;
    server_name staging-wecom.yudong.shop;

    # SSL 证书（staging 专用）
    ssl_certificate     /etc/nginx/ssl/staging-wecom.yudong.shop.pem;
    ssl_certificate_key /etc/nginx/ssl/staging-wecom.yudong.shop.key;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;

    # 日志（独立路径）
    access_log /opt/wecom-openclaw-staging/shared/logs/nginx/access.log;
    error_log  /opt/wecom-openclaw-staging/shared/logs/nginx/error.log warn;

    # 企微回调（gzip off 保持兼容）
    location /wecom/ {
        gzip off;
        proxy_pass http://wecom_openclaw_staging;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # 超时配置
        proxy_connect_timeout 10s;
        proxy_read_timeout 30s;
        proxy_send_timeout 10s;
    }

    # 健康检查
    location /health {
        proxy_pass http://wecom_openclaw_staging/health;
        proxy_set_header Host $host;
        access_log off;
    }

    # 仅允许企微 IP 访问 /wecom/（可选增强安全）
    # include /etc/nginx/conf.d/wecom-allow-ips.conf;
}
```

### 配置要求

| # | 要求 |
|---|------|
| 1 | staging 使用**独立域名**和**独立 SSL 证书** |
| 2 | staging 只代理到 `127.0.0.1:3101`，不触碰其他端口 |
| 3 | `gzip off;` 保持企微 XML 回调兼容 |
| 4 | Nginx 日志路径全部指向 staging 独立目录 |
| 5 | 不引用 production 路径或 upstream |
| 6 | 不修改 relay 监听端口和 tunnel 配置 |
| 7 | Nginx reload 不影响 relay/sing-box/autossh |

---

## E. Staging 域名建议

### 推荐命名

| 用途 | 域名建议 | 说明 |
|------|----------|------|
| 企业微信回调 | `staging-wecom.yudong.shop` | 企微后台配置的回调 URL |
| 健康检查 | 同域 `/health` | `https://staging-wecom.yudong.shop/health` |

### 域名规则

- DNS A 记录指向日本服务器公网 IP（43.163.229.96）
- 不复用 production 域名（如 `wecom.yudong.shop` 或北京 IP 对应域名）
- 不通过 path 前缀在 production 域名下转发 staging（如 `yudong.shop/staging/`）
- SSL 证书建议使用 Let's Encrypt（certbot）自动续期

### DNS 配置示例

```text
staging-wecom.yudong.shop.  A  43.163.229.96
```

---

## F. Logs / Storage 隔离

### 日志目录

```text
/opt/wecom-openclaw-staging/shared/logs/
├── wecom-adapter/          # 应用日志
│   ├── err.log
│   └── out.log
├── ads-worker/             # 广告 Worker 日志
│   ├── err.log
│   └── out.log
├── nginx/                  # Nginx 日志
│   ├── access.log
│   └── error.log
├── deploy/                 # 部署记录
│   └── deploy-log.md
└── audits/                 # 审计输出
    └── <timestamp>/
```

### 数据目录

```text
/opt/wecom-openclaw-staging/shared/storage/
├── doudian/                # 抖店运营数据
├── compass/                # 电商罗盘数据
└── activity/               # 活动报名/利润数据
```

### 隔离要求

| # | 要求 |
|---|------|
| 1 | 所有 staging 日志文件名/目录与 production 完全独立 |
| 2 | 日志中环境标识为 `staging`（通过 `APP_ENV` 注入） |
| 3 | staging 不读取 `/opt/wecom-openclaw/logs` |
| 4 | staging 不写入 `/opt/wecom-openclaw/logs` |
| 5 | staging 审计输出保存在 `shared/logs/audits/<timestamp>/` |
| 6 | 禁止 staging 进程访问 production 数据目录 |

### 日志保留策略

| 日志类型 | 保留时间 | 说明 |
|----------|----------|------|
| app logs（err/out） | 14 天 | PM2 自动轮转 |
| deploy logs | 90 天 | 手动归档 |
| audit logs | 30 天 | 审计追溯 |
| webhook raw sample | 默认不保存 | 如需保存必须脱敏 |

### 日志轮转（建议 crontab）

```bash
# 每日清理 14 天前的应用日志（示例）
0 3 * * * find /opt/wecom-openclaw-staging/shared/logs/wecom-adapter/ -name "*.log.*" -mtime +14 -delete
0 3 * * * find /opt/wecom-openclaw-staging/shared/logs/ads-worker/ -name "*.log.*" -mtime +14 -delete
```

---

## G. Rollback 流程

staging rollback **仅影响日本服务器 staging 目录**，不影响 production。

### 标准 Rollback

```bash
# 1. 查看最近的 commits
cd /opt/wecom-openclaw-staging/repo
git log --oneline -5

# 2. 回退到上一个已验证的 commit
git checkout <previous_verified_commit>

# 3. 重载 PM2 进程
pm2 reload wecom-adapter-staging --update-env

# 4. 验证健康
curl -s http://127.0.0.1:3101/health | jq .

# 5. 外部健康检查
curl -s https://staging-wecom.yudong.shop/health | jq .
```

### Rollback 记录

文件：`/opt/wecom-openclaw-staging/shared/logs/deploy/deploy-log.md`

模板：

```markdown
## [YYYY-MM-DD HH:mm] STAGING ROLLBACK

- **From**: `<bad_commit>`
- **To**: `<previous_verified_commit>`
- **Reason**: `<简短原因>`
- **Health (local)**: `PASS / FAIL`
- **Health (external)**: `PASS / FAIL`
- **Operator**: `<Human / WorkBuddy>`
- **Notes**: `<补充说明>`
```

### Rollback 触发条件

| 条件 | 严重级别 | 操作 |
|------|----------|------|
| staging health check 失败 | 🔴 严重 | 立即 rollback |
| 企业微信测试应用 URL 验证失败 | 🔴 严重 | 立即 rollback |
| staging logs 出现 `fatal` / `uncaughtException` | 🔴 严重 | 立即 rollback |
| 测试群命令响应异常 | 🟠 中等 | 评估后 rollback |
| 非关键命令返回错误 | 🟡 轻微 | 记录、修复、重新部署 |

### Production Rollback

生产 rollback **仍执行** `docs/workflows/production-freeze.md` 中的生产回滚规则。staging rollback 不等于 production rollback，两者独立。

---

## H. Deploy Workflow

### Staging Deploy 输入

| 输入 | 来源 | 说明 |
|------|------|------|
| commit | `develop` HEAD 或指定 merge commit | Git commit hash |
| env | `.env.staging` | 独立环境变量 |
| process | `wecom-adapter-staging` | PM2 进程名 |
| health | `http://127.0.0.1:3101/health` | 本机健康检查 |
| health-ext | `https://staging-wecom.yudong.shop/health` | 外部健康检查 |

### Staging Deploy 步骤

```text
 1. 确认 PR 已合入 develop
 2. SSH 到日本服务器
 3. cd /opt/wecom-openclaw-staging/repo
 4. git fetch origin develop
 5. git checkout develop && git pull --ff-only origin develop
 6. 安装依赖（npm install --production 或复用 lockfile）
 7. 确认 .env.staging 存在且权限 600
 8. source shared/env/.env.staging（或通过 PM2 env_file 加载）
 9. pm2 reload wecom-adapter-staging --update-env
10. sleep 3 && curl -s http://127.0.0.1:3101/health
11. curl -s https://staging-wecom.yudong.shop/health
12. 企业微信测试应用发送验证命令
13. 写入 staging deploy log
```

### 禁止事项

| # | 禁止操作 |
|---|----------|
| 1 | 不在 staging deploy 中操作北京 production 服务器 |
| 2 | 不在 staging deploy 中重启 `sing-box` / `autossh` |
| 3 | 不在 staging deploy 中修改 production `.env` |
| 4 | 不把 staging 验证消息发送到正式群 |
| 5 | 不在 staging deploy 中修改 relay 配置 |

---

## I. Develop → Staging → Production 发布门禁

### 完整流程

```text
feature/*
    │
    ▼
  Pull Request ──→ Code Review + Tests
    │
    ▼
  develop (合并)
    │
    ▼
  Staging Deploy ──→ 日本服务器 /opt/wecom-openclaw-staging/
    │
    ▼
  Staging Verify ──→ 企微测试应用命令验证
    │                    ├── /帮助 PASS
    │                    ├── /状态 PASS (显示 staging)
    │                    ├── /监控 PASS (不读 production)
    │                    └── 变更命令 PASS
    │
    ▼
  Pull Request ──→ develop → main
    │
    ▼
  main (合并 + tag)
    │
    ▼
  Production Deploy ──→ 北京服务器 /opt/wecom-openclaw/
    │
    ▼
  Production Verify ──→ 正式企微应用验证
```

### 门禁矩阵

| 阶段 | 必须通过 | 失败处理 |
|------|----------|----------|
| PR → develop | Code Review + 相关测试通过 | 修复后重新 review |
| develop → staging | Staging Deploy Checklist 全部通过 | 修复后重新部署 |
| staging verify | 企微测试应用命令全 PASS | Rollback，记录失败原因 |
| develop → main | staging 验证记录 + 稳定窗口或人工批准 | 继续在 staging 测试 |
| main → production | Production Deploy Checklist 全部通过 | Rollback，记录 postmortem |

### 稳定窗口

| 变更类型 | staging 最短稳定时间 | 说明 |
|----------|---------------------|------|
| docs only | 即时（无需 staging） | 文档变更不部署 staging |
| audit scripts | 即时或人工批准 | 审计脚本不影响运行时 |
| command routing | 2 小时 | 命令路由变更需观察 |
| webhook crypto | 24 小时 | 加解密变更高风险 |
| env / vault / auth | 24 小时 | 认证配置变更高风险 |
| PM2 / deploy 流程 | 4 小时 | 部署流程变更 |
| Nginx 配置 | 4 小时 | 反向代理变更 |
| 新功能模块 | 24 小时 | 新模块需充分验证 |

### Staging 验证记录

staging 验证通过后，在 PR 或 release note 中记录：

```markdown
## Staging Verified

- **Commit**: `<full_sha>`
- **Branch**: `develop`
- **Domain**: `staging-wecom.yudong.shop`
- **Health (local)**: `PASS`
- **Health (external)**: `PASS`
- **WeCom URL Verify**: `PASS`
- **WeCom Commands**:
  - `/帮助`: `PASS`
  - `/状态`: `PASS` (env: staging)
  - `/监控`: `PASS`
  - `/活动`: `PASS`
  - (变更相关命令): `PASS`
- **Production Impact**: `NONE`
- **Relay Status**: `UNCHANGED`
- **Verified by**: `<Human / WorkBuddy>`
- **Verified at**: `<ISO 8601 timestamp>`
```

---

## J. 企业微信 Staging 验证方案

### 测试应用配置

| 项目 | production | staging |
|------|------------|---------|
| 企业微信应用 | 正式应用 | **独立测试应用** |
| AgentID | production AgentID | staging AgentID |
| Token | production Token | staging Token |
| EncodingAESKey | production Key | staging Key |
| CorpID | production CorpID | 测试空间 CorpID |
| 回调 URL | 北京 production 域名 | `https://staging-wecom.yudong.shop/wecom/callback` |
| 群聊 | 正式运营群 | **独立测试群** |
| Webhook URL | 正式群 Webhook | 测试群 Webhook |

### 回调 URL 配置

在企业微信后台 → 应用管理 → 测试应用 → 接收消息：

```text
URL: https://staging-wecom.yudong.shop/wecom/callback
Token: <staging_token>
EncodingAESKey: <staging_key>
```

### 验证命令清单

| 命令 | 预期行为 | 验收标准 |
|------|----------|----------|
| `/帮助` | 返回 staging 命令菜单 | 响应正常，菜单与 develop 一致 |
| `/状态` | 返回环境为 `staging` 的状态 | 显示 `env: staging` + commit SHA |
| `/监控` | 不读取 production 数据 | 使用 staging storage 或 mock |
| `/活动` | 使用 staging storage 数据 | 不读取 production doudian 数据 |
| `/风险告警` | 不推送正式告警 | 仅发测试群或静默 |
| (变更命令) | 按 PR 变更范围验证 | 与 PR 描述一致 |

### 响应环境标识

所有 staging 命令响应中应显示：

```text
env: staging
commit: <short_sha>
branch: develop
server: tokyo-staging
```

### 验收标准

- [ ] 测试应用通过企微后台 URL 验证
- [ ] 测试群能正常接收命令响应
- [ ] 所有响应中不包含 production secret
- [ ] 所有日志写入 staging logs 目录
- [ ] production 正式应用回调不受任何影响
- [ ] relay/OpenAI 链路状态不变（`systemctl status sing-box` 正常）
- [ ] production 群的企微消息为零增量

---

## K. 不影响 Relay/OpenAI 链路的约束

staging 部署和运行 **不得** 影响日本服务器上现有的 relay 服务。

### 硬约束清单

| # | 约束 | 验证方式 |
|---|------|----------|
| 1 | 不修改 `sing-box` 配置文件 | `diff /etc/sing-box/config.json` |
| 2 | 不修改 `autossh` 配置或 systemd unit | `systemctl cat autossh` |
| 3 | 不占用 relay 监听端口（50000 等） | `ss -tlnp | grep 50000` |
| 4 | 不在 staging deploy 中重启 relay 服务 | `systemctl status sing-box autossh` |
| 5 | 不新增全局系统代理 | `env | grep -i proxy` |
| 6 | relay 审计只读执行 | 审计脚本无写操作 |

### Staging 访问 OpenAI 的方式

staging 如需调用 OpenAI API：

- ✅ 通过 `.env.staging` 中的 `HTTP_PROXY` 或应用层代理配置
- ✅ 复用现有 socks5 代理 `127.0.0.1:1087`
- ❌ 不新增全局 `ALL_PROXY` 或 `http_proxy` 系统环境变量
- ❌ 不改变 relay 监听端口和协议
- ✅ staging API 调用日志写入 staging logs，不混入 production

### Relay 状态检查（每次 staging deploy 前后）

```bash
# deploy 前记录
systemctl is-active sing-box autossh > /tmp/relay-status-before.txt

# deploy 后对比
systemctl is-active sing-box autossh > /tmp/relay-status-after.txt
diff /tmp/relay-status-before.txt /tmp/relay-status-after.txt
# 预期：无差异（空输出）
```

---

## L. 安全与权限

| 资源 | 权限 | 说明 |
|------|------|------|
| `.env.staging` | `600` | 仅 owner 可读写 |
| `shared/env/` | `700` | 仅 owner 可进入 |
| `shared/logs/` | `750` | owner 读写，group 读 |
| `shared/storage/` | `750` | owner 读写，group 读 |
| `runtime/nginx/` | `644` (conf), `750` (dir) | Nginx 可读 |
| SSH key | `600` | 禁止共享 |

---

## P1 落地清单

### 前置依赖

- [ ] 确认 staging 域名并配置 DNS
- [ ] 申请/配置 staging SSL 证书
- [ ] 在企业微信后台创建独立测试应用

### 服务器搭建

- [ ] 在日本服务器创建 `/opt/wecom-openclaw-staging/` 目录结构
- [ ] `git clone --branch develop <repo>` 到 `repo/`
- [ ] 准备 `.env.staging`（600 权限，不提交）
- [ ] 创建 PM2 ecosystem 配置文件
- [ ] 配置 Nginx staging server block（独立配置文件）
- [ ] 配置独立 logs/storage 目录
- [ ] 配置日志轮转 crontab

### 首次部署

- [ ] 启动 PM2 `wecom-adapter-staging`
- [ ] 验证本机 health check（`127.0.0.1:3101/health`）
- [ ] 验证外部 health check（`staging-wecom.yudong.shop/health`）
- [ ] Nginx config test 通过（`nginx -t`）

### 企微验证

- [ ] 测试应用 URL 验证通过
- [ ] 测试群 `/帮助` 验证通过
- [ ] 测试群 `/状态` 验证通过（显示 `env: staging`）
- [ ] 所有目标命令验证通过
- [ ] 确认 production 群无消息、production logs 无新增
- [ ] 确认 relay 状态不变

### 文档更新

- [ ] 更新 release flow 文档中的实际域名和端口
- [ ] 更新 `production-freeze.md` 中 staging 环境状态为 `ACTIVE`
- [ ] 将首次 staging deploy log 写入 `deploy-log.md`

---

## 版本历史

| 版本 | 日期 | 修改内容 |
|------|------|----------|
| v1.0 | 2026-05-24 | 正式版：完善目录结构、PM2 ecosystem 示例、Nginx 完整配置、日志轮转策略、rollback 触发条件矩阵、发布门禁矩阵、稳定窗口策略、relay 状态检查、安全权限规范、P1 落地清单细化 |
| v0.1 | 2026-05-24 | 初始 staging 架构设计 |
