# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.

from trytond.pool import Pool

from . import us_1099


def register():
    Pool.register(
        us_1099.Account,
        us_1099.Party,
        us_1099.Threshold,
        us_1099.Amount,
        us_1099.ComputeStart,
        us_1099.ExportStart,
        us_1099.ExportResult,
        module='account_us_1099', type_='model')
    Pool.register(
        us_1099.Compute,
        us_1099.Export,
        module='account_us_1099', type_='wizard')
    Pool.register(
        us_1099.RecipientCopy,
        module='account_us_1099', type_='report')
