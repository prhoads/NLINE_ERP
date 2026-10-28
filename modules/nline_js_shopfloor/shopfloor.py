# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.
"""Jobshop Shopfloor: Material issues / returns, work order receipts /
returns, shop resources, shop groups, shop views, labor entry, labor data
collection, employees, as in VISUAL Jobshop"""
from . import desk, employee, labor, resource, stock

# The classes this module registers (see __init__.py)
MODELS = [
    resource.WorkCenter,
    resource.ResourceMember,
    resource.ShopView,
    resource.ShopViewResource,
    resource.CalendarWeek,
    resource.CalendarChange,
    employee.Employee,
    employee.EmployeeTime,
    labor.LaborTicket,
    labor.Work,
    stock.Move,
    stock.Production,
    desk.DeskShopfloor,
    ]
WIZARDS = []
REPORTS = []
