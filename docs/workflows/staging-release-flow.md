# Staging Release Flow

> 适用于：wecom-openclaw develop → staging → production 发布流程
> 目标：所有企微回调和生产相关修改先经 staging 验证
> 设计日期：2026-05-24
> 版本：v1.0

---

## 核心规则

| # | 规则 | 违反后果 |
|---|------|----------|
| 1 | `develop` 只发布到日本 staging | 直接部署 production 可能引入未验证变更 |
| 2 | `main` 或正式 tag 只发布到北京 production | 混用分支导致版本不一致 |
| 3 | staging 验证通过前，不允许将相关变更发布到 production | 跳过门禁等于放弃安全网 |
| 4 | staging deploy 不允许改动 relay/OpenAI 链路 | relay 中断影响所有环境 |
| 5 | 企业微信回调变更必须通过测试应用验证 | 未验证的回调可能导致正式应用不可用 |

---

## 分支流

```text
feature/*
    │
    ├── 开发 + 本地测试
    │
    ▼
  Pull Request ──→ Code Review
    │                 │
    │                 ├── WorkBuddy review（工程变更）
    │                 └── Codex review（AI 模块变更）
    │
    ▼
  develop（合并）
    │
    ▼
  Staging Deploy ──→ 日本服务器
    │                 /opt/wecom-openclaw-staging/
    │
    ▼
  Staging Verify ──→ 企微测试应用
    │                 ├── URL 验证
    │                 ├── 命令 smoke test
    │                 └── 稳定观察窗口
    │
    ├── PASS ──→ 继续
    │
    └── FAIL ──→ Rollback + 修复 + 重新部署
    │
    ▼
  Pull Request ──→ develop → main
    │                 │
    │                 └── 附 staging 验证记录
    │
    ▼
  main（合并 + tag）
    │
    ▼
  Production Deploy ──→ 北京服务器
    │                    /opt/wecom-openclaw/
    │
    ▼
  Production Verify ──→ 正式企微应用
                         ├── /帮助
                         ├── /状态
                         └── 变更命令
```

---

## 环境职责

| 环境 | 分支 | 服务器 | IP | 端口 | 目标 |
|------|------|--------|----|------|------|
| **local** | `feature/*` | 开发机 | — | — | 单元测试、静态检查、本地调试 |
| **staging** | `develop` | 日本 | 43.163.229.96 | `3101` | 企微测试应用验证、集成测试 |
| **production** | `main` / tag | 北京 | 49.232.24.120 | `3001` | 正式企业微信服务 |

---

## 角色职责

| 角色 | 负责人 | 允许操作 | 禁止操作 |
|------|--------|----------|----------|
| **Human** | 郝忠亮 | 审批、密钥管理、生产发布 | 跳过 staging 验证发布企微回调 |
| **WorkBuddy** | AI | staging deploy、审计、rollback、文档更新 | 绕过 PR 直接合并 main |
| **Codex** | AI | 文档设计、代码 patch、PR 审查 | 直接 deploy 服务器、修改 production 配置 |

---

## Staging Deploy Checklist

### 部署前

- [ ] PR 已合并到 `develop`
- [ ] `develop` 工作区干净（`git status` 无变更）
- [ ] commit hash 已记录
- [ ] 变更范围已确认（files changed、新增/修改/删除）
- [ ] `.env.staging` 已存在且权限 `600`、未提交
- [ ] 不涉及 relay 配置修改（`sing-box` / `autossh`）
- [ ] 不涉及 production `.env`
- [ ] 不涉及北京服务器路径
- [ ] relay 状态已记录（`systemctl is-active sing-box autossh`）

### 部署中

- [ ] SSH 到日本服务器
- [ ] `cd /opt/wecom-openclaw-staging/repo`
- [ ] `git fetch origin develop && git checkout develop && git pull --ff-only origin develop`
- [ ] `npm install --production`（或复用 lockfile 安装）
- [ ] 确认 `.env.staging` 正常加载
- [ ] `pm2 reload wecom-adapter-staging --update-env`
- [ ] `sleep 3 && curl -s http://127.0.0.1:3101/health`（预期 `{"status":"ok"}`）
- [ ] `curl -s https://staging-wecom.yudong.shop/health`（外部可达）
- [ ] `nginx -t`（配置检查通过）

### 部署后

- [ ] `/帮助` 响应正常，菜单与 develop 一致
- [ ] `/状态` 显示 `env: staging` + commit SHA
- [ ] `/监控` 不读取 production 数据
- [ ] `/活动` 使用 staging storage 或 mock 数据
- [ ] `/风险告警` 不推送正式群
- [ ] 变更命令验证通过
- [ ] staging logs 无 `fatal` / `uncaughtException`
- [ ] relay 状态与部署前一致
- [ ] deploy log 已写入（`shared/logs/deploy/deploy-log.md`）

---

## 企业微信 Staging 验证

### 测试应用独立配置

staging 必须使用独立测试应用，**任何情况下不复用 production 应用**。

```text
Callback URL:  https://staging-wecom.yudong.shop/wecom/callback
Token:         <staging_token>
EncodingAESKey: <staging_key>
AgentID:       <staging_agent_id>
CorpID:        <staging_corp_id>
```

### 验证步骤

```text
 1. 在企业微信后台 → 测试应用 → 接收消息，配置 staging callback URL
 2. 点击「保存」触发 URL 验证
 3. 查看 staging logs 确认收到验证请求
 4. URL 验证通过（企微后台显示「验证通过」）
 5. 将测试应用添加到测试群
 6. 在测试群发送 /帮助
 7. 在测试群发送 /状态
 8. 在测试群发送本次 PR 影响的命令
 9. 在测试群发送 /监控（验证不读 production 数据）
10. 查看 staging logs 确认所有请求被正确处理
11. 确认 production 群无消息
12. 确认 production logs 无新增
```

### 验证记录模板

```markdown
## Staging Verify - <short_sha>

- **Commit**: `<full_sha>`
- **Branch**: `develop`
- **Domain**: `staging-wecom.yudong.shop`
- **Health (local)**: `PASS / FAIL` — `http://127.0.0.1:3101/health`
- **Health (external)**: `PASS / FAIL` — `https://staging-wecom.yudong.shop/health`
- **WeCom URL Verify**: `PASS / FAIL`
- **/帮助**: `PASS / FAIL`
- **/状态**: `PASS / FAIL` (env: staging)
- **/监控**: `PASS / FAIL` (no production data)
- **/活动**: `PASS / FAIL`
- **变更命令**: `<command>` — `PASS / FAIL`
- **Production Impact**: `NONE / ISSUE` — `<说明>`
- **Relay Status**: `UNCHANGED / CHANGED`
- **Verified by**: `<Human / WorkBuddy>`
- **Verified at**: `<ISO 8601 timestamp>`
- **Notes**: `<补充说明>`
```

---

## 门禁（Gates）

### Develop → Staging Gate

进入 staging 部署前必须满足：

| Gate | 要求 | 验证方式 |
|------|------|----------|
| **Code Review** | PR 至少 1 个 approval | GitHub PR review |
| **Tests** | 与变更相关的测试全部通过 | `npm run test:skills` / `test:commands` |
| **Scope** | 变更范围已确认，无未声明风险 | PR 描述完整 |
| **Env** | 不需要 production secret | 变更不依赖 production 密钥 |
| **Rollback** | 有明确回滚 commit | 记录在 deploy log 中 |
| **Relay** | 变更不涉及 relay 配置 | diff 确认无 relay 文件 |

未满足 gate 时：
1. **不部署 staging**
2. 在 PR 中标记阻塞原因
3. 修复后重新提交 review

### Staging → Production Gate

进入 production 部署前必须满足：

| Gate | 要求 | 验证方式 |
|------|------|----------|
| **Staging Health** | `PASS` | health check + 企微命令 |
| **WeCom Callback** | 测试应用 URL 验证通过 | 企微后台显示 |
| **Command Smoke** | `/帮助` `/状态` + 变更命令全 PASS | 测试群验证 |
| **Logs** | 无 `fatal` / `uncaughtException` | staging logs 审计 |
| **Data Isolation** | 未读写 production storage | staging logs 审计 |
| **Relay Status** | 与部署前一致 | relay 状态对比 |
| **Stability** | 满足稳定窗口或人工批准 | 计时或 Human 确认 |
| **Approval** | Human 或指定 reviewer 批准 | PR approval |

### 稳定窗口策略

| 变更类型 | staging 最短稳定时间 | 可加速条件 |
|----------|---------------------|------------|
| **docs only** | 即时（跳过 staging） | 不需要 staging deploy |
| **audit scripts** | 即时或人工批准 | 不影响运行时 |
| **command routing** | 2 小时 | 需至少 1 次企微验证通过 |
| **PM2 / deploy 流程** | 4 小时 | 需至少 1 次完整 deploy 通过 |
| **Nginx 配置** | 4 小时 | 需 `nginx -t` + health check 通过 |
| **webhook crypto** | 24 小时 | 不可加速（高风险） |
| **env / vault / auth** | 24 小时 | 不可加速（高风险） |
| **新功能模块** | 24 小时 | 需全命令 smoke test 通过 |

---

## Production Deploy Flow

production 只从 `main` 或正式 tag 发布。

### 前置条件

- [ ] staging verify 记录为 `PASS`
- [ ] 稳定窗口已满足或 Human 批准加速
- [ ] staging 验证记录已附在 develop → main PR 中

### 流程

```text
 1. 确认 staging verify PASS + 稳定窗口满足
 2. 创建 develop → main Pull Request
 3. PR 描述附带 staging 验证记录（完整模板）
 4. Code Review 通过
 5. Human 批准合并
 6. Merge main（创建 merge commit，不打 fast-forward）
 7. Git tag（如 v1.1.0）
 8. Push main + tag 到 origin
 9. SSH 到北京服务器
10. cd /opt/wecom-openclaw
11. git fetch origin main && git checkout main && git pull --ff-only origin main
12. 执行 Production Deploy Checklist（见 production-freeze.md）
13. pm2 reload wecom-adapter --update-env
14. 验证正式企业微信应用
15. 写入 production deploy log
```

### Production 发布后验证

- [ ] `/health` 通过（`http://127.0.0.1:3001/health`）
- [ ] 正式企微 `/帮助` 通过
- [ ] 正式企微 `/状态` 通过
- [ ] 本次变更命令通过
- [ ] production logs 无新增 `fatal`
- [ ] staging 仍可独立运行（日本服务器不受影响）
- [ ] relay 链路正常

---

## Rollback Flow

### Staging Rollback

**触发条件**：

| 条件 | 操作 |
|------|------|
| staging health check 失败 | **立即 rollback** |
| 企微测试应用 URL 验证失败 | **立即 rollback** |
| staging logs 出现 `fatal` / `uncaughtException` | **立即 rollback** |
| 发现可能影响 production 的配置风险 | **立即 rollback** |
| 测试群命令响应异常 | 评估后 rollback |

**流程**：

```text
 1. 记录 bad commit: git log --oneline -1
 2. 确定回滚目标: git log --oneline -5（上一个 verified commit）
 3. git checkout <previous_verified_commit>
 4. pm2 reload wecom-adapter-staging --update-env
 5. sleep 2 && curl -s http://127.0.0.1:3101/health
 6. curl -s https://staging-wecom.yudong.shop/health
 7. 写 staging rollback log
 8. 在 PR 中标记「Staging FAILED」并附 rollback 记录
```

### Production Rollback

生产 rollback 仍执行 `docs/workflows/production-freeze.md` 规则 5 中的流程。

**staging rollback ≠ production rollback。** 两者独立，互不影响。

---

## 不影响 Relay/OpenAI 链路的约束

### 硬约束

| # | 约束 | 验证命令 |
|---|------|----------|
| 1 | 不修改 `sing-box` 配置 | `md5sum /etc/sing-box/config.json` |
| 2 | 不修改 `autossh` 配置 | `systemctl cat autossh` |
| 3 | 不占用 relay 端口（50000） | `ss -tlnp \| grep 50000` |
| 4 | 不在 deploy 中重启 relay 服务 | `systemctl status sing-box autossh` |
| 5 | 不新增全局系统代理 | `env \| grep -i proxy` |
| 6 | relay 审计只读执行 | 审计脚本 `grep -r 'rm\|mv\|sed' scripts/audit/` |

### Staging 访问 OpenAI 策略

- ✅ 通过 `.env.staging` 中的应用层代理配置
- ✅ 复用现有 SOCKS5 代理 `127.0.0.1:1087`
- ❌ 不新增 `ALL_PROXY` 系统环境变量
- ❌ 不改变 relay 监听端口和协议
- ✅ staging API 调用日志写入 staging logs

### Relay 状态检查脚本

```bash
#!/bin/bash
# 每次 staging deploy 前后执行
echo "=== Relay Status Before ==="
systemctl is-active sing-box autossh
md5sum /etc/sing-box/config.json

# ... staging deploy ...

echo "=== Relay Status After ==="
systemctl is-active sing-box autossh
md5sum /etc/sing-box/config.json
```

---

## 发布记录模板

### Staging Deploy Log

```markdown
## [YYYY-MM-DD HH:mm] Staging Deploy

- **Commit**: `<full_sha>`
- **Branch**: `develop`
- **Changed Files**: `<summary or count>`
- **Env**: `staging`
- **Server**: Japan (43.163.229.96)
- **PM2 Process**: `wecom-adapter-staging`
- **Health (local)**: `PASS / FAIL`
- **Health (external)**: `PASS / FAIL`
- **WeCom Test App**: `PASS / FAIL`
- **Commands Verified**: `/帮助` `/状态` `<changed commands>`
- **Rollback Commit**: `<previous_verified_commit>`
- **Relay Status**: `UNCHANGED`
- **Operator**: `<Human / WorkBuddy>`
- **Notes**: `<补充说明>`
```

### Production Deploy Log

参见 `docs/workflows/production-freeze.md` 规则 4 中的模板。

---

## P1 验收标准

staging 环境搭建完成后，需逐项验收：

### 基础设施

- [ ] 日本服务器存在 `/opt/wecom-openclaw-staging/` 独立目录
- [ ] staging 域名 DNS 解析到日本服务器（43.163.229.96）
- [ ] SSL 证书配置正确（Let's Encrypt 或手动）
- [ ] staging Nginx 配置只代理到 `127.0.0.1:3101`
- [ ] `nginx -t` 通过

### 进程管理

- [ ] PM2 中存在 `wecom-adapter-staging`，状态 `online`
- [ ] PM2 中存在 `ads-worker-staging`（如需要），状态 `online`
- [ ] 进程重启后自动恢复（`pm2 save` + `pm2 startup`）

### 环境变量

- [ ] `.env.staging` 与 production `.env` **完全独立**（无共享密钥）
- [ ] `NODE_ENV=staging`、`APP_ENV=staging`、`PORT=3101`
- [ ] 企微密钥为测试应用专用

### 企微验证

- [ ] 测试应用 URL 验证通过（企微后台显示）
- [ ] 测试群 `/帮助` smoke test 通过
- [ ] 测试群 `/状态` 显示 `env: staging`
- [ ] 变更相关命令验证通过

### 隔离确认

- [ ] production 北京服务器不受任何影响
- [ ] production 正式群无 staging 消息
- [ ] relay/OpenAI 链路不受影响
- [ ] `sing-box` / `autossh` 状态不变

---

## 版本历史

| 版本 | 日期 | 修改内容 |
|------|------|----------|
| v1.0 | 2026-05-24 | 正式版：完善分支流图、deploy checklist 细化、gate 矩阵、稳定窗口策略、verification 记录模板、rollback 触发条件、relay 状态检查脚本、P1 验收标准细化 |
| v0.1 | 2026-05-24 | 初始 staging release flow |
