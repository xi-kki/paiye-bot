' Silent launcher for @Paiye_Bot
' Runs node index.js with no visible window

Dim objShell
Set objShell = CreateObject("WScript.Shell")

' Run node in hidden window (0 = hidden)
objShell.Run "cmd /c cd /d C:\Users\HP\telegram-bot && node index.js", 0, False

Set objShell = Nothing
