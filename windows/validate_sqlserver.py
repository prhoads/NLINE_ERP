#!/usr/bin/env python3
"""Validate the NLINE ERP server (Tryton) on a SQL Server

Run it with the Python of the server after windows\\install.py:

    C:\\NLINE\\venv\\Scripts\\python.exe windows\\validate_sqlserver.py ^
        --uri "mssql:///?server=localhost\\SQLEXPRESS"

The URI without user name uses the Windows account (trusted connection).
The login must be allowed to create databases. The test databases are named
nline_validate_* and they are dropped at the end.

The report is written in nline_validation_report.txt (and the detailed logs
in nline_validation_logs) of the current directory.
"""
import argparse
import datetime
import importlib.metadata
import os
import platform
import subprocess
import sys
import tempfile
import time

# The core tests run in quick mode
CORE_TESTS = [
    'trytond.tests.test_mssql_dialect',
    'trytond.tests.test_backend',
    'trytond.tests.test_sequence',
    'trytond.tests.test_modelsql',
    'trytond.tests.test_modelstorage',
    'trytond.tests.test_history',
    'trytond.tests.test_field_char',
    'trytond.tests.test_field_text',
    'trytond.tests.test_field_numeric',
    'trytond.tests.test_field_date',
    'trytond.tests.test_field_datetime',
    'trytond.tests.test_field_dict',
    'trytond.tests.test_field_many2many',
    'trytond.tests.test_field_one2many',
    'trytond.tests.test_mptt',
    'trytond.tests.test_tree',
    'trytond.tests.test_rule',
    'trytond.tests.test_access',
    ]
# The module tests run in quick mode
QUICK_MODULES = [
    'account_us',
    'account_tax_us',
    'account_us_1099',
    'account_payment_nacha',
    'account_payroll_paychex',
    'product_cost_fifo',
    ]
# The module tests run in full mode
FULL_MODULES = [
    'party', 'company', 'country', 'bank', 'product', 'account',
    'account_invoice', 'account_payment', 'account_payment_clearing',
    'account_statement', 'stock', 'stock_lot', 'purchase', 'sale',
    'production', 'production_routing', 'production_work',
    'product_cost_fifo', 'product_cost_history', 'account_stock_continental',
    'account_invoice_stock', 'sale_supply_production', 'purchase_request',
    'stock_supply', 'account_us', 'account_tax_us', 'account_us_1099',
    'account_payment_nacha', 'account_payroll_paychex',
    ]
PACKAGES = [
    'trytond', 'proteus', 'pyodbc', 'python-sql', 'reportlab', 'pdfminer.six',
    'openpyxl', 'lxml', 'relatorio',
    ]
if platform.system() == 'Windows':
    # Windows has no time zone database
    PACKAGES.append('tzdata')
DATABASE_PREFIX = 'nline_validate_'


class Report:

    def __init__(self, path):
        self.path = path
        self.lines = []
        self.results = []

    def write(self, line=''):
        print(line, flush=True)
        self.lines.append(line)
        self.save()

    def result(self, name, ok, detail=''):
        self.results.append((name, ok))
        self.write('%s  %s%s' % (
                'PASS' if ok else 'FAIL', name,
                (' - ' + detail) if detail else ''))

    def save(self):
        with open(self.path, 'w', encoding='utf-8') as fp:
            fp.write('\n'.join(self.lines) + '\n')


def check_environment(report):
    report.write('== Environment')
    report.write('Python %s (%s) on %s' % (
            platform.python_version(), platform.architecture()[0],
            platform.platform()))
    report.result('Python >= 3.8', sys.version_info >= (3, 8))
    for package in PACKAGES:
        try:
            version = importlib.metadata.version(package)
        except importlib.metadata.PackageNotFoundError:
            version = None
        report.result('package %s' % package, version is not None,
            version or 'not installed')
    try:
        import zoneinfo
        zoneinfo.ZoneInfo('America/Chicago')
        ok = True
    except Exception as exception:
        ok = False
        detail = str(exception)
    else:
        detail = ''
    report.result('time zone America/Chicago', ok, detail)
    try:
        import pyodbc
        drivers = [d for d in pyodbc.drivers() if 'SQL Server' in d]
    except Exception as exception:
        drivers = []
        report.write('pyodbc: %s' % exception)
    report.result('ODBC driver for SQL Server',
        any(d.startswith('ODBC Driver') for d in drivers),
        ', '.join(drivers) or 'none')


def connect_master():
    import pyodbc

    from trytond.backend.mssql.database import Database
    return pyodbc.connect(
        Database._connection_string('master'), autocommit=True, timeout=15)


def check_server(report):
    report.write()
    report.write('== Server')
    try:
        connection = connect_master()
    except Exception as exception:
        report.result('connect to the server', False, str(exception))
        return False
    report.result('connect to the server', True)
    cursor = connection.cursor()
    cursor.execute(
        "SELECT CAST(SERVERPROPERTY('ProductVersion') AS NVARCHAR(128)), "
        "CAST(SERVERPROPERTY('ProductLevel') AS NVARCHAR(128)), "
        "CAST(SERVERPROPERTY('Edition') AS NVARCHAR(128)), "
        "CAST(SERVERPROPERTY('Collation') AS NVARCHAR(128)), "
        "IS_SRVROLEMEMBER('dbcreator'), IS_SRVROLEMEMBER('sysadmin')")
    version, level, edition, collation, dbcreator, sysadmin = cursor.fetchone()
    report.write('SQL Server %s %s %s, collation %s' % (
            version, level, edition, collation))
    major = int(version.split('.')[0])
    report.result('SQL Server 2012 or later', major >= 11,
        'version %s' % version)
    report.result('login can create databases', bool(dbcreator or sysadmin))
    connection.close()
    return major >= 11 and bool(dbcreator or sysadmin)


def drop_databases(report):
    try:
        connection = connect_master()
        cursor = connection.cursor()
        cursor.execute(
            "SELECT name FROM sys.databases WHERE name LIKE ?",
            (DATABASE_PREFIX.replace('_', '[_]') + '%',))
        for name, in cursor.fetchall():
            cursor.execute(
                'ALTER DATABASE "%s" SET SINGLE_USER '
                'WITH ROLLBACK IMMEDIATE' % name)
            cursor.execute('DROP DATABASE "%s"' % name)
        connection.close()
    except Exception as exception:
        report.write('Could not drop the test databases: %s' % exception)


def run_suite(report, name, arguments, uri, logs, timeout):
    "Run the tests in a separate process and return if they passed"
    env = os.environ.copy()
    env['TRYTOND_DATABASE_URI'] = uri
    env['DB_NAME'] = DATABASE_PREFIX + name
    env.pop('TRYTOND_CONFIG', None)
    env.pop('DB_CACHE', None)
    env['PYTHONWARNINGS'] = 'ignore'
    log_path = os.path.join(logs, '%s.log' % name)
    start = time.monotonic()
    with open(log_path, 'w', encoding='utf-8') as log, \
            tempfile.TemporaryDirectory() as cwd:
        try:
            process = subprocess.run(
                [sys.executable, '-m', 'unittest'] + arguments,
                stdout=log, stderr=subprocess.STDOUT, env=env, cwd=cwd,
                timeout=timeout)
            returncode = process.returncode
        except subprocess.TimeoutExpired:
            returncode = None
    duration = time.monotonic() - start
    with open(log_path, encoding='utf-8', errors='replace') as log:
        lines = log.read().splitlines()
    summary = [l for l in lines if l.startswith(('Ran ', 'OK', 'FAILED'))]
    detail = '%ds %s' % (duration, ' '.join(summary[-2:]) if summary
        else 'timeout' if returncode is None else 'no result')
    ok = returncode == 0
    report.result('tests %s' % name, ok, detail)
    if not ok:
        # Add the failures to the report
        failures = []
        for i, line in enumerate(lines):
            if line.startswith(('ERROR: ', 'FAIL: ')):
                failures.append('    ' + line)
            elif ('Error: ' in line or 'Error(' in line) and (
                    line.startswith(('pyodbc', '    pyodbc', 'trytond'))):
                failures.append('      ' + line.strip())
        report.write('\n'.join(failures[:60]))
    drop_databases(report)
    return ok


def module_tests(module):
    import importlib.util
    spec = importlib.util.find_spec('trytond.modules.%s' % module)
    if not spec:
        return None
    directory = os.path.join(spec.submodule_search_locations[0], 'tests')
    top = os.path.dirname(os.path.dirname(os.path.dirname(directory)))
    return ['discover', '-s', directory, '-t', os.path.dirname(top),
        '-p', 'test_*.py']


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument('--uri', required=True,
        help='the database URI, e.g. '
        '"mssql:///?server=localhost\\SQLEXPRESS"')
    parser.add_argument('--full', action='store_true',
        help="run all the core tests and the tests of all the modules "
        "(several hours)")
    parser.add_argument('--report', default='nline_validation_report.txt')
    parser.add_argument('--timeout', type=int, default=4 * 60 * 60,
        help="the maximal duration of a test suite in seconds")
    args = parser.parse_args()

    os.environ['TRYTOND_DATABASE_URI'] = args.uri
    os.environ.pop('TRYTOND_CONFIG', None)
    report = Report(os.path.abspath(args.report))
    logs = os.path.abspath('nline_validation_logs')
    os.makedirs(logs, exist_ok=True)
    report.write('NLINE ERP validation %s (%s mode)' % (
            datetime.datetime.now().isoformat(timespec='seconds'),
            'full' if args.full else 'quick'))
    report.write()
    check_environment(report)
    if not check_server(report):
        report.write()
        report.write('The server checks failed, the tests are not run.')
        return 1

    report.write()
    report.write('== Tests (logs in %s)' % logs)
    drop_databases(report)
    if args.full:
        import trytond.tests
        directory = os.path.dirname(trytond.tests.__file__)
        top = os.path.dirname(os.path.dirname(directory))
        core = ['discover', '-s', directory, '-t', top, '-p', 'test_*.py']
        modules = FULL_MODULES
    else:
        core = CORE_TESTS
        modules = QUICK_MODULES
    run_suite(report, 'core', core, args.uri, logs, args.timeout)
    for module in modules:
        arguments = module_tests(module)
        if arguments is None:
            report.result('tests %s' % module, False, 'module not installed')
            continue
        run_suite(report, module, arguments, args.uri, logs, args.timeout)

    failed = [n for n, ok in report.results if not ok]
    report.write()
    report.write('== Result: %s' % (
            'ALL PASSED' if not failed else
            '%d FAILED: %s' % (len(failed), ', '.join(failed))))
    report.write('Send %s to the developer.' % report.path)
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
