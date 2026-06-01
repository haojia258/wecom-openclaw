#!/bin/bash
# OpenClaw Enterprise OS — Server Health Check
# Usage: bash scripts/server-health-check.sh
# Target: 49.232.24.120 /opt/wecom-openclaw

echo "════════════════════════════════════════"
echo "  OpenClaw Enterprise OS Health Check"
echo "  $(date '+%Y-%m-%d %H:%M:%S')"
echo "════════════════════════════════════════"
echo ""

# 1. PM2 Status
echo "[1/6] PM2 Status"
pm2 status 2>/dev/null || echo "  ⚠️  pm2 not found or not running"
echo ""

# 2. Git Status
echo "[2/6] Git Status"
echo "  Branch: $(git branch --show-current 2>/dev/null || echo 'N/A')"
echo "  Recent commits:"
git log --oneline -5 2>/dev/null || echo "  ⚠️  No git repo"
echo ""

# 3. Web Console
echo "[3/6] Web Console"
curl -s -o /dev/null -w "  HTTP %{http_code}" http://localhost:3199/api/status 2>/dev/null
echo ""
curl -s http://localhost:3199/api/status 2>/dev/null | python3 -m json.tool 2>/dev/null | head -5 || echo "  ⚠️  Web Console not responding"
echo ""

# 4. WeCom Callback Logs
echo "[4/6] WeCom Callback Logs"
LOG_DIR="/opt/wecom-openclaw/logs/wecom"
if [ -d "$LOG_DIR" ]; then
  echo "  Lines: $(wc -l $LOG_DIR/callback*.log 2>/dev/null | tail -1)"
  echo "  Recent:"
  tail -3 $LOG_DIR/callback*.log 2>/dev/null || echo "  No callback logs"
else
  echo "  ⚠️  Log dir not found: $LOG_DIR"
fi
echo ""

# 5. P48 Audit Logs
echo "[5/6] P48 Audit Logs"
AUDIT_DIR="/opt/wecom-openclaw/logs/audit/full-audit-gate"
if [ -d "$AUDIT_DIR" ]; then
  for f in "$AUDIT_DIR"/*.jsonl; do
    count=$(wc -l < "$f" 2>/dev/null)
    echo "  $(basename $f): $count entries"
  done
else
  echo "  ⚠️  Audit dir not found: $AUDIT_DIR"
fi
echo ""

# 6. Disk & Memory
echo "[6/6] System Resources"
echo "  Disk: $(df -h /opt/wecom-openclaw 2>/dev/null | tail -1 | awk '{print $5 " used (" $3 "/" $2 ")"}' 2>/dev/null || echo 'N/A')"
echo "  Memory: $(free -h 2>/dev/null | grep Mem | awk '{print $3 "/" $2}' 2>/dev/null || echo 'N/A')"
echo "  Uptime: $(uptime 2>/dev/null | awk '{print $3 " " $4}' | sed 's/,//' 2>/dev/null || echo 'N/A')"
echo ""

echo "────────────────────────────────────────"
echo "  Health Check Complete"
echo "────────────────────────────────────────"
