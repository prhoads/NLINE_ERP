# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.
from trytond.pool import PoolMeta


class Invoice(metaclass=PoolMeta):
    __name__ = 'account.invoice'

    def check_number_date(self, date):
        # Customer invoices may be dated before an invoice already numbered
        # as N-Line does in QuickBooks. Numbers stay sequential without gaps
        # and posting into a closed period is still refused.
        pass
