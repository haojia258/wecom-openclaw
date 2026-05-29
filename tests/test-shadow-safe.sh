#!/usr/bin/env bash
# test-shadow-safe.sh - Shadow 安全脚本 smoke test（本地，不依赖生产服务器）
# 用法: bash tests/test-shadow-safe.sh
set -uo pipefail

PASS=0
FAIL=0

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "$0")/../apps/wecom-adapter/scripts" && pwd)"
START_SH="${SCRIPT_DIR}/shadow-safe-start.sh"
CLEANUP_SH="${SCRIPT_DIR}/shadow-safe-cleanup.sh"

echo "=== Shadow Safe Scripts Smoke Test ==="
echo "Start script: ${START_SH}"
echo "Cleanup script: ${CLEANUP_SH}"
echo ""

# ─── T1: port=3001 必须拒绝 ───────────────────
echo "[T1] 红线 R1: port=3001 必须拒绝启动"
OUTPUT=$(WECOM_ADAPTER_PORT=3001 bash "$START_SH" 3001 test-shadow 2>&1 || true)
if echo "$OUTPUT" | grep -q "红线拒绝"; then
  echo -e "  ${GREEN}PASS${NC}: port=3001 被正确拒绝"
  ((PASS++))
else
  echo -e "  ${RED}FAIL${NC}: port=3001 未被拒绝"
  echo "  输出: $OUTPUT"
  ((FAIL++))
fi

# ─── T2: WECOM_ADAPTER_PORT 缺失必须拒绝 ───────
echo "[T2] 红线 R2: WECOM_ADAPTER_PORT 缺失必须拒绝"
OUTPUT=$(bash "$START_SH" 39013 test-shadow 2>&1 || true)
if echo "$OUTPUT" | grep -q "WECOM_ADAPTER_PORT 为空"; then
  echo -e "  ${GREEN}PASS${NC}: WECOM_ADAPTER_PORT 缺失被正确拒绝"
  ((PASS++))
else
  echo -e "  ${RED}FAIL${NC}: WECOM_ADAPTER_PORT 缺失未被拒绝"
  ((FAIL++))
fi

# ─── T3: WECOM_ADAPTER_PORT=3001 必须拒绝 ───────
echo "[T3] 红线 R2: WECOM_ADAPTER_PORT=3001 必须拒绝"
OUTPUT=$(WECOM_ADAPTER_PORT=3001 bash "$START_SH" 39013 test-shadow 2>&1 || true)
if echo "$OUTPUT" | grep -q "WECOM_ADAPTER_PORT=3001"; then
  echo -e "  ${GREEN}PASS${NC}: WECOM_ADAPTER_PORT=3001 被正确拒绝"
  ((PASS++))
else
  echo -e "  ${RED}FAIL${NC}: WECOM_ADAPTER_PORT=3001 未被拒绝"
  ((FAIL++))
fi

# ─── T4: port 与 WECOM_ADAPTER_PORT 不一致必须拒绝 ──
echo "[T4] 红线 R2: port 与 WECOM_ADAPTER_PORT 不一致必须拒绝"
OUTPUT=$(WECOM_ADAPTER_PORT=39014 bash "$START_SH" 39013 test-shadow 2>&1 || true)
if echo "$OUTPUT" | grep -q "不一致"; then
  echo -e "  ${GREEN}PASS${NC}: 端口不一致被正确拒绝"
  ((PASS++))
else
  echo -e "  ${RED}FAIL${NC}: 端口不一致未被拒绝"
  ((FAIL++))
fi

# ─── T5: cleanup port=3001 必须拒绝 ─────────────
echo "[T5] 红线: cleanup port=3001 必须拒绝"
OUTPUT=$(bash "$CLEANUP_SH" test-shadow 3001 2>&1 || true)
if echo "$OUTPUT" | grep -q "不能对生产端口 3001"; then
  echo -e "  ${GREEN}PASS${NC}: cleanup 对 3001 正确拒绝"
  ((PASS++))
else
  echo -e "  ${RED}FAIL${NC}: cleanup 对 3001 未拒绝"
  ((FAIL++))
fi

# ─── T6: 参数缺失必须拒绝 ──────────────────────
echo "[T6] 参数缺失: 无参数必须拒绝"
OUTPUT=$(bash "$START_SH" 2>&1 || true)
if echo "$OUTPUT" | grep -q "必须显式传入"; then
  echo -e "  ${GREEN}PASS${NC}: 无参数被正确拒绝"
  ((PASS++))
else
  echo -e "  ${RED}FAIL${NC}: 无参数未被拒绝"
  ((FAIL++))
fi

# ─── T7: 检查脚本文件存在且有执行权限 ──────────
echo "[T7] 脚本文件存在且有执行权限"
if [ -x "$START_SH" ] && [ -x "$CLEANUP_SH" ]; then
  echo -e "  ${GREEN}PASS${NC}: 两个脚本均有执行权限"
  ((PASS++))
else
  echo -e "  ${RED}FAIL${NC}: 脚本缺少执行权限"
  echo "  start: $(ls -l "$START_SH" 2>/dev/null || echo 'MISSING')"
  echo "  cleanup: $(ls -l "$CLEANUP_SH" 2>/dev/null || echo 'MISSING')"
  ((FAIL++))
fi

# ─── T8: 检查 runbook 文件存在 ─────────────────
echo "[T8] Runbook 文件存在"
RUNBOOK="$(cd "$(dirname "$0")/../docs/runtime" && pwd)/shadow-safe-rollout-runbook.md"
if [ -f "$RUNBOOK" ]; then
  echo -e "  ${GREEN}PASS${NC}: runbook 存在"
  ((PASS++))
else
  echo -e "  ${RED}FAIL${NC}: runbook 不存在: $RUNBOOK"
  ((FAIL++))
fi

# ─── T9: 检查 runbook 包含关键章节 ─────────────
echo "[T9] Runbook 包含关键章节"
REQUIRED_SECTIONS=("事故复盘" "root PM2 风险" "Shadow 启动红线" "回滚流程" "端口检查命令" "PM2 用户隔离规范")
SECTIONS_FOUND=0
for sec in "${REQUIRED_SECTIONS[@]}"; do
  if grep -qi "$sec" "$RUNBOOK" 2>/dev/null; then
    ((SECTIONS_FOUND++))
  else
    echo -e "  ${YELLOW}WARN${NC}: 章节缺失: $sec"
  fi
done
if [ "$SECTIONS_FOUND" -eq "${#REQUIRED_SECTIONS[@]}" ]; then
  echo -e "  ${GREEN}PASS${NC}: 所有 ${#REQUIRED_SECTIONS[@]} 个章节均存在"
  ((PASS++))
else
  echo -e "  ${RED}FAIL${NC}: 只找到 ${SECTIONS_FOUND}/${#REQUIRED_SECTIONS[@]} 个章节"
  ((FAIL++))
fi

# ─── 汇总 ───────────────────────────────────────────
echo ""
echo "=== Test Results ==="
echo -e "  ${GREEN}PASS: ${PASS}${NC}"
echo -e "  ${RED}FAIL: ${FAIL}${NC}"
echo ""

if [ "$FAIL" -gt 0 ]; then
  echo -e "${RED}Smoke test FAILED${NC}"
  exit 1
else
  echo -e "${GREEN}All smoke tests PASSED${NC}"
  exit 0
fi
