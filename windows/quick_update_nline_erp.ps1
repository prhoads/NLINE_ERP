# Quick update of NLINE ERP on NLVDC01 after G:\NLINE_ERP\src was updated (git pull):
# only what changed, and only as much as the change needs.
#   - web files only (desk screens, custom.js / .css, images): copied, no restart
#     (a page reload shows them)
#   - Python only: the changed modules copied into the venv, ERP restarted (~20 s)
#   - views / menus / fields / new modules (.xml, .cfg, view\, a new module):
#     copied, the database updated for THOSE modules only, ERP restarted
# The full update (update_nline_erp.ps1: pip install of every module, update of every
# N-Line module) stays for new standard Tryton modules or a damaged install.
# Run it ON NLVDC01 as an administrator, in PowerShell:
#   powershell -ExecutionPolicy Bypass -File G:\NLINE_ERP\quick_update_nline_erp.ps1
#   ... -WhatIf      (only say what it would do)
param(
    [string]$Database = 'nline_test',
    [switch]$WhatIf
)
$ErrorActionPreference = 'Stop'
$Root = $PSScriptRoot
$Source = Join-Path $Root 'src'
$Site = Join-Path $Root 'venv\Lib\site-packages\trytond\modules'
$Web = Join-Path $Root 'sao'

# The modules of the source that differ from the venv's copy, and how
function Get-ModuleChanges {
    $changes = @()
    foreach ($dir in Get-ChildItem (Join-Path $Source 'modules') -Directory) {
        $target = Join-Path $Site $dir.Name
        if (-not (Test-Path $target)) {
            if ($dir.Name -like 'nline_*') {
                $changes += [pscustomobject]@{Module = $dir.Name; New = $true; Files = @('(new module)') }
            }
            continue
        }
        # /L: list only; /NJH /NJS /NDL: just the files that would be copied or deleted
        $files = robocopy $dir.FullName $target /MIR /L /XD __pycache__ build tests /XF *.pyc /NJH /NJS /NDL /NP /FP /NS /NC |
            ForEach-Object { $_.Trim() } | Where-Object { $_ }
        if ($files) {
            $changes += [pscustomobject]@{Module = $dir.Name; New = $false; Files = @($files) }
        }
    }
    return $changes
}

$changes = @(Get-ModuleChanges)
# Files of a module that need the database updated (else a restart is enough)
$dataPattern = '\.(xml|cfg|csv)$|\\view\\|\\locale\\|\(new module\)'
$needDb = @($changes | Where-Object {
        $_.New -or @($_.Files | Where-Object { $_ -notmatch '\\web\\' -and $_ -match $dataPattern }).Count })
$needRestart = @($changes | Where-Object {
        $_.New -or @($_.Files | Where-Object { $_ -notmatch '\\web\\' }).Count })

Write-Host 'Changed modules:'
foreach ($c in $changes) { Write-Host ("  {0}: {1} file(s)" -f $c.Module, $c.Files.Count) }
if (-not $changes) { Write-Host '  none' }
Write-Host ('Database update for: {0}' -f $(if ($needDb) { ($needDb.Module -join ', ') } else { 'none' }))
Write-Host ('Restart: {0}' -f $(if ($needRestart) { 'yes' } else { 'no' }))
if ($WhatIf) { return }

if ($needRestart) { & (Join-Path $Root 'stop_nline_erp.ps1') }

# The modules: only changed files are copied (robocopy skips equal ones)
foreach ($c in $changes) {
    robocopy (Join-Path $Source "modules\$($c.Module)") (Join-Path $Site $c.Module) /MIR /XD __pycache__ build /NFL /NDL /NJH /NJS /NP | Out-Null
    if ($LASTEXITCODE -ge 8) { throw "copy of $($c.Module) failed" }
}

# The web client's N-Line files and the desk screens (changed files only; no /MIR
# on the client folder, which also holds the desk)
robocopy (Join-Path $Source 'modules\nline_desk\web') (Join-Path $Web 'desk') /MIR /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { throw 'copy of the desk screens failed' }
robocopy (Join-Path $Source 'windows\sao') $Web custom.js custom.css /NFL /NDL /NJH /NJS /NP | Out-Null
robocopy (Join-Path $Source 'windows\sao\images') (Join-Path $Web 'images') /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { throw 'copy of the web client files failed' }

# The scripts here current
Copy-Item (Join-Path $Source 'windows\quick_update_nline_erp.ps1') $Root -Force
Copy-Item (Join-Path $Source 'windows\update_nline_erp.ps1') $Root -Force

if ($needDb) {
    $env:TZ = 'UTC'; $env:TRYTOND_TZ = 'America/Chicago'
    $Python = Join-Path $Root 'venv\Scripts\python.exe'
    $Admin = Join-Path $Root 'venv\Scripts\trytond-admin'
    Write-Host "Updating $Database : $($needDb.Module -join ' ')"
    & $Python $Admin -c (Join-Path $Root 'trytond.conf') -d $Database -m -u @($needDb.Module) --activate-dependencies
    if ($LASTEXITCODE) { throw 'trytond-admin failed: the ERP is stopped, see above' }
}

if ($needRestart) {
    & (Join-Path $Root 'stop_nline_erp.ps1') -Restart
    Write-Host 'NLINE ERP updated and restarted.'
} else {
    Write-Host 'Web files updated: reload the page. No restart needed.'
}
