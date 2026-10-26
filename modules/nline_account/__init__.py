# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.

from trytond.pool import Pool

from . import account


def register():
    Pool.register(
        account.Period,
        account.Party,
        account.Invoice,
        account.TexasReturnStart,
        module='nline_account', type_='model')
    Pool.register(
        account.TexasReturn,
        module='nline_account', type_='wizard')
    Pool.register(
        account.TexasReturnReport,
        module='nline_account', type_='report')
