#!/usr/bin/env bash
# audit-docker.sh - Docker 容器审计（只读，不重启）
# Ubuntu 24.04 / bash 5.x
# 用法: bash scripts/audit/audit-docker.sh

set -euo pipefail

echo "=== Docker Audit Report ==="
echo "Host: $(hostname)"
echo "Date: $(date -Iseconds)"
echo ""

# ─── 1. Docker 是否安装/运行 ─────────
echo "── Docker Status ──"
if ! command -v docker &>/dev/null; then
  echo "  [INFO] Docker not installed — skip"
  echo "=== Docker Audit Done (skipped) ==="
  exit 0
fi

if ! docker info &>/dev/null; then
  echo "  [WARN] Docker installed but daemon not reachable (sudo?)"
  echo "=== Docker Audit Done (partial) ==="
  exit 0
fi

echo "  [OK] Docker daemon reachable"
docker --version

# ─── 2. 运行中的容器 ────────────────────
echo ""
echo "── Running Containers ──"
docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || echo "  [WARN] docker ps failed"

# ─── 3. 退出状态异常的容器 ──────────────
echo ""
echo "── Exited/Failed Containers (last 5) ──"
docker ps -a --filter "status=exited" --format "{{.Names}}\t{{.Image}}\t{{.Status}}" 2>/dev/null | head -5 || echo "  [INFO] none"

# ─── 4. 容器资源使用 ────────────────────
echo ""
echo "── Container Resource Usage ──"
docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}" 2>/dev/null || echo "  [WARN] docker stats failed"

# ─── 5. 磁盘占用 ────────────────────────
echo ""
echo "── Disk Usage (Docker) ──"
docker system df 2>/dev/null || echo "  [WARN] docker system df failed"

# ─── 6. Vault 容器专项检查 ──────────────
echo ""
echo "── Vault Container Check ──"
VAULT_CTR=$(docker ps --filter "name=vault" --format "{{.Names}}" 2>/dev/null | head -1)
if [ -z "$VAULT_CTR" ]; then
  # 尝试查 process
  if pgrep -x "vault" >/dev/null 2>&1; then
    echo "  [INFO] Vault running as process (not Docker)"
    vault status 2>/dev/null || echo "  [WARN] vault status failed"
  else
    echo "  [INFO] Vault not running as Docker container or process"
  fi
else
  echo "  [INFO] Vault container: $VAULT_CTR"
  docker inspect "$VAULT_CTR" --format '{{.State.Status}}' 2>/dev/null
  # 检查端口
  docker port "$VAULT_CTR" 2>/dev/null || echo "  [INFO] port inspect failed"
fi

# ─── 7. 镜像更新检查 ────────────────────
echo ""
echo "── Image Update Check ──"
docker images --format "{{.Repository}}:{{.Tag}}\t{{.CreatedAt}}" 2>/dev/null | head -10 || echo "  [WARN] docker images failed"

echo ""
echo "=== Docker Audit Done ==="
