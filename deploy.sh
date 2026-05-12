#!/bin/bash

set -e

APP_DIR="/opt/wecom-openclaw"
APP_NAME="wecom-openclaw"

echo "🚀 [DEPLOY] start..."

cd "$APP_DIR"

echo "==== git pull ===="
git pull origin main

echo "==== npm install ===="
npm install

echo "==== syntax check ===="
node -c app.js

echo "==== restart pm2 ===="
pm2 restart "$APP_NAME" --update-env || pm2 start app.js --name "$APP_NAME" --cwd "$APP_DIR"

echo "==== pm2 save ===="
pm2 save

echo "==== health check ===="
curl -fsS http://127.0.0.1:3001/ >/dev/null

echo "✅ [DEPLOY] done"