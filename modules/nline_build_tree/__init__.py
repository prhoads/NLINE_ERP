# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.

from trytond.pool import Pool

from . import build_tree


def register():
    Pool.register(
        build_tree.Production,
        build_tree.Work,
        build_tree.MaterialCard,
        module='nline_build_tree', type_='model')
    Pool.register(
        build_tree.Traveler,
        module='nline_build_tree', type_='report')
