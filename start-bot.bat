@echo off
title @Paiye_Bot — Job Match Engine v3
cd /d "C:\Users\HP\telegram-bot"

:: Kill stale bot instances
echo [1/3] Killing stale bot instances...
wmic process where "name='node.exe' and commandline like '%%index.js%%'" delete >nul 2>&1
timeout /t 2 /nobreak >nul

:: Clean Telegram connection via .env token
echo [2/3] Cleaning Telegram connection...
for /f "tokens=2 delims==" %%a in ('findstr "TELEGRAM_TOKEN" .env') do set "TOKEN=%%a"
if not "%TOKEN%"=="" (
  node -e "const https=require('https');const t='%TOKEN%';const d=JSON.stringify({drop_pending_updates:true});const r=https.request('https://api.telegram.org/bot'+t+'/deleteWebhook',{method:'POST',headers:{'Content-Type':'application/json','Content-Length':d.length}},()=>{});r.write(d);r.end();setTimeout(()=>process.exit(),3000);"
)

:: Start bot
echo [3/3] Starting @Paiye_Bot...
start /B /MIN "" node index.js > output.log 2>&1

echo Bot started! Check output.log for status.
echo.
echo To stop: wmic process where "name='node.exe' and commandline like '%%index.js%%'" delete
