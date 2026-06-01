#!/bin/bash
# ═══════════════════════════════════════════════════════════
#  Pre-Deploy Guard — HOTFIX-002 + HOTFIX-003
#  Gate 1: Syntax Check (HOTFIX-002)
#  Gate 2: WeCom Smoke Test (HOTFIX-003)
#  任何 FAIL → 禁止 PM2 reload
#  Usage: bash scripts/pre-deploy-guard.sh [--syntax-only] [--skip-smoke]
# ═══════════════════════════════════════════════════════════

set -e
PROJECT=/opt/wecom-openclaw
FAIL=0

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

echo "════════════════════════════════════════"
echo "  Pre-Deploy Guard v2.0"
echo "  $(date '+%Y-%m-%d %H:%M:%S')"
echo "════════════════════════════════════════"
echo ""

# ── Gate 1: Syntax Check ──
echo "┌─ Gate 1/2: Syntax Check (HOTFIX-002) ────┐"
echo ""

FILES=(
  "apps/wecom-adapter/src/lib/command-center.js"
  "apps/wecom-adapter/src/index.js"
  "apps/wecom-adapter/src/router.js"
  "apps/wecom-adapter/src/commands/foundation-command.js"
  "apps/wecom-adapter/src/commands/kpi-command.js"
  "apps/wecom-adapter/src/commands/enterprise-orch-command.js"
  "apps/wecom-adapter/src/commands/board-command.js"
  "apps/wecom-adapter/src/commands/memory-command.js"
  "apps/wecom-adapter/src/commands/goal-command.js"
  "apps/wecom-adapter/src/commands/autonomous-command.js"
  "apps/wecom-adapter/src/commands/asset-command.js"
  "apps/wecom-adapter/src/commands/video-ads-command.js"
  "apps/wecom-adapter/src/activities/activity-command.js"
  "apps/wecom-adapter/src/commands/workflow-command.js"
  "apps/web-console/server.js"
)

for f in "${FILES[@]}"; do
  printf "  %-58s " "$f"
  if node --check "$PROJECT/$f" 2>/dev/null; then
    echo -e "${GREEN}OK${NC}"
  else
    echo -e "${RED}SYNTAX ERROR${NC}"
    FAIL=$((FAIL + 1))
  fi
done

echo ""

if [ $FAIL -gt 0 ]; then
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo -e "  ${RED}SYNTAX CHECK FAILED${NC} — PM2 reload BLOCKED"
  echo "  $FAIL file(s) with syntax errors"
  echo ""
  echo "  Do NOT reload PM2 until all syntax errors are fixed."
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  exit 1
fi

echo -e "  ${GREEN}Gate 1/2 PASSED${NC} — all files syntax-valid"
echo ""

# ── Gate 2: WeCom Smoke Test ──
if [ "$1" = "--syntax-only" ]; then
  echo "  ⏭️  Skipping Gate 2 (--syntax-only)"
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo -e "  ${GREEN}SYNTAX PASSED${NC} (smoke test skipped)"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  exit 0
fi

if [ "$1" = "--skip-smoke" ]; then
  echo "  ⚠️  Skipping Gate 2 (--skip-smoke)"
  echo "  WARNING: Deploying without smoke test verification"
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo -e "  ${GREEN}SYNTAX PASSED${NC} (smoke test skipped)"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  exit 0
fi

echo "┌─ Gate 2/2: WeCom Smoke Test (HOTFIX-003) ──┐"
echo ""

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SMOKE_SCRIPT="$SCRIPT_DIR/wecom-smoke-test.sh"

if [ ! -f "$SMOKE_SCRIPT" ]; then
  echo -e "  ${RED}ERROR:${NC} Smoke test script not found at $SMOKE_SCRIPT"
  echo "  PM2 reload BLOCKED — smoke test required for deploy"
  exit 1
fi

set +e
bash "$SMOKE_SCRIPT"
SMOKE_EXIT=$?
set -e

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ $SMOKE_EXIT -eq 0 ]; then
  echo -e "  ${GREEN}ALL GATES PASSED${NC}"
  echo "  Syntax Check ✅  |  Smoke Test ✅"
  echo ""
  echo "  PM2 reload permitted."
  echo ""
  echo "  To deploy:"
  echo "    bash scripts/deploy-pipeline.sh"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  exit 0
else
  echo -e "  ${RED}GATE FAILED${NC} — PM2 reload BLOCKED"
  echo "  Syntax Check ✅  |  Smoke Test ❌"
  echo ""
  echo "  Fix smoke test failures before retrying."
  echo "  Run standalone smoke test: bash scripts/wecom-smoke-test.sh"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  exit 1
fi
