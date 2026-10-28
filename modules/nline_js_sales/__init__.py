# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.

from trytond.pool import Pool

from . import sales

__all__ = ['register']


def register():
    Pool.register(
        *sales.MODELS,
        module='nline_js_sales', type_='model')
    Pool.register(
        *sales.WIZARDS,
        module='nline_js_sales', type_='wizard')
    Pool.register(
        *sales.REPORTS,
        module='nline_js_sales', type_='report')
