# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.

from trytond.pool import Pool

from . import shopfloor

__all__ = ['register']


def register():
    Pool.register(
        *shopfloor.MODELS,
        module='nline_js_shopfloor', type_='model')
    Pool.register(
        *shopfloor.WIZARDS,
        module='nline_js_shopfloor', type_='wizard')
    Pool.register(
        *shopfloor.REPORTS,
        module='nline_js_shopfloor', type_='report')
