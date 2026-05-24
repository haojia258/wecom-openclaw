#!/usr/bin/env bash
# audit-nginx.sh - Nginx 配置与状态审计（只读）
# Ubuntu 24.04 / bash 5.x
# 用法: bash scripts/audit/audit-nginx.sh

set -euo pipefail

echo "=== Nginx Audit Report ==="
echo "Host: $(hostname)"
echo "Date: $(date -Iseconds)"
echo ""

# ─── 1. Nginx 是否运行 ─────────────────
echo "── Process Check ──"
if systemctl is-active --quiet nginx 2>/dev/null; then
  echo "  [OK] Nginx systemd service: active"
elif pgrep -x "nginx" >/dev/null; then
  echo "  [OK] Nginx process: running"
else
  echo "  [FATAL] Nginx is NOT running"
fi

# ─── 2. 版本 ─────────────────────────────
echo ""
echo "── Version ──"
nginx -v 2>&1 || echo "  [WARN] nginx not in PATH"

# ─── 3. 配置文件语法 ────────────────────
echo ""
echo "── Config Syntax Check ──"
if nginx -t 2>&1; then
  echo "  [OK] nginx config syntax valid"
else
  echo "  [ERROR] nginx config syntax INVALID"
fi

# ─── 4. 监听端口 ────────────────────────
echo ""
echo "── Listening Ports ──"
ss -tlnp 2>/dev/null | grep nginx || netstat -tlnp 2>/dev/null | grep nginx || echo "  [WARN] ss/netstat not available"

# ─── 5. SSL 证书过期检查 ───────────────
echo ""
echo "── SSL Cert Expiry Check ──"
SSL_CERTS=$(grep -r "ssl_certificate" /etc/nginx/ 2>/dev/null | grep -v "#" | awk '{print $2}' | tr -d ';' | sort -u)
if [ -z "$SSL_CERTS" ]; then
  echo "  [INFO] No SSL certificates found in /etc/nginx/"
else
  for cert in $SSL_CERTS; do
    if [ -f "$cert" ]; then
      exp=$(openssl x509 -in "$cert" -noout -enddate 2>/dev/null | cut -d= -f2)
      if [ -n "$exp" ]; then
        exp_ts=$(date -d "$exp" +%s 2>/dev/null || echo "?")
        now_ts=$(date +%s)
        days=$(( (exp_ts - now_ts) / 86400 ))
        if [ "$days" -lt 30 ]; then
          echo "  [WARN] $cert expires in $days days ($exp)"
        else
          echo "  [OK] $cert expires in $days days ($exp)"
        fi
      fi
    else
      echo "  [WARN] cert file not found: $cert"
    fi
  done
fi

# ─── 6. wecom 相关配置检查 ─────────────
echo ""
echo "── Wecom Adapter Proxy Check ──"
WG_CONF=$(find /etc/nginx/sites-enabled /etc/nginx/conf.d -name "*.conf" 2>/dev/null | head -5)
if [ -z "$WG_CONF" ]; then
  echo "  [INFO] No nginx site configs found"
else
  for conf in $WG_CONF; do
    if grep -q "wecom\|3001" "$conf" 2>/dev/null; then
      echo "  [INFO] Wecom-related config found: $conf"
      # 检查 gzip（企微不支持 gzip）
      if grep -q "gzip.*on" "$conf" 2>/dev/null; then
        echo "  [WARN] gzip may be ON (WeCom requires gzip OFF)"
      else
        echo "  [OK] gzip appears OFF for Wecom"
      fi
      # 检查 proxy_pass
      grep "proxy_pass" "$conf" 2>/dev/null | sed 's/^/    /'
    fi
  done
fi

# ─── 7. 访问日志最近错误 ────────────────
echo ""
echo "── Recent 4xx/5xx (last 50 lines) ──"
NGINX_LOG="/var/log/nginx/"
if [ -d "$NGINX_LOG" ]; then
  find "$NGINX_LOG" -name "*.log" | while read log; do
    if [ -r "$log" ]; then
      errs=$(tail -50 "$log" 2>/dev/null | grep -E " 4[0-9]{2} | 5[0-9]{2} " | wc -l)
      if [ "$errs" -gt 0 ]; then
        echo "  [WARN] $log: $errs errors in last 50 lines"
        tail -50 "$log" | grep -E " 4[0-9]{2} | 5[0-9]{2} " | tail -3 | sed 's/^/    /'
      else
        echo "  [OK] $log: no recent 4xx/5xx"
      fi
    fi
  done
else
  echo "  [INFO] $NGINX_LOG not readable"
fi

echo ""
echo "=== Nginx Audit Done ==="
