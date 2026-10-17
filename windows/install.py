#!/usr/bin/env python3
"""Install the NLINE ERP server (Tryton) from this repository

Run it with the Python of the virtual environment of the server:

    py -3.12 -m venv C:\\NLINE\\venv
    C:\\NLINE\\venv\\Scripts\\python.exe windows\\install.py

The modules of MODULES and their dependencies are installed with pip (not in
editable mode) so the server does not depend on the location of the
repository.
"""
import argparse
import configparser
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODULES_DIR = os.path.join(ROOT, 'modules')

# The modules used by NLINE, their dependencies are added
MODULES = [
    'account_us',
    'account_tax_us',
    'account_us_1099',
    'account_payment_nacha',
    'account_payroll_paychex',
    'account_invoice',
    'account_invoice_stock',
    'account_payment_clearing',
    'account_statement',
    'account_stock_continental',
    'product_cost_fifo',
    'product_cost_history',
    'production',
    'production_routing',
    'production_work',
    'purchase',
    'purchase_request',
    'sale',
    'sale_supply_production',
    'stock',
    'stock_lot',
    'stock_supply',
    ]


def depends(module):
    config = configparser.ConfigParser()
    with open(os.path.join(MODULES_DIR, module, 'tryton.cfg')) as fp:
        config.read_file(fp)
    return [
        m for m in config.get('tryton', 'depends', fallback='').split()
        if m not in {'ir', 'res'}]


def closure(modules):
    "Return the modules with all their dependencies"
    result = []
    todo = list(modules)
    while todo:
        module = todo.pop()
        if module in result:
            continue
        if not os.path.isdir(os.path.join(MODULES_DIR, module)):
            raise SystemExit("Unknown module: %s" % module)
        result.append(module)
        todo.extend(depends(module))
    return sorted(result)


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument('modules', nargs='*', default=MODULES,
        help="the modules to install (default: the NLINE modules)")
    parser.add_argument('--dry-run', action='store_true',
        help="only print the pip command")
    args = parser.parse_args()

    modules = closure(args.modules)
    command = [
        sys.executable, '-m', 'pip', 'install', '--upgrade',
        os.path.join(ROOT, 'trytond') + '[MSSQL]',
        os.path.join(ROOT, 'proteus'),
        # The WSGI server for Windows
        'waitress',
        ] + [os.path.join(MODULES_DIR, m) for m in modules]
    print("Modules (%d): %s" % (len(modules), ' '.join(modules)))
    if args.dry_run:
        print(' '.join(command))
        return
    subprocess.check_call(command)


if __name__ == '__main__':
    main()
