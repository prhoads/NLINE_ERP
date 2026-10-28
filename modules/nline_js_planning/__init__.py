# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.

from trytond.pool import Pool

from . import planning

__all__ = ['register']


def register():
    Pool.register(
        *planning.MODELS,
        module='nline_js_planning', type_='model')
    Pool.register(
        *planning.WIZARDS,
        module='nline_js_planning', type_='wizard')
    Pool.register(
        *planning.REPORTS,
        module='nline_js_planning', type_='report')
