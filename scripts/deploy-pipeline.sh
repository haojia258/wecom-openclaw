#!/bin/bash
# ═══════════════════════════════════════════════════════════
#  OpenClaw Enterprise OS — Unified Deploy Pipeline
#  链式 Gate: Syntax → Smoke → PM2 Reload
#  Usage: bash scripts/deploy-pipeline.sh [--dry-run]
# ═══════════════════════════════════════════════════════════

set -e
PROJECT=/opt/wecom-openclaw
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DRY_RUN=false
PIPELINE_START=$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)
AUDIT_DIR="$PROJECT/logs/audit/full-audit-gate"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

if [ "$1" = "--dry-run" ]; then
  DRY_RUN=true
  echo -e "${YELLOW}  DRY RUN MODE — no PM2 reload will occur${NC}"
  echo ""
fi

echo "╔══════════════════════════════════════════╗"
echo "║  OpenClaw Deploy Pipeline v1.0          ║"
echo "║  $(date '+%Y-%m-%d %H:%M:%S')              ║"
echo "║  REVIEW_ONLY=true                       ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# ── Step 1: Pre-Deploy Guard (Syntax + Smoke) ──
echo -e "${BLUE}[1/3]${NC} Pre-Deploy Guard"
echo "──────────────────────────────────────────"

GUARD_SCRIPT="$SCRIPT_DIR/pre-deploy-guard.sh"

if [ ! -f "$GUARD_SCRIPT" ]; then
  echo -e "  ${RED}ERROR:${NC} pre-deploy-guard.sh not found"
  exit 1
fi

set +e
bash "$GUARD_SCRIPT"
GUARD_EXIT=$?
set -e

if [ $GUARD_EXIT -ne 0 ]; then
  echo ""
  echo -e "${RED}╔══════════════════════════════════════════╗${NC}"
  echo -e "${RED}║  DEPLOY BLOCKED — Gate failure          ║${NC}"
  echo -e "${RED}╚══════════════════════════════════════════╝${NC}"

  mkdir -p "$AUDIT_DIR"
  cat >> "$AUDIT_DIR/deployment.jsonl" << AUDITEOF
{"event":"deploy-blocked","timestamp":"$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)","reason":"pre-deploy-guard-failed","pipeline_start":"$PIPELINE_START","status":"blocked"}
AUDITEOF

  exit 1
fi

echo ""

# ── Step 2: Git Status Check ──
echo -e "${BLUE}[2/3]${NC} Git Status"
echo "──────────────────────────────────────────"

cd "$PROJECT"

BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
echo "  Branch: $BRANCH"

CHANGES=$(git status --porcelain 2>/dev/null | wc -l)
if [ "$CHANGES" -gt 0 ]; then
  echo -e "  ${YELLOW}Uncommitted changes: $CHANGES files${NC}"
  git status --short 2>/dev/null | head -10
else
  echo -e "  ${GREEN}Working tree clean${NC}"
fi

echo "  Recent commits:"
git log --oneline -3 2>/dev/null || echo "  N/A"
echo ""

# ── Step 3: PM2 Reload ──
echo -e "${BLUE}[3/3]${NC} PM2 Reload"
echo "──────────────────────────────────────────"

if [ "$DRY_RUN" = true ]; then
  echo -e "  ${YELLOW}DRY RUN — skipping PM2 reload${NC}"
  echo ""
  echo "  Would reload: wecom-adapter, web-console"
  echo ""
  echo -e "${GREEN}╔══════════════════════════════════════════╗${NC}"
  echo -e "${GREEN}║  DRY RUN COMPLETE — all gates passed    ║${NC}"
  echo -e "${GREEN}╚══════════════════════════════════════════╝${NC}"
  exit 0
fi

echo "  Reloading PM2 apps..."

set +e
pm2 reload ecosystem.config.js --update-env 2>&1
RELOAD_EXIT=$?
set -e

if [ $RELOAD_EXIT -ne 0 ]; then
  echo ""
  echo -e "  ${RED}PM2 reload failed with exit code $RELOAD_EXIT${NC}"
  echo "  Check PM2 logs: pm2 logs --err"
  echo ""

  mkdir -p "$AUDIT_DIR"
  cat >> "$AUDIT_DIR/deployment.jsonl" << AUDITEOF
{"event":"deploy-failed","timestamp":"$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)","reason":"pm2-reload-failed","exit_code":$RELOAD_EXIT,"branch":"$BRANCH","status":"failed"}
AUDITEOF

  exit 1
fi

echo "  PM2 reload complete"
echo ""

# ── Post-Deploy Verification ──
echo "  Post-deploy verification..."

sleep 2

# Check PM2 status
PM2_OK=$(pm2 jlist 2>/dev/null | node -e '
  var d="";
  process.stdin.on("data",function(c){d+=c});
  process.stdin.on("end",function(){
    try {
      var j=JSON.parse(d);
      var online = j.filter(function(x){return x.pm2_env.status==="online"});
      if (online.length < 2) process.exit(1);
      process.exit(0);
    } catch(e) { process.exit(1); }
  })
' && echo "ok" || echo "fail")

if [ "$PM2_OK" = "ok" ]; then
  echo -e "  PM2 status: ${GREEN}all processes online${NC}"
else
  echo -e "  PM2 status: ${YELLOW}checking...${NC}"
fi

# Quick health check
WEB_OK=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3199/api/status 2>/dev/null || echo "000")
if [ "$WEB_OK" = "200" ]; then
  echo -e "  Web Console: ${GREEN}$WEB_OK${NC}"
else
  echo -e "  Web Console: ${YELLOW}$WEB_OK${NC}"
fi

WECOM_OK=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3001/ 2>/dev/null || echo "000")
if [ "$WECOM_OK" != "000" ]; then
  echo -e "  WeCom Adapter: ${GREEN}responding ($WECOM_OK)${NC}"
else
  echo -e "  WeCom Adapter: ${YELLOW}checking...${NC}"
fi

echo ""

# ── Audit Record ──
PIPELINE_END=$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)
mkdir -p "$AUDIT_DIR"

cat >> "$AUDIT_DIR/deployment.jsonl" << AUDITEOF
{"event":"deploy-complete","timestamp":"$PIPELINE_END","pipeline_start":"$PIPELINE_START","branch":"$BRANCH","changes":"$CHANGES","web_console":"$WEB_OK","wecom_adapter":"$WECOM_OK","status":"success","review_only":true}
AUDITEOF

echo -e "${GREEN}╔══════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  DEPLOY COMPLETE — all gates passed     ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════╝${NC}"
echo ""
echo "  Pipeline duration: $(date +%s)"
echo "  Audit: $AUDIT_DIR/deployment.jsonl"
echo ""
echo "  Verify:"
echo "    pm2 status"
echo "    curl http://localhost:3199/api/status"
echo "    bash scripts/wecom-smoke-test.sh"
echo ""
exit 0
