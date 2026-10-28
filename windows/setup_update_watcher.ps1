# One-time setup of the NLINE ERP update watcher on NLVDC01: the development PC asks for
# an update by putting requests\update.request on the share; the scheduled task
# "NLINE ERP Update Watcher" (every minute, as SYSTEM) runs quick_update_nline_erp.ps1
# (update_watcher.ps1). Run it ON NLVDC01 as an administrator who may change SQL Server
# logins, in PowerShell:
#   powershell -ExecutionPolicy Bypass -File G:\NLINE_ERP\src\windows\setup_update_watcher.ps1
#   ... -Remove      (unregister the task again)
param(
    [string[]]$Databases = @('nline_test', 'nline'),
    [string]$SqlServer = 'localhost\VJS',
    [switch]$Remove
)
$ErrorActionPreference = 'Stop'
$Root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent    # G:\NLINE_ERP
$Source = Join-Path $Root 'src'
$TaskName = 'NLINE ERP Update Watcher'

if ($Remove) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
    Write-Host "Task '$TaskName' removed."
    return
}

# The scripts next to the install, the request folder on the share
foreach ($Script in 'update_watcher.ps1', 'quick_update_nline_erp.ps1', 'update_nline_erp.ps1') {
    Copy-Item (Join-Path $Source "windows\$Script") $Root -Force
}
New-Item -ItemType Directory -Force (Join-Path $Root 'requests\logs') | Out-Null

# The updates change the ERP's tables as SYSTEM: SYSTEM may own the ERP databases
# (the ERP itself keeps running as its service account)
$Python = Join-Path $Root 'venv\Scripts\python.exe'
$Sql = @"
import pyodbc, sys
server, databases = sys.argv[1], sys.argv[2:]
drivers = sorted(d for d in pyodbc.drivers() if 'SQL Server' in d)
driver = ([d for d in drivers if d.startswith('ODBC Driver')] or drivers)[-1]
c = pyodbc.connect('DRIVER={%s};SERVER=%s;Trusted_Connection=yes;TrustServerCertificate=yes;' % (driver, server), autocommit=True)
login = 'NT AUTHORITY\\SYSTEM'
if not c.execute('select 1 from sys.server_principals where name = ?', login).fetchone():
    c.execute('CREATE LOGIN [NT AUTHORITY\\SYSTEM] FROM WINDOWS')
for db in databases:
    if not c.execute('select 1 from sys.databases where name = ?', db).fetchone():
        print('no database', db); continue
    c.execute('USE [%s]' % db)
    if not c.execute('select 1 from sys.database_principals where name = ?', login).fetchone():
        c.execute('CREATE USER [NT AUTHORITY\\SYSTEM] FOR LOGIN [NT AUTHORITY\\SYSTEM]')
    c.execute('ALTER ROLE db_owner ADD MEMBER [NT AUTHORITY\\SYSTEM]')
    print('SYSTEM owns', db)
"@
$SqlFile = Join-Path $env:TEMP ('nline_watcher_sql_{0}.py' -f [guid]::NewGuid())
try {
    [IO.File]::WriteAllText($SqlFile, $Sql)
    & $Python -I $SqlFile $SqlServer @Databases
    if ($LASTEXITCODE) { throw 'granting SQL Server rights to SYSTEM failed (see above)' }
} finally {
    Remove-Item $SqlFile -ErrorAction SilentlyContinue
}

# The task: every minute, as SYSTEM, one run at a time
$Action = New-ScheduledTaskAction -Execute 'powershell.exe' `
    -Argument ('-NoProfile -ExecutionPolicy Bypass -File "{0}"' -f (Join-Path $Root 'update_watcher.ps1')) `
    -WorkingDirectory $Root
$Trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) `
    -RepetitionInterval (New-TimeSpan -Minutes 1) -RepetitionDuration (New-TimeSpan -Days 3650)
$Settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew `
    -ExecutionTimeLimit (New-TimeSpan -Hours 1) -StartWhenAvailable `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$Principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}
Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger `
    -Settings $Settings -Principal $Principal | Out-Null
Write-Host "Task '$TaskName' registered: it checks $(Join-Path $Root 'requests') every minute."
Write-Host 'Done. Updates asked for from the development PC now run by themselves.'
