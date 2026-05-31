#!/usr/bin/env bash
# shadow-safe-cleanup.sh - Shadow 安全清理脚本
# 生产防护：清理 shadow 进程，确认生产 3001 不受影响
# 用法: bash scripts/shadow-safe-cleanup.sh <shadow-port> <shadow-name> [--force]
# 示例: bash scripts/shadow-safe-cleanup.sh 39013 wecom-passive-monitor-shadow
set -euo pipefail

SHADOW_PORT="${1:-}"
SHADOW_NAME="${2:-}"
FORCE="n"
if [ "${3:-}" = "--force" ]; then
  FORCE="y"
fi

# ─── 参数检查 ──────────────────────────────────
if [ -z "$SHADOW_NAME" ] || [ -z "$SHADOW_PORT" ]; then
  echo "[FATAL] 缺少参数"
  echo "用法: bash scripts/shadow-safe-cleanup.sh <shadow-port> <shadow-name> [--force]"
  exit 1
fi

# ─── 红线: 禁止操作生产端口 ─────────────────────
if [ "$SHADOW_PORT" = "3001" ]; then
  echo "[FATAL] 红线拒绝: 不能对生产端口 3001 执行清理"
  exit 1
fi

echo "=== Shadow Safe Cleanup ==="
echo "  Name: ${SHADOW_NAME}"
echo "  Port: ${SHADOW_PORT}"
echo "  Force: ${FORCE}"
echo ""

# ─── 1. pm2 delete shadow ──────────────────────
echo "[INFO] 1/5 删除 PM2 shadow 进程: ${SHADOW_NAME}..."
pm2 delete "${SHADOW_NAME}" 2>/dev/null && echo "[OK] PM2 进程已删除" || echo "[WARN] PM2 中未找到 ${SHADOW_NAME}（可能已停止）"

# ─── 2. 确认 shadow port 已释放 ───────────────
echo ""
echo "[INFO] 2/5 确认 shadow 端口 ${SHADOW_PORT} 已释放..."
sleep 1

PORT_OCCUPIED=""
if command -v ss &>/dev/null; then
  PORT_OCCUPIED=$(ss -lntp | grep ":${SHADOW_PORT} " || true)
else
  PORT_OCCUPIED=$(sudo lsof -i :"${SHADOW_PORT}" 2>/dev/null || true)
fi

if [ -n "$PORT_OCCUPIED" ]; then
  echo "[WARN] 端口 ${SHADOW_PORT} 仍被占用:"
  echo "$PORT_OCCUPIED"
  echo ""
  echo "占用进程信息:"
  sudo lsof -i :"${SHADOW_PORT}" 2>/dev/null || true
  echo ""
  if [ "$FORCE" = "y" ]; then
    echo "[WARN] --force 模式: 自动 kill 残留进程..."
    PIDS=$(sudo lsof -ti :"${SHADOW_PORT}" 2>/dev/null || true)
    for pid in $PIDS; do
      echo "  Killing PID ${pid}..."
      sudo kill -9 "$pid" 2>/dev/null || true
    done
    sleep 1
    echo "[OK] 残留进程已清理"
  else
    echo "[INFO] 不自动 kill。如需强制清理，传入 --force 参数:"
    echo "  bash scripts/shadow-safe-cleanup.sh ${SHADOW_PORT} ${SHADOW_NAME} --force"
  fi
else
  echo "[OK] 端口 ${SHADOW_PORT} 已释放"
fi

# ─── 3. 确认 3001 仍 online ───────────────────
echo ""
echo "[INFO] 3/5 确认生产 3001 仍 online..."
PROD_HEALTH=$(curl -s --max-time 3 http://127.0.0.1:3001/health 2>/dev/null || true)
if [ -z "$PROD_HEALTH" ]; then
  echo "[ERROR] 生产 3001/health 无响应！"
  echo ""
  echo "紧急修复:"
  echo "  pm2 status wecom-adapter"
  echo "  pm2 restart wecom-adapter --update-env"
  echo "  sudo lsof -i :3001"
  exit 1
fi
echo "[OK] 生产 3001 health: ${PROD_HEALTH}"

# ─── 4. 检查是否有残留进程 ─────────────────────
echo ""
echo "[INFO] 4/5 检查端口 ${SHADOW_PORT} 残留进程..."
RESIDUAL_PIDS=$(sudo lsof -ti :"${SHADOW_PORT}" 2>/dev/null || true)
if [ -n "$RESIDUAL_PIDS" ]; then
  echo "[WARN] 发现残留进程:"
  sudo lsof -i :"${SHADOW_PORT}" 2>/dev/null || true
  echo ""
  echo "PID 列表: ${RESIDUAL_PIDS}"
  echo "用户: $(sudo ps -p ${RESIDUAL_PIDS} -o user= 2>/dev/null || echo 'unknown')"
else
  echo "[OK] 无残留进程"
fi

# ─── 5. 确认 PM2 中无 shadow 残留 ─────────────
echo ""
echo "[INFO] 5/5 确认 PM2 中无 ${SHADOW_NAME} 残留..."
PM2_RESIDUAL=$(pm2 list | grep "${SHADOW_NAME}" || true)
if [ -n "$PM2_RESIDUAL" ]; then
  echo "[WARN] PM2 中仍有 ${SHADOW_NAME} 记录:"
  echo "$PM2_RESIDUAL"
  echo ""
  echo "清理命令: pm2 delete ${SHADOW_NAME}"
else
  echo "[OK] PM2 中无 ${SHADOW_NAME} 残留"
fi

# ─── 最终状态 ──────────────────────────────────
echo ""
echo "=== Shadow 清理完成 ==="
echo "  清理对象:   ${SHADOW_NAME}:${SHADOW_PORT}"
echo "  生产 3001:   ${PROD_HEALTH}"
echo "  残留进程:    ${RESIDUAL_PIDS:-none}"
echo "  PM2 残留:   ${PM2_RESIDUAL:-none}"
echo ""
echo "查看 PM2 状态: pm2 status"
echo "查看生产日志: pm2 logs wecom-adapter --lines 30"
