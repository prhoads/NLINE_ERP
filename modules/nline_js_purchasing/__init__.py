# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.

from trytond.pool import Pool

from . import purchasing

__all__ = ['register']


def register():
    Pool.register(
        *purchasing.MODELS,
        module='nline_js_purchasing', type_='model')
    Pool.register(
        *purchasing.WIZARDS,
        module='nline_js_purchasing', type_='wizard')
    Pool.register(
        *purchasing.REPORTS,
        module='nline_js_purchasing', type_='report')
