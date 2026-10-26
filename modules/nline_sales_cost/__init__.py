# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.

from trytond.pool import Pool

from . import sale


def register():
    Pool.register(
        sale.Configuration,
        sale.Sale,
        module='nline_sales_cost', type_='model')
