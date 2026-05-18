#!/bin/bash
export DISPLAY=:99
export HEADLESS=false
cd /opt/wecom-openclaw/apps/playwright-worker
node "$@"

