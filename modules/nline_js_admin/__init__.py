# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.

from trytond.pool import Pool

from . import admin

__all__ = ['register']


def register():
    Pool.register(
        *admin.MODELS,
        module='nline_js_admin', type_='model')
    Pool.register(
        *admin.WIZARDS,
        module='nline_js_admin', type_='wizard')
    Pool.register(
        *admin.REPORTS,
        module='nline_js_admin', type_='report')
