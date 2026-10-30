# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.

from trytond.pool import Pool

from . import (
    accounting, company, desk, menu, planning, purchasing, sales, shopfloor,
    user)


def register():
    Pool.register(
        desk.Configuration,
        desk.ConfigurationAccount,
        desk.PaymentTerm,
        desk.PaymentJournal,
        desk.Desk,
        accounting.DeskAccounting,
        sales.DeskSales,
        purchasing.DeskPurchasing,
        shopfloor.DeskShopfloor,
        planning.DeskPlanning,
        company.DeskCompany,
        menu.SupersededMenu,
        user.User,
        module='nline_desk', type_='model')
