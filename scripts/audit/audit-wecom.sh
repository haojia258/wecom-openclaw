#!/usr/bin/env bash
# audit-wecom.sh - 企微 Adapter 专项审计（只读）
# Ubuntu 24.04 / bash 5.x
# 用法: bash scripts/audit/audit-wecom.sh [--prod /opt/wecom-openclaw]

set -euo pipefail

WECOM_DIR=${1:-"/opt/wecom-openclaw"}

echo "=== WeCom Adapter Audit Report ==="
echo "Host: $(hostname)"
echo "Date: $(date -Iseconds)"
echo "Dir:  $WECOM_DIR"
echo ""

# ─── 1. 目录存在检查 ────────────────────
echo "── Directory Check ──"
if [ ! -d "$WECOM_DIR" ]; then
  echo "  [FATAL] $WECOM_DIR not found"
  exit 1
fi
echo "  [OK] $WECOM_DIR exists"

# ─── 2. Git 状态 ─────────────────────────
echo ""
echo "── Git Status ──"
cd "$WECOM_DIR" 2>/dev/null || { echo "  [FATAL] cannot cd to $WECOM_DIR"; exit 1; }
BRANCH=$(git branch --show-current 2>/dev/null || echo "?")
COMMIT=$(git log --oneline -1 2>/dev/null || echo "?")
STATUS=$(git status --short 2>/dev/null | wc -l)
echo "  branch:  $BRANCH"
echo "  commit:  $COMMIT"
if [ "$STATUS" -gt 0 ]; then
  echo "  [WARN] working tree has $STATUS modified files"
  git status --short 2>/dev/null | head -5 | sed 's/^/    /'
else
  echo "  [OK] working tree clean"
fi

# ─── 3. PM2 进程状态 ────────────────────
echo ""
echo "── PM2 Process Status ──"
pm2 jlist 2>/dev/null | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    targets = [p for p in data if 'wecom' in p.get('name','').lower() or 'adapter' in p.get('name','').lower()]
    if not targets:
        print('  [WARN] no wecom-adapter process found in PM2')
    for p in targets:
        name   = p.get('name','?')
        status = p.get('pm2_env',{}).get('status','?')
        pid    = p.get('pid','?')
        restarts = p.get('pm2_env',{}).get('restart_time',0)
        print(f'  {name}: status={status} pid={pid} restarts={restarts}')
        if status != 'online':
            print(f'    [ERROR] {name} is NOT online!')
except Exception as e:
    print(f'  [WARN] {e}')
" || echo "  [WARN] PM2 not available or wecom-adapter not registered"

# ─── 4. Health Endpoint ───────────────────
echo ""
echo "── Health Endpoint Check ──"
HEALTH=$(curl -s --max-time 5 http://127.0.0.1:3001/health 2>/dev/null)
if [ -z "$HEALTH" ]; then
  echo "  [ERROR] /health endpoint not responding on port 3001"
else
  echo "  [OK] /health response: $HEALTH"
fi

# ─── 5. .env 文件检查（不打印内容）────────
echo ""
echo "── .env File Check ──"
ENV_FILE="$WECOM_DIR/.env"
if [ ! -f "$ENV_FILE" ]; then
  echo "  [ERROR] .env not found at $ENV_FILE"
else
  echo "  [OK] .env exists"
  # 检查是否有明文密钥（Vault 集成后应该没有）
  if grep -q "WECOM_CORP_ID\|WECOM_SECRET\|WECOM_TOKEN=" "$ENV_FILE" 2>/dev/null; then
    echo "  [INFO] .env contains plaintext WeCom credentials (Vault may or may not be in use)"
  fi
  if grep -q "VAULT_ADDR\|VAULT_ROLE_ID" "$ENV_FILE" 2>/dev/null; then
    echo "  [OK] Vault configuration found in .env"
  else
    echo "  [WARN] Vault configuration NOT found in .env"
  fi
fi

# ─── 6. Vault 连通性 ─────────────────────
echo ""
echo "── Vault Connectivity ──"
VAULT_ADDR=$(grep "VAULT_ADDR" "$ENV_FILE" 2>/dev/null | cut -d= -f2 | tr -d ' ' || echo "http://127.0.0.1:8200")
if [ -z "$VAULT_ADDR" ]; then VAULT_ADDR="http://127.0.0.1:8200"; fi

VAULT_STATUS=$(curl -s --max-time 5 "$VAULT_ADDR/v1/sys/health" 2>/dev/null)
if [ -z "$VAULT_STATUS" ]; then
  echo "  [ERROR] Vault not reachable at $VAULT_ADDR"
else
  echo "  [OK] Vault reachable at $VAULT_ADDR"
  echo "  response: $VAULT_STATUS" | head -c 200
  echo ""
fi

# ─── 7. 日志最近错误 ────────────────────
echo ""
echo "── Recent Errors (last 10 lines) ──"
LOG_DIR="$WECOM_DIR/logs"
if [ ! -d "$LOG_DIR" ]; then
  echo "  [INFO] $LOG_DIR not found"
else
  find "$LOG_DIR" -name "*.log" -mtime -1 2>/dev/null | while read f; do
    errs=$(grep -i "error\|fatal\|exception" "$f" 2>/dev/null | tail -3)
    if [ -n "$errs" ]; then
      echo "  --- $f ---"
      echo "$errs" | sed 's/^/    /'
    fi
  done
fi

# ─── 8. 数据文件新鲜度 ──────────────────
echo ""
echo "── Data File Freshness ──"
check_file() {
  local f="$1"
  if [ ! -f "$f" ]; then
    echo "  [WARN] $f — NOT FOUND"
    return
  fi
  local mtime=$(stat -c %Y "$f" 2>/dev/null || stat -f %m "$f" 2>/dev/null)
  local now=$(date +%s)
  local age=$(( (now - mtime) / 60 ))
  local fname=$(basename "$f")
  if [ "$age" -gt 1440 ]; then
    echo "  [WARN] $fname — ${age}min ago (stale)"
  else
    echo "  [OK] $fname — ${age}min ago"
  fi
}
check_file "$WECOM_DIR/logs/compass_latest.json"
check_file "$WECOM_DIR/logs/doudian/orders_latest.json"
check_file "$WECOM_DIR/logs/doudian/sku-profit_latest.json"
check_file "$WECOM_DIR/logs/doudian/aftersales_latest.json"

echo ""
echo "=== WeCom Adapter Audit Done ==="
