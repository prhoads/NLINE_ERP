# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.

from trytond.pool import Pool

from . import payroll


def register():
    Pool.register(
        payroll.Mapping,
        payroll.ImportStart,
        payroll.ImportDistribute,
        payroll.ImportDistributeLine,
        module='account_payroll_paychex', type_='model')
    Pool.register(
        payroll.Import,
        module='account_payroll_paychex', type_='wizard')
