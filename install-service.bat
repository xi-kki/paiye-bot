@echo off
cd /d C:\Users\HP\telegram-bot

:: Kill any existing instances
echo [1/4] Stopping any running instances...
taskkill /F /IM node.exe /FI "WINDOWTITLE eq PaiyeBot" >nul 2>&1

:: Delete existing task if any
echo [2/4] Removing old task if exists...
schtasks /DELETE /TN PaiyeBot /F >nul 2>&1

:: Create new scheduled task
echo [3/4] Creating scheduled task (runs at login)...
schtasks /CREATE /SC ONLOGON /TN PaiyeBot /TR "wscript.exe C:\Users\HP\telegram-bot\start-paiye.vbs" /DELAY 0000:30 /F
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Failed to create task
    pause
    exit /b 1
)

:: Start it now
echo [4/4] Starting bot now...
wscript.exe C:\Users\HP\telegram-bot\start-paiye.vbs

echo.
echo =====================================
echo   @Paiye_Bot service installed!  
echo   Starts automatically at login.
echo   Running now.
echo =====================================
timeout /t 3 /nobreak >nul
