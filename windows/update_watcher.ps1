# The update watcher of NLINE ERP on NLVDC01: run every minute by the scheduled task
# "NLINE ERP Update Watcher" (setup_update_watcher.ps1, as SYSTEM). When the development
# PC has put a request in G:\NLINE_ERP\requests (update.request, after updating
# G:\NLINE_ERP\src), it runs quick_update_nline_erp.ps1 once and leaves:
#   requests\update.result    one line of JSON: request, started, finished, exit code, log
#   requests\logs\update-<time>.log    what the update printed
# The request's text is only noted, never run. A request of "whatif" runs it with -WhatIf.
$ErrorActionPreference = 'Stop'
$Root = $PSScriptRoot
$Requests = Join-Path $Root 'requests'
$Request = Join-Path $Requests 'update.request'
$Running = Join-Path $Requests 'update.running'
$Logs = Join-Path $Requests 'logs'

if (-not (Test-Path $Request)) { return }
# One update at a time; a "running" mark older than an hour is from a run that died
if (Test-Path $Running) {
    if ((Get-Item $Running).LastWriteTime -gt (Get-Date).AddHours(-1)) { return }
    Remove-Item $Running -Force
}
New-Item -ItemType Directory -Force $Logs | Out-Null
Move-Item $Request $Running -Force
$Text = (Get-Content $Running -Raw -ErrorAction SilentlyContinue)
if ($null -eq $Text) { $Text = '' }
$Stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$Log = Join-Path $Logs "update-$Stamp.log"
$Started = Get-Date -Format s
$Arguments = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $Root 'quick_update_nline_erp.ps1'))
if ($Text.Trim() -match '^whatif\b') { $Arguments += '-WhatIf' }
try {
    & powershell.exe @Arguments *> $Log
    $Code = $LASTEXITCODE
} catch {
    $_ | Out-File $Log -Append
    $Code = 1
}
if ($null -eq $Code) { $Code = 0 }
$Result = [ordered]@{
    request = $Text.Trim()
    started = $Started
    finished = Get-Date -Format s
    exit = $Code
    log = $Log
}
($Result | ConvertTo-Json -Compress) | Set-Content (Join-Path $Requests 'update.result') -Encoding UTF8
Remove-Item $Running -Force
# Keep the last 50 logs
Get-ChildItem $Logs -Filter 'update-*.log' | Sort-Object Name -Descending |
    Select-Object -Skip 50 | Remove-Item -Force
