# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.

from trytond.pool import Pool

from . import common

__all__ = ['register']


def register():
    Pool.register(
        *common.MODELS,
        module='nline_js_common', type_='model')
    Pool.register(
        *common.WIZARDS,
        module='nline_js_common', type_='wizard')
    Pool.register(
        *common.REPORTS,
        module='nline_js_common', type_='report')
