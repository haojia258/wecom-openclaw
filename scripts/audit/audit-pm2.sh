#!/usr/bin/env bash
# audit-pm2.sh - PM2 进程审计（只读，不重启）
# Ubuntu 24.04 / bash 5.x
# 用法: bash scripts/audit/audit-pm2.sh [--json]

set -euo pipefail

OUTPUT=${1:-"human"}

echo "=== PM2 Audit Report ==="
echo "Host: $(hostname)"
echo "Date: $(date -Iseconds)"
echo ""

# ─── 1. PM2 是否安装 ──────────────────
if ! command -v pm2 &>/dev/null; then
  echo "[FATAL] PM2 not found in PATH"
  exit 1
fi
echo "[INFO] PM2 version: $(pm2 -v)"

# ─── 2. 进程列表 ────────────────────────
echo ""
echo "── Process List ──"
pm2 jlist | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    for p in data:
        name   = p.get('name', '?')
        pid    = p.get('pid', '?')
        pm_id  = p.get('pm_id', '?')
        status = p.get('pm2_env', {}).get('status', '?')
        restart = p.get('pm2_env', {}).get('restart_time', '?')
        uptime  = p.get('pm2_env', {}).get('pm_uptime', 0)
        if uptime:
            uptime = int(time.time() * 1000 - uptime) // 60000 if 'time' in dir(__import__('time')) else '?'
        print(f'  [{pm_id}] {name} | pid={pid} | status={status} | restarts={restart}')
except Exception as e:
    print(f'  [WARN] parse error: {e}')
" 2>/dev/null || pm2 list

# ─── 3. 内存使用 ─────────────────────────
echo ""
echo "── Memory Usage ──"
pm2 jlist | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    for p in data:
        name = p.get('name', '?')
        m    = p.get('monit', {})
        mem  = m.get('memory', 0)
        cpu  = m.get('cpu', '?')
        mem_mb = round(mem / 1024 / 1024, 1)
        print(f'  {name}: MEM={mem_mb}MB  CPU={cpu}%')
except Exception as e:
    print(f'  [WARN] {e}')
" 2>/dev/null || echo "  [WARN] memory parse failed"

# ─── 4. Heap 使用率（Node.js）────────────
echo ""
echo "── Node.js Heap Usage ──"
pm2 jlist | python3 -c "
import sys, json, subprocess
try:
    data = json.load(sys.stdin)
    for p in data:
        pid = p.get('pid')
        name = p.get('name', '?')
        if not pid or pid == 0: continue
        try:
            out = subprocess.check_output(
                ['node', '--no-warnings', '-e',
                 \"process.on('warning',()=>{}); const v=process.memoryUsage(); console.log(JSON.stringify({r:v.heapUsed/1024/1024,t:v.heapTotal/1024/1024}))\"],
                timeout=5
            )
            import re
            m = re.search(r'\{.*\}', out.decode())
            if m:
                h = json.loads(m.group())
                pct = round(h['r'] / h['t'] * 100, 1) if h['t'] else 0
                print(f'  {name} (pid={pid}): Heap {round(h[\"r\"],1)}/{round(h[\"t\"],1)}MB = {pct}%')
        except Exception: pass
except Exception as e:
    print(f'  [WARN] {e}')
" 2>/dev/null

# ─── 5. 错误日志（最近 20 行）─────────
echo ""
echo "── Recent Errors (last 20 lines) ──"
ERR_LOG="$HOME/.pm2/logs/"
if [ -d "$ERR_LOG" ]; then
  find "$ERR_LOG" -name "*-error.log" -mtime -1 | while read f; do
    echo "  --- $f ---"
    tail -5 "$f" 2>/dev/null | sed 's/^/    /'
  done
else
  echo "  [WARN] $ERR_LOG not found"
fi

# ─── 6. 重启次数异常检查 ────────────────
echo ""
echo "── Restart Check ──"
pm2 jlist | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    for p in data:
        name = p.get('name', '?')
        r = p.get('pm2_env', {}).get('restart_time', 0)
        if r > 5:
            print(f'  [WARN] {name}: {r} restarts (consider debugging)')
        else:
            print(f'  [OK] {name}: {r} restarts')
except Exception as e:
    print(f'  [WARN] {e}')
" 2>/dev/null

echo ""
echo "=== PM2 Audit Done ==="
