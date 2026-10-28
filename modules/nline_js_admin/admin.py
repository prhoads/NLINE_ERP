# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.
"""Jobshop Accounting, Executive Information and Administration: Accounts, account sets, accounting calendar, account interface, executive information, user and authority manager, system settings, the Jobshop reports, as in VISUAL Jobshop"""
from . import (  # noqa: F401 (the report files register their reports)
    accounting, executive, report_accounting, report_engineering,
    report_inventory, report_purchasing, report_sales, report_shopfloor,
    reports, settings, users)

# The classes this module registers (see __init__.py)
MODELS = [
    accounting.Category,
    accounting.JournalBatch,
    accounting.Move,
    accounting.DeskAccounting,
    settings.Configuration,
    settings.DeskSettings,
    users.DeskUsers,
    executive.DeskExecutive,
    reports.DeskReports,
    ]
WIZARDS = []
REPORTS = []
