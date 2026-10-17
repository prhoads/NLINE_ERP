# Install NLINE ERP on Windows with SQL Server Express

These steps install the Tryton server of NLINE ERP on the Windows computer that
runs SQL Server (2012 Express or later). The commands are typed in a
*Command Prompt* (`cmd.exe`).

## 1. Prerequisites

1. **Python 3.12 (64-bit)** from <https://www.python.org/downloads/windows/>.
   Keep the option *py launcher* checked.
2. **Microsoft ODBC Driver 17 for SQL Server (x64)**, version 17.10, from
   Microsoft's download page *Download ODBC Driver for SQL Server*. Version 17
   is the one tested by Microsoft with SQL Server 2012.
3. **The repository** in `C:\NLINE\src`, either with Git:

       git clone -b us-mssql https://github.com/prhoads/NLINE_ERP.git C:\NLINE\src

   or by downloading the ZIP of the `us-mssql` branch from GitHub and
   extracting it to `C:\NLINE\src`.

## 2. Install the server

    py -3.12 -m venv C:\NLINE\venv
    C:\NLINE\venv\Scripts\python.exe C:\NLINE\src\windows\install.py

`install.py` installs Tryton, the SQL Server driver for Python and the NLINE
modules (US chart of accounts, Texas sales tax, 1099, Chase ACH, Paychex
payroll import, inventory, production, purchase and sale) with their
dependencies.

## 3. Check the server

    cd C:\NLINE
    C:\NLINE\venv\Scripts\python.exe C:\NLINE\src\windows\validate_sqlserver.py --uri "mssql:///?server=localhost\SQLEXPRESS"

The URI without user name connects with your Windows account, which must be
allowed to create databases on SQL Server (it is the case for the account that
installed SQL Server Express). The quick validation takes about one hour and
uses test databases named `nline_validate_*` that are dropped at the end. Add
`--full` to run all the tests (several hours).

Send `C:\NLINE\nline_validation_report.txt` to the developer.

## 4. Create the database

    sqlcmd -S localhost\SQLEXPRESS -E -Q "CREATE DATABASE nline COLLATE Latin1_General_100_CS_AS"
    sqlcmd -S localhost\SQLEXPRESS -E -Q "ALTER DATABASE nline SET ALLOW_SNAPSHOT_ISOLATION ON"
    sqlcmd -S localhost\SQLEXPRESS -E -Q "ALTER DATABASE nline SET READ_COMMITTED_SNAPSHOT ON WITH ROLLBACK IMMEDIATE"

The case-sensitive collation and the snapshot isolation are required by
Tryton.

## 5. Configure

Create `C:\NLINE\trytond.conf`:

    [database]
    uri = mssql:///?server=localhost\SQLEXPRESS
    path = C:\NLINE\filestore

    [web]
    listen = 0.0.0.0:8000

With a SQL Server login instead of the Windows account, the URI is
`mssql://login:password@/?server=localhost\SQLEXPRESS`.

## 6. Initialize the database

    set TRYTONPASSFILE=C:\NLINE\admin_password.txt
    C:\NLINE\venv\Scripts\trytond-admin.exe -c C:\NLINE\trytond.conf -d nline --all --email you@example.com
    C:\NLINE\venv\Scripts\trytond-admin.exe -c C:\NLINE\trytond.conf -d nline -u account_us account_tax_us account_us_1099 account_payment_nacha account_payroll_paychex account_stock_continental product_cost_fifo production_work sale_supply_production purchase_request stock_supply stock_lot --activate-dependencies

`admin_password.txt` contains the password of the `admin` user; delete the
file once the database is initialized.

## 7. Start the server

    C:\NLINE\venv\Scripts\trytond.exe -c C:\NLINE\trytond.conf

## Updating

After updating the repository (`git pull`), run step 2 again and update the
database:

    C:\NLINE\venv\Scripts\trytond-admin.exe -c C:\NLINE\trytond.conf -d nline --all
