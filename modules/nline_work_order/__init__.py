# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.

from trytond.pool import Pool

from . import production


def register():
    Pool.register(
        production.Production,
        production.MaterialCard,
        production.MakeLegStart,
        production.Move,
        production.SaleLine,
        module='nline_work_order', type_='model')
    Pool.register(
        production.MakeLeg,
        module='nline_work_order', type_='wizard')
