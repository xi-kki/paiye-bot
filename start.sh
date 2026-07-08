#!/bin/bash
# @Paiye_Bot — Startup script
# Resets Telegram connections, then starts the bot
# Uses TELEGRAM_TOKEN from .env file (never hardcode secrets!)

DIR="$(cd "$(dirname "$0")" && pwd)"

# Load token from .env
if [ -f "$DIR/.env" ]; then
  export $(grep -v '^#' "$DIR/.env" | xargs)
fi

if [ -z "$TELEGRAM_TOKEN" ]; then
  echo "❌ TELEGRAM_TOKEN not set! Make sure .env exists."
  exit 1
fi

echo "🔧 Resetting Telegram webhook/connections..."
curl -s "https://api.telegram.org/bot$TELEGRAM_TOKEN/setWebhook?url=https://example.com/webhook" > /dev/null
sleep 1
curl -s "https://api.telegram.org/bot$TELEGRAM_TOKEN/deleteWebhook?drop_pending_updates=true" > /dev/null
sleep 1

echo "🚀 Starting @Paiye_Bot..."
cd "$DIR"
nohup node index.js > bot-output.log 2>&1 &
BOT_PID=$!
echo "✅ Bot started! PID: $BOT_PID"
echo "📋 Logs: $DIR/bot-output.log"
