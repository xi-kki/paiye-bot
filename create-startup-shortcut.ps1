$wshell = New-Object -ComObject WScript.Shell
$shortcut = $wshell.CreateShortcut("C:\Users\HP\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup\PaiyeBot.lnk")
$shortcut.TargetPath = "wscript.exe"
$shortcut.Arguments = "C:\Users\HP\telegram-bot\start-paiye.vbs"
$shortcut.WindowStyle = 7
$shortcut.Description = "@Paiye_Bot - Telegram Job Match Engine"
$shortcut.Save()
Write-Output "Shortcut created successfully!"
