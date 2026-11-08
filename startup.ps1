# 在此文件中写入 DSH 启动时要执行的 PowerShell 指令。
# Put the PowerShell command that DSH should run on startup in this file.
#
# DSH runs it as:
#   powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File <this file>
#
# Examples (uncomment one):
#   Set-Content -LiteralPath "$env:TEMP\dsh-started.txt" -Value (Get-Date)
#   Start-Sleep -Seconds 3600
#   & "C:\path\to\your-service.exe"
#
# The whole process tree started here is terminated when DSH exits or when this
# plugin is disabled. Keep the script in the foreground; do not detach a child
# that must be managed.
