@echo off
title @Paiye_Bot - Fix & Start
echo ============================================
echo   @Paiye_Bot - Fix Polling Error ^& Start
echo ============================================
echo.

:: Load TELEGRAM_TOKEN from .env
for /f "tokens=1,2 delims==" %%a in (.env) do (
    if "%%a"=="TELEGRAM_TOKEN" set TELEGRAM_TOKEN=%%b
)

if "%TELEGRAM_TOKEN%"=="" (
    echo [ERROR] TELEGRAM_TOKEN not found in .env
    pause
    exit /b 1
)

echo [1/4] Killing any stale node processes...
taskkill /F /IM node.exe >nul 2>&1
timeout /t 2 /nobreak >nul

echo [2/4] Forcing webhook to kill stale Telegram connections...
curl -s "https://api.telegram.org/bot%TELEGRAM_TOKEN%/setWebhook?url=https://example.com/paiye-reset&drop_pending_updates=true" >nul
timeout /t 2 /nobreak >nul

echo [3/4] Deleting webhook to return to polling mode...
curl -s "https://api.telegram.org/bot%TELEGRAM_TOKEN%/deleteWebhook?drop_pending_updates=true" >nul
timeout /t 1 /nobreak >nul

echo [4/4] Starting bot...
start "PaiyeBot" cmd /c "node index.js & pause"

echo.
echo ============================================
echo   Bot started! Check bot-output.log for logs
echo   Close this window to keep bot running.
echo ============================================
timeout /t 3 /nobreak >nul
