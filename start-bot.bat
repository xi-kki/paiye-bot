@echo off
title @Paiye_Bot v5 — AI Career Agent
cd /d "C:\Users\HP\telegram-bot"

:: Check if .env exists with a token
findstr /B "TELEGRAM_TOKEN=" .env >nul 2>&1
if errorlevel 1 (
    echo ❌ No TELEGRAM_TOKEN found in .env
    echo    Run setup first: node setup.js
    pause
    exit /b 1
)

echo.
echo ╔══════════════════════════════╗
echo ║   🤖  PAIYE v5             ║
echo ║   AI Career Agent          ║
echo ╚══════════════════════════════╝
echo.

:: Check if PM2 is available
where pm2 >nul 2>&1
if errorlevel 1 (
    echo PM2 not found — starting directly...
    echo.
    start /B /MIN "" node paiye.js > logs\output.log 2>&1
    echo ✅ Bot started in background!
    echo    Check logs: type logs\output.log
) else (
    echo PM2 found — managing process with PM2...
    pm2 start ecosystem.config.js --update-env 2>&1
    pm2 save
    echo.
    echo ✅ Bot started with PM2!
    echo    Status: pm2 status
    echo    Logs:   pm2 logs paiye-bot
    echo    Stop:   pm2 stop paiye-bot
)

echo.
echo Bot started at %date% %time%
echo.
