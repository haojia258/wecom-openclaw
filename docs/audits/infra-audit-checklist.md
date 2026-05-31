# Infra Audit Checklist

> 生产基础设施审计清单
> 适用范围：北京生产（49.232.24.120）+ 日本 relay（43.163.229.96）
> 最后更新：2026-05-24

---

## 审计原则

1. **只读**：审计脚本不修改任何配置、不重启任何服务
2. **标准化输出**：每条检查结果带 `[OK]` `[WARN]` `[ERROR]` `[FATAL]` 前缀
3. **可追溯**：审计结果重定向到带时间戳的日志文件
4. **五色健康检查**：绿（正常）/ 蓝（信息）/ 黄（警告）/ 橙（风险）/ 红（严重）

---

## 审计脚本一览

| 脚本 | 目标 | 运行位置 |
|--------|------|----------|
| `scripts/audit/audit-pm2.sh` | PM2 进程健康、内存、重启次数 | 北京生产 |
| `scripts/audit/audit-nginx.sh` | Nginx 配置语法、SSL 证书、端口监听 | 北京生产 |
| `scripts/audit/audit-docker.sh` | Docker 容器状态、资源使用、镜像版本 | 北京生产（可选） |
| `scripts/audit/audit-wecom.sh` | wecom-adapter 专项：Git/PM2/Health/.env/Vault/数据文件 | 北京生产 |
| `scripts/audit/audit-openai-relay.sh` | 日本 relay：sing-box/autossh/隧道/API 连通性 | 本地（SSH 到东京） |

---

## 执行方式

### 单次审计
```bash
# 北京生产
ssh -i WERBUDDY.pem ubuntu@49.232.24.120 \
  "bash -s" < scripts/audit/audit-pm2.sh

# 本地运行（需要 SSH 到东京）
bash scripts/audit/audit-openai-relay.sh tokyo-server
```

### 批量审计（推荐）
```bash
#!/usr/bin/env bash
# scripts/audit/run-all-audits.sh
set -euo pipefail
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
LOG_DIR="logs/audits/$TIMESTAMP"
mkdir -p "$LOG_DIR"

echo "=== Running full infra audit: $TIMESTAMP ==="

ssh -i WERBUDDY.pem ubuntu@49.232.24.120 \
  "bash -s" < scripts/audit/audit-pm2.sh 2>&1 | tee "$LOG_DIR/pm2.log"

ssh -i WERBUDDY.pem ubuntu@49.232.24.120 \
  "bash -s" < scripts/audit/audit-nginx.sh 2>&1 | tee "$LOG_DIR/nginx.log"

ssh -i WERBUDDY.pem ubuntu@49.232.24.120 \
  "bash -s" < scripts/audit/audit-wecom.sh 2>&1 | tee "$LOG_DIR/wecom.log"

bash scripts/audit/audit-openai-relay.sh tokyo-server 2>&1 | tee "$LOG_DIR/relay.log"

echo "=== Audit complete: $LOG_DIR ==="
```

---

## 检查项清单

### PM2 审计（`audit-pm2.sh`）

- [ ] PM2 已安装且版本已知
- [ ] 所有注册进程状态为 `online`
- [ ] 无异常高频重启（重启次数 >5 需警告）
- [ ] 进程内存使用合理（< 500MB/进程）
- [ ] Node.js Heap 使用率 < 90%
- [ ] Event Loop p95 < 10ms
- [ ] 错误日志无 `fatal`/`uncaughtException`
- [ ] 日志文件大小可控（< 100MB/个）

### Nginx 审计（`audit-nginx.sh`）

- [ ] Nginx 进程运行中（systemd 或 pgrep）
- [ ] 配置文件语法正确（`nginx -t` 通过）
- [ ] 监听端口与预期一致（443/80）
- [ ] SSL 证书未过期（剩余 > 30 天）
- [ ] `/wecom/` location 中 `gzip off;`
- [ ] `proxy_pass` 指向正确（http://127.0.0.1:3001）
- [ ] 访问日志无大量 4xx/5xx（最近 50 行）

### Docker 审计（`audit-docker.sh`）

- [ ] Docker daemon 可达
- [ ] 运行中的容器状态健康
- [ ] 无异常退出的容器（exit code ≠ 0）
- [ ] 容器资源使用正常（CPU < 80%，内存 < 80%）
- [ ] 磁盘占用可控（`docker system df`）
- [ ] Vault 容器（如用 Docker 部署）状态正常
- [ ] 镜像无严重 CVE（可选）

### WeCom Adapter 审计（`audit-wecom.sh`）

- [ ] `/opt/wecom-openclaw` 目录存在
- [ ] Git 工作区干净（无未提交修改）
- [ ] 当前分支是 `develop` 或 tag 版本
- [ ] PM2 中 `wecom-adapter` 状态 `online`
- [ ] Health Endpoint `http://127.0.0.1:3001/health` 返回 `{"status":"ok"}`
- [ ] `.env` 文件权限正确（600 或 640）
- [ ] `.env` 中 **无明文** `WECOM_CORP_ID`/`WECOM_SECRET`（Vault 集成后）
- [ ] `.env` 包含 `VAULT_ADDR`/`VAULT_ROLE_ID`
- [ ] Vault 可达（`curl http://127.0.0.1:8200/v1/sys/health`）
- [ ] 数据文件新鲜（< 1440 min = 1 天）

### OpenAI Relay 审计（`audit-openai-relay.sh`）

- [ ] SSH 到东京服务器可达
- [ ] `sing-box` 进程运行中
- [ ] `sing-box` systemd 状态 `active`（如适用）
- [ ] `autossh` 进程运行中
- [ ] `autossh` systemd 状态 `active enabled`
- [ ] 东京侧端口监听正常（Trojan 50000 / HTTP 18080）
- [ ] 本地通过 relay 可访问 `https://api.openai.com/v1/models`
- [ ] 北京 → 东京 SSH 隧道 ESTABLISHED

---

## 审计报告模板

```
=== Infra Audit Report: 2026-05-24 08:35 ===

[OK]   PM2: wecom-adapter online, memory 68MB
[WARN] PM2: ads-worker heap 89.7% (near threshold)
[OK]   Nginx: config syntax valid
[OK]   Nginx: SSL cert expires in 120 days
[ERROR] WeCom: check-activity_latest.json NOT FOUND
[OK]   Vault: reachable at http://127.0.0.1:8200
[OK]   Relay: sing-box running on tokyo-server
[WARN] Relay: autossh not in systemd (manual restart risk)

=== Audit Result: 1 ERROR, 2 WARN, 4 OK ===
```

---

## 审计频率建议

| 类型 | 频率 | 触发条件 |
|------|------|----------|
| 快速审计（PM2 + Health） | 每 6 小时 | 定时 cron |
| 完整审计（全部脚本） | 每日 09:00 | 定时 cron |
| 部署前审计 | 每次 deploy 前 | 手动触发 |
| 事故后审计 | 发生故障后 | 手动触发 |

---

## 后续改进

- [ ] 审计结果自动推送企微（Python 脚本调用 wecom-adapter API）
- [ ] 审计历史存档（S3 / 本地轮转）
- [ ] 自动修复脚本（如重启 autossh）（**慎用，需 review**）
- [ ] 审计 Dashboard（Grafana dashboard）
