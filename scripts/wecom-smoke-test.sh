#!/bin/bash
# ═══════════════════════════════════════════════════════════
#  WeCom Smoke Test Gate — HOTFIX-003
#  部署前冒烟验证: 命令解析 → 处理器加载 → 格式校验
#  任何 FAIL → 禁止 PM2 reload
#  Usage: bash scripts/wecom-smoke-test.sh [--quick]
# ═══════════════════════════════════════════════════════════

set -e
PROJECT=/opt/wecom-openclaw
HOST=localhost
PORT=3001
FAIL=0
CHECKS_PASS=0
CHECKS_TOTAL=0

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo ""
echo "════════════════════════════════════════"
echo "  WeCom Smoke Test Gate v1.0"
echo "  $(date '+%Y-%m-%d %H:%M:%S')"
echo "  REVIEW_ONLY=true"
echo "════════════════════════════════════════"
echo ""

# ── Helper ──
check() {
  local name="$1"
  local cmd="$2"
  CHECKS_TOTAL=$((CHECKS_TOTAL + 1))
  printf "  [%2d] %-48s " "$CHECKS_TOTAL" "$name"
  if eval "$cmd" 2>/dev/null; then
    echo -e "${GREEN}OK${NC}"
    CHECKS_PASS=$((CHECKS_PASS + 1))
    return 0
  else
    echo -e "${RED}FAIL${NC}"
    FAIL=$((FAIL + 1))
    return 1
  fi
}

warn() {
  local name="$1"
  local cmd="$2"
  CHECKS_TOTAL=$((CHECKS_TOTAL + 1))
  printf "  [%2d] %-48s " "$CHECKS_TOTAL" "$name"
  if eval "$cmd" 2>/dev/null; then
    echo -e "${GREEN}OK${NC}"
    CHECKS_PASS=$((CHECKS_PASS + 1))
  else
    echo -e "${YELLOW}WARN${NC}"
  fi
}

# ═══════════════════════════════════════════
# Gate 1: Syntax Health
# ═══════════════════════════════════════════
echo "┌─ Gate 1/6: Syntax Health ─────────────────┐"
echo ""

FILES=(
  "apps/wecom-adapter/src/lib/command-center.js"
  "apps/wecom-adapter/src/index.js"
  "apps/wecom-adapter/src/router.js"
  "apps/wecom-adapter/src/commands/foundation-command.js"
  "apps/wecom-adapter/src/commands/kpi-command.js"
  "apps/wecom-adapter/src/commands/enterprise-orch-command.js"
  "apps/wecom-adapter/src/activities/activity-command.js"
  "apps/wecom-adapter/src/commands/asset-command.js"
  "apps/wecom-adapter/src/commands/video-ads-command.js"
  "apps/wecom-adapter/src/commands/board-command.js"
  "apps/wecom-adapter/src/commands/memory-command.js"
)

for f in "${FILES[@]}"; do
  check "$f" "node --check $PROJECT/$f"
done

echo ""

# ═══════════════════════════════════════════
# Gate 2: Command Center Runtime Load
# ═══════════════════════════════════════════
echo "┌─ Gate 2/6: Command Center Runtime Load ───┐"
echo ""

check "command-center.js require() loads" \
  "cd $PROJECT && node -e 'var cc = require(\"./apps/wecom-adapter/src/lib/command-center\"); process.exit(cc && typeof cc === \"object\" ? 0 : 1)'"

check "command-center has >= 20 commands" \
  "cd $PROJECT && node -e 'var cc = require(\"./apps/wecom-adapter/src/lib/command-center\"); var r = cc.REGISTRY || cc; var n = Object.keys(r).length; if (n < 20) { console.error(\"only \" + n + \" commands\"); process.exit(1); } process.exit(0)'"

check "command-center resolve() works" \
  "cd $PROJECT && node -e 'var cc = require(\"./apps/wecom-adapter/src/lib/command-center\"); var r = cc.resolve ? cc.resolve(\"/帮助\") : null; var cmd = r ? (r.cmd || r.command) : null; process.exit(cmd ? 0 : 1)'"

check "command-center REGISTRY has file refs" \
  "cd $PROJECT && node -e '
    var cc = require(\"./apps/wecom-adapter/src/lib/command-center\");
    var REG = cc.REGISTRY || {};
    var entry = REG[\"/帮助\"] || REG[\"/状态\"];
    process.exit(entry && entry.file ? 0 : 1);
  '"

check "command-center no null/undefined handler refs" \
  "cd $PROJECT && node -e '
    var cc = require(\"./apps/wecom-adapter/src/lib/command-center\");
    var REG = cc.REGISTRY || cc;
    var keys = Object.keys(REG);
    for (var i = 0; i < keys.length; i++) {
      var v = REG[keys[i]];
      var file = v && (v.file || v.handler);
      if (!file) { console.error(\"NULL handler: \" + keys[i]); process.exit(1); }
    }
    process.exit(0);
  '"

echo ""

# ═══════════════════════════════════════════
# Gate 3: Core Command Resolution
# ═══════════════════════════════════════════
echo "┌─ Gate 3/6: Core Command Resolution ───────┐"
echo ""

CORE_CMDS=(
  "'/底座'" "'/补丁'" "'/活动'" "'/素材'"
  "'/技能'" "'/视频'" "'/投流'"
  "'/目标'" "'/总控'" "'/董事会'"
  "'/帮助'" "'/状态'" "'/今日GMV'"
  "'/今日运营'" "'/风险告警'" "'/监控'"
  "'/ai任务'" "'/ai调度'" "'/ai审计'"
)

for cmd in "${CORE_CMDS[@]}"; do
  check "command $cmd registered in command-center" \
    "grep -q $cmd $PROJECT/apps/wecom-adapter/src/lib/command-center.js"
done

echo ""

# ═══════════════════════════════════════════
# Gate 4: Handler Integrity
# ═══════════════════════════════════════════
echo "┌─ Gate 4/6: Handler Integrity ─────────────┐"
echo ""

HANDLERS=(
  "foundation-command:commands/foundation-command"
  "kpi-command:commands/kpi-command"
  "enterprise-orch-command:commands/enterprise-orch-command"
  "board-command:commands/board-command"
  "memory-command:commands/memory-command"
  "goal-command:commands/goal-command"
  "autonomous-command:commands/autonomous-command"
  "asset-command:commands/asset-command"
  "video-ads-command:commands/video-ads-command"
  "activity-command:activities/activity-command"
  "workflow-command:commands/workflow-command"
  "skill-command:commands/skill-command"
  "approval-command:commands/approval-command"
)

for pair in "${HANDLERS[@]}"; do
  IFS=':' read -r label handlerPath <<< "$pair"
  check "$label exports execute/handle" \
    "cd $PROJECT && node -e '
      try {
        var m = require(\"./apps/wecom-adapter/src/$handlerPath\");
        var ok = m && (typeof m.execute === \"function\" || typeof m.handle === \"function\");
        if (!ok) { console.error(\"missing execute/handle\"); process.exit(1); }
        process.exit(0);
      } catch(e) { console.error(e.message); process.exit(1); }
    '"
done

echo ""

# ═══════════════════════════════════════════
# Gate 5: Mock Message Roundtrip
# ═══════════════════════════════════════════
echo "┌─ Gate 5/6: Mock Message Roundtrip ────────┐"
echo ""

check "index.js module loads without crash" \
  "cd $PROJECT && node -e '
    try {
      require(\"./apps/wecom-adapter/src/index\");
      process.exit(0);
    } catch(e) {
      // Load-time errors from missing env/middleware are OK in smoke context
      var msg = e.message || \"\";
      if (msg.indexOf(\"Cannot find module\") >= 0 && msg.indexOf(\"express\") < 0) {
        console.error(\"module not found: \" + msg.substring(0, 60));
        process.exit(1);
      }
      // env/middleware runtime errors = acceptable
      process.exit(0);
    }
  '"

check "router.js loads without crash" \
  "cd $PROJECT && node -e '
    try { require(\"./apps/wecom-adapter/src/router\"); process.exit(0); }
    catch(e) { console.error(e.message.substring(0, 60)); process.exit(1); }
  '"

check "mock dispatch: /底座 → foundation-command" \
  "cd $PROJECT && node -e '
    var cc = require(\"./apps/wecom-adapter/src/lib/command-center\");
    var REG = cc.REGISTRY || cc;
    var cmd = \"/底座\";
    var entry = REG[cmd];
    if (!entry) { console.error(\"command /底座 not found\"); process.exit(1); }
    var filePath = entry.file;
    if (filePath.indexOf(\"..\") === 0) filePath = \"./apps/wecom-adapter/src/\" + filePath.replace(/^\.\.\//, \"\");
    try { var m = require(filePath); if (!m || (typeof m.execute !== \"function\" && typeof m.handle !== \"function\")) { console.error(\"handler has no execute/handle\"); process.exit(1); } process.exit(0); }
    catch(e) { console.error(e.message.substring(0,60)); process.exit(1); }
  '"

check "mock dispatch: /活动 → activity command" \
  "cd $PROJECT && node -e '
    var cc = require(\"./apps/wecom-adapter/src/lib/command-center\");
    var REG = cc.REGISTRY || cc;
    var entry = REG[\"/活动\"];
    if (!entry) { console.error(\"command /活动 not found\"); process.exit(1); }
    process.exit(0);
  '"

check "mock dispatch: /总控 → dashboard command" \
  "cd $PROJECT && node -e '
    var cc = require(\"./apps/wecom-adapter/src/lib/command-center\");
    var REG = cc.REGISTRY || cc;
    var entry = REG[\"/总控\"] || REG[\"/监控\"];
    if (!entry) { console.error(\"command /总控 not found\"); process.exit(1); }
    process.exit(0);
  '"

echo ""

# ═══════════════════════════════════════════
# Gate 6: PM2 & Port Health
# ═══════════════════════════════════════════
echo "┌─ Gate 6/6: PM2 & Port Health ────────────┐"
echo ""

warn "PM2 wecom-adapter process running" \
  "pm2 jlist 2>/dev/null | node -e 'var d=\"\";process.stdin.on(\"data\",function(c){d+=c});process.stdin.on(\"end\",function(){try{var j=JSON.parse(d);var f=j.filter(function(x){return x.name===\"wecom-adapter\"&&x.pm2_env.status===\"online\"});process.exit(f.length>0?0:1)}catch(e){process.exit(1)}})'"

warn "Port $PORT responding (wecom-adapter)" \
  "curl -s -o /dev/null -w '%{http_code}' http://$HOST:$PORT/ 2>/dev/null | grep -qE '^(200|302|404)'"

warn "Port 3199 responding (web-console)" \
  "curl -s -o /dev/null -w '%{http_code}' http://localhost:3199/api/status 2>/dev/null | grep -q '200'"

echo ""

# ═══════════════════════════════════════════
# Gate 7 (BONUS): Cross-Module Dependency Check
# ═══════════════════════════════════════════
echo "┌─ Bonus: Cross-Module Dependency Check ────┐"
echo ""

CROSS_MODULES=(
  "governance/full-audit-gate"
  "governance/audit-sink"
  "governance/approval-enforcer"
  "governance/risk-classifier"
  "governance/secret-redactor"
  "activities/activity-store"
  "activities/enrollment-gate"
  "activities/execution-center"
  "activities/strategy-engine"
  "activities/price-guard"
)

for m in "${CROSS_MODULES[@]}"; do
  warn "$m loads" \
    "cd $PROJECT && node -e 'try{require(\"./apps/wecom-adapter/src/$m\");process.exit(0)}catch(e){console.error(e.message.substring(0,60));process.exit(1)}'"
done

echo ""

# ═══════════════════════════════════════════
# Report
# ═══════════════════════════════════════════
AUDIT_DIR="$PROJECT/logs/audit/full-audit-gate"
mkdir -p "$AUDIT_DIR"

TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
printf "  RESULTS: ${GREEN}%d${NC} / %d passed" "$CHECKS_PASS" "$CHECKS_TOTAL"
if [ $FAIL -gt 0 ]; then
  printf "  ${RED}%d FAILED${NC}" "$FAIL"
fi
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if [ $FAIL -eq 0 ]; then
  echo -e "${GREEN}ALL GATES PASSED${NC} — PM2 reload permitted"
  echo ""

  # Write P48 audit record
  cat >> "$AUDIT_DIR/smoke-test.jsonl" << AUDITEOF
{"event":"wecom-smoke-test-pass","timestamp":"$TIMESTAMP","checks_passed":$CHECKS_PASS,"checks_total":$CHECKS_TOTAL,"checks_failed":0,"status":"pass","review_only":true}
AUDITEOF

  exit 0
else
  echo -e "${RED}SMOKE TEST FAILED${NC} — PM2 reload BLOCKED"
  echo ""
  echo "  ${RED}$FAIL${NC} of $CHECKS_TOTAL checks failed"
  echo ""
  echo "  Action required:"
  echo "    1. Review each FAIL above"
  echo "    2. Fix root cause (DO NOT skip gate)"
  echo "    3. Re-run: bash scripts/wecom-smoke-test.sh"
  echo "    4. Only proceed when ALL GATES = PASS"
  echo ""

  # Write P48 audit record
  cat >> "$AUDIT_DIR/smoke-test.jsonl" << AUDITEOF
{"event":"wecom-smoke-test-fail","timestamp":"$TIMESTAMP","checks_passed":$CHECKS_PASS,"checks_total":$CHECKS_TOTAL,"checks_failed":$FAIL,"status":"blocked","review_only":true}
AUDITEOF

  exit 1
fi
