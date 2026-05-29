#!/usr/bin/env bash
# shadow-safe-start.sh - Shadow 安全启动脚本
# 生产防护：防止 shadow 或 root PM2 抢占生产 3001 端口
# 用法: bash scripts/shadow-safe-start.sh <shadow-port> <shadow-name>
# 示例: bash scripts/shadow-safe-start.sh 39013 wecom-passive-monitor-shadow
set -euo pipefail

SHADOW_PORT="${1:-}"
SHADOW_NAME="${2:-}"

# ─── 参数检查 ──────────────────────────────────
if [ -z "$SHADOW_PORT" ]; then
  echo "[FATAL] 必须显式传入 shadow port"
  echo "用法: bash scripts/shadow-safe-start.sh <shadow-port> <shadow-name>"
  echo "示例: bash scripts/shadow-safe-start.sh 39013 wecom-passive-monitor-shadow"
  exit 1
fi

if [ -z "$SHADOW_NAME" ]; then
  echo "[FATAL] 必须传入 shadow name"
  echo "用法: bash scripts/shadow-safe-start.sh <shadow-port> <shadow-name>"
  exit 1
fi

# ─── 红线 1: 禁止 port=3001 ─────────────────
if [ "$SHADOW_PORT" = "3001" ]; then
  echo "[FATAL] 红线拒绝: shadow port 不能是生产端口 3001"
  exit 1
fi

# ─── 红线 2: 检查 WECOM_ADAPTER_PORT 环境变量 ──
if [ -z "${WECOM_ADAPTER_PORT:-}" ]; then
  echo "[FATAL] 红线拒绝: WECOM_ADAPTER_PORT 为空，必须显式设置端口"
  echo "修复: WECOM_ADAPTER_PORT=${SHADOW_PORT} bash scripts/shadow-safe-start.sh ${SHADOW_PORT} ${SHADOW_NAME}"
  exit 1
fi

if [ "$WECOM_ADAPTER_PORT" = "3001" ]; then
  echo "[FATAL] 红线拒绝: WECOM_ADAPTER_PORT=3001，会抢占生产端口"
  exit 1
fi

if [ "$WECOM_ADAPTER_PORT" != "$SHADOW_PORT" ]; then
  echo "[FATAL] 红线拒绝: WECOM_ADAPTER_PORT=${WECOM_ADAPTER_PORT} 与 shadow port=${SHADOW_PORT} 不一致"
  exit 1
fi

# ─── 红线 3: 检查端口是否被占用 ──────────────
echo "[INFO] 检查端口 ${SHADOW_PORT} 是否已被占用..."
if command -v ss &>/dev/null; then
  PORT_CHECK=$(ss -lntp | grep ":${SHADOW_PORT} " || true)
else
  PORT_CHECK=$(sudo lsof -i :"${SHADOW_PORT}" 2>/dev/null || true)
fi

if [ -n "$PORT_CHECK" ]; then
  echo "[FATAL] 端口 ${SHADOW_PORT} 已被占用:"
  echo "$PORT_CHECK"
  echo ""
  echo "修复命令:"
  echo "  sudo lsof -i :${SHADOW_PORT}          # 找出占用进程"
  echo "  sudo kill -9 <PID>                     # 杀死残留进程"
  echo "  ss -lntp | grep :${SHADOW_PORT}        # 确认端口释放"
  exit 1
fi
echo "[OK] 端口 ${SHADOW_PORT} 未被占用"

# ─── 红线 4: 检查 root PM2 是否运行 wecom-adapter ─
echo "[INFO] 检查 root PM2 是否有 wecom-adapter..."
ROOT_PM2=$(sudo PM2_HOME=/root/.pm2 pm2 list 2>/dev/null || true)
if echo "$ROOT_PM2" | grep -q "wecom-adapter"; then
  echo "[FATAL] root PM2 实例正在运行 wecom-adapter，会抢占 3001 端口！"
  echo ""
  echo "root PM2 状态:"
  echo "$ROOT_PM2" | grep -A1 "wecom-adapter" || true
  echo ""
  echo "修复命令（在服务器上执行）:"
  echo "  sudo pm2 delete wecom-adapter"
  echo "  sudo pm2 save --force"
  echo "  ss -lntp | grep ':3001 '"
  echo "  sudo lsof -i :3001"
  exit 1
fi
echo "[OK] root PM2 无 wecom-adapter"

# ─── 检查 3001 生产端口是否可用 ─────────────
echo "[INFO] 确认生产 3001 端口响应正常..."
PROD_HEALTH=$(curl -s --max-time 3 http://127.0.0.1:3001/health 2>/dev/null || true)
if [ -z "$PROD_HEALTH" ]; then
  echo "[WARN] 生产 3001/health 无响应，请确认 wecom-adapter 已启动"
else
  echo "[OK] 生产 3001 health: ${PROD_HEALTH}"
fi

# ─── 使用 ubuntu PM2 启动 shadow ──────────────
echo "[INFO] 启动 shadow: ${SHADOW_NAME} on port ${SHADOW_PORT}..."
pm2 start apps/wecom-adapter/src/index.js \
  --name "${SHADOW_NAME}" \
  --update-env \
  -- \
  --port "${SHADOW_PORT}"

# 等待启动
sleep 3

# ─── 启动后验证 ──────────────────────────────
echo "[INFO] 验证 shadow health (port ${SHADOW_PORT})..."
SHADOW_HEALTH=$(curl -s --max-time 5 http://127.0.0.1:"${SHADOW_PORT}"/health 2>/dev/null || true)
if [ -z "$SHADOW_HEALTH" ]; then
  echo "[ERROR] shadow ${SHADOW_PORT}/health 无响应"
  echo "查看日志: pm2 logs ${SHADOW_NAME} --lines 30"
  exit 1
fi
echo "[OK] shadow health: ${SHADOW_HEALTH}"

# ─── 确认 3001 仍由生产 wecom-adapter 响应 ───
echo "[INFO] 确认 3001 仍由生产 wecom-adapter 响应..."
PROD_HEALTH_AFTER=$(curl -s --max-time 3 http://127.0.0.1:3001/health 2>/dev/null || true)
if [ -z "$PROD_HEALTH_AFTER" ]; then
  echo "[ERROR] 生产 3001/health 无响应！shadow 可能抢占了 3001"
  echo "紧急修复:"
  echo "  pm2 delete ${SHADOW_NAME}"
  echo "  sudo lsof -i :3001"
  echo "  pm2 restart wecom-adapter --update-env"
  exit 1
fi
echo "[OK] 生产 3001 仍正常: ${PROD_HEALTH_AFTER}"

# ─── 最终状态 ──────────────────────────────────
echo ""
echo "=== Shadow 启动成功 ==="
echo "  Name:       ${SHADOW_NAME}"
echo "  Port:       ${SHADOW_PORT}"
echo "  Health:     ${SHADOW_HEALTH}"
echo "  Production: 3001 OK (${PROD_HEALTH_AFTER})"
echo ""
echo "查看日志: pm2 logs ${SHADOW_NAME} --lines 50"
echo "停止 shadow: bash scripts/shadow-safe-cleanup.sh ${SHADOW_NAME} ${SHADOW_PORT}"
