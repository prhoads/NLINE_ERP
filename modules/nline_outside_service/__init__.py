# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.

from trytond.pool import Pool

from . import production, purchase


def register():
    Pool.register(
        production.RoutingStep,
        production.Work,
        production.WorkCycle,
        production.Production,
        purchase.Line,
        purchase.Invoice,
        purchase.AccountMove,
        module='nline_outside_service', type_='model')
