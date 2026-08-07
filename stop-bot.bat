@echo off
title @Paiye_Bot — Stop
cd /d "C:\Users\HP\telegram-bot"

where pm2 >nul 2>&1
if errorlevel 1 (
    echo Stopping node processes...
    wmic process where "name='node.exe' and commandline like '%%paiye.js%%'" delete >nul 2>&1
    echo Bot stopped.
) else (
    pm2 stop paiye-bot
    echo Bot stopped (PM2).
)
