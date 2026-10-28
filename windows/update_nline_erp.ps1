# Update NLINE ERP on NLVDC01 after G:\NLINE_ERP\src was updated (git pull):
# stop, install the modules and the web client, update the database, restart.
# Run it ON NLVDC01 as an administrator, in PowerShell:
#   powershell -ExecutionPolicy Bypass -File G:\NLINE_ERP\update_nline_erp.ps1
#   ... -Modules nline_role,nline_desk       (only these; default: every N-Line module)
#   ... -LoadSample                          (then load the Jobshop + QuickBooks sample
#                                             data, migration\README.md; test database only)
param(
    [string[]]$Modules,
    [string]$Database = 'nline_test',
    [switch]$LoadSample
)
$ErrorActionPreference = 'Stop'
$Root = $PSScriptRoot
$Source = Join-Path $Root 'src'
if (-not $Modules) {
    # Every activated N-Line module (the ones not yet approved stay off)
    $Modules = 'nline_role', 'nline_nlbi', 'nline_engineering', 'nline_work_order', 'nline_job',
        'nline_build_tree', 'nline_sales_cost', 'nline_check_print', 'nline_change_log',
        'nline_customer_statement', 'nline_account', 'nline_desk',
        # The VISUAL Jobshop emulation (docs/jobshop/EMULATION.md)
        'nline_js_common', 'nline_js_inventory', 'nline_js_sales', 'nline_js_purchasing',
        'nline_js_engineering', 'nline_js_shopfloor', 'nline_js_planning', 'nline_js_admin',
        'nline_jobshop'
}
# (a comma list passed through -File arrives as one string)
$Modules = @($Modules | ForEach-Object { $_ -split ',' } | Where-Object { $_ })

& (Join-Path $Root 'stop_nline_erp.ps1')
& powershell -ExecutionPolicy Bypass -File (Join-Path $Root 'install_nline_erp.ps1')
if ($LASTEXITCODE) { throw 'install_nline_erp.ps1 failed' }
# The newest install script is in the source: keep the copies here current
Copy-Item (Join-Path $Source 'windows\update_nline_erp.ps1') $Root -Force

$env:TZ = 'UTC'; $env:TRYTOND_TZ = 'America/Chicago'
$Python = Join-Path $Root 'venv\Scripts\python.exe'
$Admin = Join-Path $Root 'venv\Scripts\trytond-admin'
Write-Host "Updating $Database : $($Modules -join ' ')"
& $Python $Admin -c (Join-Path $Root 'trytond.conf') -d $Database -m -u @Modules --activate-dependencies
if ($LASTEXITCODE) { throw 'trytond-admin failed: the ERP is stopped, see above' }

if ($LoadSample) {
    if ($Database -ne 'nline_test') { throw 'The sample data goes only into nline_test' }
    # Reads Jobshop and QuickBooks on VJS with this Windows sign-in, read-only
    & $Python -u (Join-Path $Source 'migration\nline_migrate.py') --config (Join-Path $Root 'trytond.conf') `
        --database $Database --mode sample
    if ($LASTEXITCODE) { Write-Warning 'The sample load stopped (see above); the ERP starts anyway' }
}

& (Join-Path $Root 'stop_nline_erp.ps1') -Restart
Write-Host 'NLINE ERP updated and restarted.'
