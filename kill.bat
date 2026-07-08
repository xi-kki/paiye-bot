@echo off
echo Killing all node.exe processes...
taskkill /F /IM node.exe >nul 2>&1
if %errorlevel% equ 0 (
    echo All node processes killed successfully.
) else (
    echo No node processes found or access denied.
)
timeout /t 3 /nobreak >nul
echo Done.
