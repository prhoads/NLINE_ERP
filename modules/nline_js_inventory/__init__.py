# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.

from trytond.pool import Pool

from . import inventory

__all__ = ['register']


def register():
    Pool.register(
        *inventory.MODELS,
        module='nline_js_inventory', type_='model')
    Pool.register(
        *inventory.WIZARDS,
        module='nline_js_inventory', type_='wizard')
    Pool.register(
        *inventory.REPORTS,
        module='nline_js_inventory', type_='report')
