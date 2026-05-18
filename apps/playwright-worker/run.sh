#!/bin/bash
SCRIPT="$1"
shift
cd /opt/wecom-openclaw/apps/playwright-worker
mkdir -p logs/cron
xvfb-run -a node "src/${SCRIPT}.js" "$@" >> "/opt/wecom-openclaw/logs/cron/${SCRIPT}.log" 2>&1
