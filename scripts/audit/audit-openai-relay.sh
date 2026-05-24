#!/usr/bin/env bash
# audit-openai-relay.sh - 日本 relay（sing-box + autossh）审计（只读）
# Ubuntu 24.04 / bash 5.x
# 用法: bash scripts/audit/audit-openai-relay.sh [tokyo-server]
# 依赖: ~/.ssh/config 中配置 tokyo-server

set -euo pipefail

TOKYO=${1:-"tokyo-server"}

echo "=== OpenAI Relay Audit Report ==="
echo "Date: $(date -Iseconds)"
echo ""

# ─── 1. SSH 连通性 ───────────────────────
echo "── SSH Connectivity (tokyo-server) ──"
if ! ssh -q -o ConnectTimeout=5 -o BatchMode=yes "$TOKYO" exit 2>/dev/null; then
  echo "  [ERROR] Cannot SSH to $TOKYO (check ~/.ssh/config)"
  echo "=== Relay Audit Aborted ==="
  exit 1
fi
echo "  [OK] SSH to $TOKYO successful"

TOKYO_HOST=$(ssh -q "$TOKYO" "hostname && echo '---' && cat /etc/os-release | grep PRETTY_NAME" 2>/dev/null)
echo "  Remote: $TOKYO_HOST"

# ─── 2. sing-box 状态 ────────────────────
echo ""
echo "── sing-box Status ──"
SB_VER=$(ssh -q "$TOKYO" "sing-box version 2>/dev/null | head -1" || echo "[not found]")
echo "  Version: $SB_VER"

SB_RUNNING=$(ssh -q "$TOKYO" "pgrep -x sing-box >/dev/null 2>&1 && echo 'running' || echo 'NOT running'")
if [ "$SB_RUNNING" = "running" ]; then
  echo "  [OK] sing-box process: running"
else
  echo "  [ERROR] sing-box process: NOT running"
fi

# systemd 状态
ssh -q "$TOKYO" "systemctl is-active sing-box 2>/dev/null && echo '  [OK] sing-box systemd: active' || echo '  [INFO] sing-box not in systemd (may be manually run)'"

# ─── 3. autossh 状态 ─────────────────────
echo ""
echo "── autossh Status ──"
AS_RUNNING=$(ssh -q "$TOKYO" "pgrep -x autossh >/dev/null 2>&1 && echo 'running' || echo 'NOT running'")
if [ "$AS_RUNNING" = "running" ]; then
  echo "  [OK] autossh process: running"
else
  echo "  [WARN] autossh process: NOT running (tunnel may be down)"
fi

ssh -q "$TOKYO" "systemctl is-active autossh 2>/dev/null && echo '  [OK] autossh systemd: active' || echo '  [INFO] autossh not in systemd'"

# ─── 4. 端口监听（东京侧）────────────────
echo ""
echo "── Tokyo Port Listening ──"
ssh -q "$TOKYO" "ss -tlnp 2>/dev/null | grep -E '1080|1087|50000|18080' || echo '  [INFO] no relay-related ports found in ss output'"

# ─── 5. 本地连通性测试（通过 relay）─────
echo ""
echo "── Relay Connectivity Test ──"
SOCKS5_PROXY="socks5://127.0.0.1:1087"
HTTP_PROXY="http://127.0.0.1:18080"

if curl -s --max-time 5 -x "$SOCKS5_PROXY" "https://api.openai.com/v1/models" -H "Authorization: Bearer test" 2>&1 | grep -q "invalid_api_key\|Incorrect API key"; then
  echo "  [OK] OpenAI API reachable via SOCKS5 relay ($SOCKS5_PROXY)"
else
  echo "  [WARN] OpenAI API not reachable via SOCKS5 relay ($SOCKS5_PROXY), or returned a different error"
fi

if curl -s --max-time 5 -x "$HTTP_PROXY" "https://api.openai.com/v1/models" -H "Authorization: Bearer test" 2>&1 | grep -q "invalid_api_key\|Incorrect API key"; then
  echo "  [OK] OpenAI API reachable via HTTP proxy ($HTTP_PROXY)"
else
  echo "  [WARN] OpenAI API not reachable via HTTP proxy ($HTTP_PROXY), or returned a different error"
fi

# ─── 6. 北京 → 东京 隧道状态 ──────────
echo ""
echo "── Tunnel Status (Beijing → Tokyo) ──"
# 检查本地是否有到东京的 SSH 隧道
TOKYO_IP=$(ssh -q -G "$TOKYO" 2>/dev/null | grep "^hostname " | awk '{print $2}' || echo "43.163.229.96")
if netstat -an 2>/dev/null | grep -q "$TOKYO_IP.*ESTABLISHED"; then
  echo "  [OK] SSH tunnel to $TOKYO_IP: ESTABLISHED"
else
  echo "  [INFO] No active SSH tunnel found from this host (may be in other session)"
fi

# ─── 7. sing-box 配置检查 ─────────────────
echo ""
echo "── sing-box Config Check ──"
SB_CONF=$(ssh -q "$TOKYO" "ls /etc/sing-box/config.json /root/sing-box/config.json 2>/dev/null | head -1")
if [ -z "$SB_CONF" ]; then
  echo "  [WARN] sing-box config not found in standard paths"
else
  echo "  [INFO] Config: $SB_CONF"
  # 检查 Trojan 端口
  ssh -q "$TOKYO" "grep -o 'port.*[0-9]\\+' '$SB_CONF' 2>/dev/null | head -3" || true
fi

echo ""
echo "=== OpenAI Relay Audit Done ==="
echo ""
echo "📋 Manual follow-up:"
echo "  1. Verify autossh systemd is enabled (for reboot persistence)"
echo "  2. Test SOCKS5: curl -x socks5://127.0.0.1:1087 https://api.openai.com/v1/models -H 'Authorization: Bearer sk-...'"
echo "  3. Test HTTP proxy: curl -x http://127.0.0.1:18080 https://api.openai.com/v1/models -H 'Authorization: Bearer sk-...'"
echo "  4. Check sing-box logs: journalctl -u sing-box -n 50"
