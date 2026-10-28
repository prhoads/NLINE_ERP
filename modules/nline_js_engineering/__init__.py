# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.

from trytond.pool import Pool

from . import engineering

__all__ = ['register']


def register():
    Pool.register(
        *engineering.MODELS,
        module='nline_js_engineering', type_='model')
    Pool.register(
        *engineering.WIZARDS,
        module='nline_js_engineering', type_='wizard')
    Pool.register(
        *engineering.REPORTS,
        module='nline_js_engineering', type_='report')
